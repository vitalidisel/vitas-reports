"""טעינה ושמירה של ההגדרות (config.json) + נתיבים קבועים של הכלי."""

import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.json"
BIN_DIR = ROOT / "bin"
LOG_DIR = ROOT / "logs"
HISTORY_PATH = ROOT / "logs" / "history.jsonl"
STATE_PATH = ROOT / "logs" / "state.json"

DEFAULTS = {
    # הטוקן שקיבלת מ-@BotFather
    "bot_token": "",
    # מי מורשה להשתמש בבוט. ריק = מצב צימוד (pairing) בהרצה הראשונה
    "allowed_user_ids": [],
    # לאן נשמרים הקבצים
    "download_dir": "",
    # תיקייה נפרדת לכל פלטפורמה (YouTube / TikTok / Instagram / Facebook / Other)
    "folder_per_platform": True,
    # "video" (MP4 באיכות מקסימלית) או "audio" (MP3)
    "default_format": "video",
    # "" | "chrome" | "edge" | "firefox" | "brave" — לקוקיז מהדפדפן (תוכן שדורש התחברות)
    "cookies_from_browser": "",
    # 0 = בלי הגבלה. אחרת דילוג על קבצים גדולים מ-X מגה
    "max_filesize_mb": 0,
    # כמה הורדות אחרונות לזכור ב-/last
    "history_size": 500,
    # עדכון אוטומטי של yt-dlp בעלייה של הבוט
    "auto_update_ytdlp": True,
}


class ConfigError(Exception):
    pass


def default_download_dir() -> str:
    """ברירת המחדל: תיקיית הווידאו של המשתמש."""
    if sys.platform == "win32":
        base = Path(os.environ.get("USERPROFILE", Path.home())) / "Videos"
    elif sys.platform == "darwin":
        base = Path.home() / "Movies"
    else:
        base = Path.home() / "Videos"
    return str(base / "Downloads")


def load() -> dict:
    cfg = dict(DEFAULTS)
    if CONFIG_PATH.exists():
        try:
            raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8-sig"))
        except json.JSONDecodeError as exc:
            raise ConfigError(f"קובץ ההגדרות {CONFIG_PATH} אינו JSON תקין: {exc}") from exc
        if not isinstance(raw, dict):
            raise ConfigError(f"קובץ ההגדרות {CONFIG_PATH} אמור להכיל אובייקט JSON")
        cfg.update({k: v for k, v in raw.items() if k in DEFAULTS})
    if not cfg["download_dir"]:
        cfg["download_dir"] = default_download_dir()
    cfg["allowed_user_ids"] = [int(x) for x in (cfg["allowed_user_ids"] or [])]
    if cfg["default_format"] not in ("video", "audio"):
        cfg["default_format"] = "video"
    return cfg


def save(cfg: dict) -> None:
    """כתיבה אטומית — כדי שלא נשאר קובץ הגדרות חצי-כתוב אם משהו נופל באמצע."""
    data = {k: cfg.get(k, DEFAULTS[k]) for k in DEFAULTS}
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(CONFIG_PATH.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
        os.replace(tmp, CONFIG_PATH)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def ytdlp_path() -> str:
    """yt-dlp מהתיקייה bin/ אם הותקן שם, אחרת מה-PATH."""
    for name in ("yt-dlp.exe", "yt-dlp"):
        candidate = BIN_DIR / name
        if candidate.exists():
            return str(candidate)
    return "yt-dlp.exe" if sys.platform == "win32" else "yt-dlp"


def ffmpeg_dir() -> str:
    """התיקייה שבה יושב ffmpeg (ריק = לסמוך על ה-PATH)."""
    for name in ("ffmpeg.exe", "ffmpeg"):
        if (BIN_DIR / name).exists():
            return str(BIN_DIR)
    return ""
