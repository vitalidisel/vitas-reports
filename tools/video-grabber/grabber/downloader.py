"""הפעלת yt-dlp: זיהוי פלטפורמה, בניית הפקודה, מעקב אחרי ההתקדמות."""

import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

from . import config

log = logging.getLogger("grabber.downloader")

META_SEP = "|~|"
OUT_TEMPLATE = "%(upload_date>%Y-%m-%d|0000-00-00)s %(uploader,channel,uploader_id|unknown)s - %(title).100s [%(id)s].%(ext)s"

# הסדר חשוב: הדפוס הראשון שמתאים מנצח
PLATFORMS = (
    ("youtube_shorts", "YouTube Shorts", os.path.join("YouTube", "Shorts"),
     re.compile(r"(youtube\.com|youtu\.be).*/shorts/", re.I)),
    ("youtube", "YouTube", "YouTube",
     re.compile(r"(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)", re.I)),
    ("tiktok", "TikTok", "TikTok",
     re.compile(r"(^|\.)(tiktok\.com)", re.I)),
    ("instagram", "Instagram", "Instagram",
     re.compile(r"(^|\.)(instagram\.com|instagr\.am|ig\.me)", re.I)),
    ("facebook", "Facebook", "Facebook",
     re.compile(r"(^|\.)(facebook\.com|fb\.watch|fb\.com|m\.facebook\.com)", re.I)),
    ("twitter", "X / Twitter", "Twitter",
     re.compile(r"(^|\.)(twitter\.com|x\.com|t\.co)", re.I)),
)
OTHER = ("other", "אחר", "Other")

URL_RE = re.compile(r"https?://[^\s<>\"']+", re.I)
PROGRESS_RE = re.compile(r"\[download\]\s+(\d{1,3}(?:\.\d+)?)%")
DEST_RE = re.compile(r"\[download\] (?:Destination|Resuming download at)", re.I)


def find_urls(text: str):
    """כל הקישורים בהודעה, בלי כפילויות ובלי סימני פיסוק נדבקים בסוף."""
    seen, out = set(), []
    for raw in URL_RE.findall(text or ""):
        url = raw.rstrip(").,;!?'\"")
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def detect_platform(url: str):
    """מחזיר (key, label, folder) לפי הדומיין של הקישור."""
    try:
        host = re.sub(r"^https?://", "", url, flags=re.I).split("/")[0].split("@")[-1].lower()
    except Exception:
        host = ""
    for key, label, folder, pattern in PLATFORMS:
        target = url if key == "youtube_shorts" else host
        if pattern.search(target):
            return key, label, folder
    return OTHER


@dataclass
class Job:
    url: str
    chat_id: int
    user_id: int
    mode: str = "video"           # "video" | "audio"
    message_id: int = None        # הודעת הסטטוס שמתעדכנת בטלגרם
    platform: tuple = None
    created_at: float = field(default_factory=time.time)
    _process: subprocess.Popen = None
    _cancelled: bool = False

    def cancel(self):
        self._cancelled = True
        proc = self._process
        if proc and proc.poll() is None:
            try:
                proc.terminate()
            except Exception:
                pass


@dataclass
class Result:
    ok: bool
    path: str = ""
    title: str = ""
    uploader: str = ""
    duration: float = 0.0
    size: int = 0
    error: str = ""
    cancelled: bool = False


class MissingYtDlp(Exception):
    pass


def _hhmmss(seconds) -> str:
    try:
        seconds = int(float(seconds))
    except (TypeError, ValueError):
        return ""
    if seconds <= 0:
        return ""
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def human_size(num_bytes) -> str:
    size = float(num_bytes or 0)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.0f} {unit}" if unit in ("B", "KB") else f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"


def duration_text(seconds) -> str:
    return _hhmmss(seconds)


class Downloader:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.ytdlp = config.ytdlp_path()
        self.ffmpeg_dir = config.ffmpeg_dir()

    # ---- תשתית ----

    def ensure_available(self):
        if shutil.which(self.ytdlp) is None and not Path(self.ytdlp).exists():
            raise MissingYtDlp(
                "yt-dlp לא נמצא. הריצי/הרץ את setup.ps1 או התקן ידנית ל-bin\\yt-dlp.exe"
            )

    def self_update(self):
        """עדכון yt-dlp — האתרים משתנים כל הזמן, גרסה ישנה נשברת מהר."""
        try:
            proc = subprocess.run(
                [self.ytdlp, "-U"],
                capture_output=True, text=True, timeout=180,
                creationflags=self._creationflags(),
            )
            out = (proc.stdout or "").strip().splitlines()
            return out[-1] if out else ""
        except Exception as exc:  # עדכון שנכשל אינו סיבה להפיל את הבוט
            log.warning("עדכון yt-dlp נכשל: %s", exc)
            return ""

    def version(self):
        try:
            proc = subprocess.run(
                [self.ytdlp, "--version"],
                capture_output=True, text=True, timeout=60,
                creationflags=self._creationflags(),
            )
            return (proc.stdout or "").strip()
        except Exception:
            return ""

    @staticmethod
    def _creationflags():
        # שלא יקפוץ חלון קונסולה שחור בכל הורדה כשהבוט רץ ברקע בווינדוס
        return getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0

    # ---- הורדה ----

    def target_dir(self, job: Job) -> Path:
        base = Path(self.cfg["download_dir"])
        if self.cfg.get("folder_per_platform", True):
            base = base / job.platform[2]
        return base

    def build_command(self, job: Job, meta_file: str):
        target = self.target_dir(job)
        cmd = [
            self.ytdlp,
            "--no-playlist",
            "--newline",
            "--no-color",
            "--progress",
            "--windows-filenames",
            "--trim-filenames", "150",
            "--retries", "10",
            "--fragment-retries", "10",
            "--socket-timeout", "30",
            "--concurrent-fragments", "4",
            "--no-overwrites",
            "--continue",
            "-P", str(target),
            "-o", OUT_TEMPLATE,
            "--print-to-file",
            "after_move:%(filepath)s" + META_SEP + "%(title|)s" + META_SEP
            + "%(uploader,channel,uploader_id|)s" + META_SEP + "%(duration|0)s",
            meta_file,
        ]
        if self.ffmpeg_dir:
            cmd += ["--ffmpeg-location", self.ffmpeg_dir]
        browser = (self.cfg.get("cookies_from_browser") or "").strip()
        if browser:
            cmd += ["--cookies-from-browser", browser]
        max_mb = int(self.cfg.get("max_filesize_mb") or 0)
        if max_mb > 0:
            cmd += ["--max-filesize", f"{max_mb}M"]
        if job.mode == "audio":
            cmd += ["-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0"]
        else:
            # הווידאו הכי טוב + האודיו הכי טוב, ממוזגים ל-MP4 שמתנגן בכל מקום
            cmd += [
                "-f", "bv*+ba/b",
                "-S", "res,ext:mp4:m4a",
                "--merge-output-format", "mp4",
                "--remux-video", "mp4",
            ]
        cmd.append(job.url)
        return cmd

    def run(self, job: Job, on_progress=None) -> Result:
        self.ensure_available()
        target = self.target_dir(job)
        target.mkdir(parents=True, exist_ok=True)
        fd, meta_file = tempfile.mkstemp(prefix="grabber-", suffix=".txt")
        os.close(fd)
        cmd = self.build_command(job, meta_file)
        log.info("מוריד: %s", job.url)
        log.debug("פקודה: %s", " ".join(cmd))

        tail = []
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                creationflags=self._creationflags(),
            )
        except FileNotFoundError as exc:
            os.unlink(meta_file)
            raise MissingYtDlp(str(exc)) from exc

        job._process = proc
        with proc.stdout as stream:
            self._pump(stream, tail, on_progress)
        proc.wait()
        job._process = None

        meta = self._read_meta(meta_file)
        if job._cancelled:
            return Result(ok=False, cancelled=True, error="ההורדה בוטלה")
        if proc.returncode != 0 and not meta.get("path"):
            return Result(ok=False, error=self._error_text(tail, proc.returncode))
        path = meta.get("path", "")
        if not path or not os.path.exists(path):
            return Result(ok=False, error=self._error_text(tail, proc.returncode))
        return Result(
            ok=True,
            path=path,
            title=meta.get("title") or Path(path).stem,
            uploader=meta.get("uploader", ""),
            duration=meta.get("duration", 0.0),
            size=os.path.getsize(path),
        )

    def _pump(self, stream, tail, on_progress):
        """קריאת הפלט של yt-dlp שורה-שורה ותרגומו לעדכוני התקדמות."""
        stage = "מתחבר"
        last_percent = -1.0
        for line in stream:
            line = line.rstrip()
            if not line:
                continue
            tail.append(line)
            del tail[:-40]
            match = PROGRESS_RE.search(line)
            if match:
                percent = float(match.group(1))
                if on_progress and (percent - last_percent >= 1.0 or percent >= 100):
                    last_percent = percent
                    on_progress("מוריד", percent)
                continue
            new_stage = self._stage_of(line)
            if new_stage and new_stage != stage:
                stage = new_stage
                if on_progress:
                    on_progress(stage, last_percent if last_percent > 0 else 0.0)

    @staticmethod
    def _stage_of(line: str):
        if line.startswith("[Merger]"):
            return "ממזג וידאו ואודיו"
        if line.startswith("[ExtractAudio]"):
            return "ממיר לאודיו"
        if line.startswith("[VideoRemuxer]") or line.startswith("[VideoConvertor]"):
            return "ממיר ל-MP4"
        if DEST_RE.search(line):
            return "מוריד"
        if line.startswith("[info]") or line.startswith("[youtube]") or line.startswith("[generic]"):
            return "מאתר את הסרטון"
        return None

    @staticmethod
    def _read_meta(meta_file: str) -> dict:
        try:
            raw = Path(meta_file).read_text(encoding="utf-8", errors="replace").strip()
        except OSError:
            raw = ""
        finally:
            try:
                os.unlink(meta_file)
            except OSError:
                pass
        if not raw:
            return {}
        # אם ירדו כמה קבצים — לוקחים את האחרון
        parts = raw.splitlines()[-1].split(META_SEP)
        parts += [""] * (4 - len(parts))
        try:
            duration = float(parts[3] or 0)
        except ValueError:
            duration = 0.0
        return {"path": parts[0].strip(), "title": parts[1].strip(),
                "uploader": parts[2].strip(), "duration": duration}

    @staticmethod
    def _error_text(tail, returncode) -> str:
        errors = [ln for ln in tail if "ERROR" in ln or "error" in ln.lower()]
        if errors:
            text = errors[-1]
        elif tail:
            text = tail[-1]
        else:
            text = f"yt-dlp הסתיים עם קוד {returncode}"
        text = text.replace("ERROR: ", "").strip()
        return text[:400]
