#!/usr/bin/env python3
"""video-grabber — בוט טלגרם שמוריד סרטונים מהטלפון ישירות למחשב.

שולחים לבוט קישור (יוטיוב / שורטס / אינסטגרם / פייסבוק / טיקטוק),
והמחשב מוריד את הסרטון ושומר אותו בתיקייה של הפלטפורמה.
"""

import json
import logging
import logging.handlers
import queue
import random
import signal
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from grabber import config
from grabber.downloader import (
    Downloader, Job, MissingYtDlp, detect_platform, duration_text,
    find_urls, human_size,
)
from grabber.telegram import Telegram, TelegramError, escape

log = logging.getLogger("grabber")

POLL_TIMEOUT = 50
EDIT_MIN_INTERVAL = 3.0     # שניות בין עדכוני הודעת התקדמות (מגבלות טלגרם)
EDIT_MIN_DELTA = 3.0        # אחוזים

HELP = """<b>מה אפשר לעשות כאן</b>

שולחים לי קישור — ואני מוריד אותו למחשב.
עובד עם יוטיוב, יוטיוב שורטס, אינסטגרם, פייסבוק וטיקטוק.
הכי נוח: בכל אפליקציה → <b>שיתוף</b> → טלגרם → הצ'אט הזה.
אפשר לשלוח כמה קישורים בהודעה אחת — הם ירדו בזה אחר זה.

<b>פקודות</b>
/mp3 &lt;קישור&gt; — להוריד אודיו בלבד (MP3)
/status — מה יורד עכשיו ומה בתור
/cancel — לבטל את ההורדה הנוכחית ולרוקן את התור
/last — 5 ההורדות האחרונות
/where — לאן נשמרים הקבצים
/cookies chrome|edge|firefox|off — לשימוש בהתחברות מהדפדפן שלך (לתוכן שדורש התחברות)
/help — ההודעה הזו"""


def console_print(text=""):
    """כשהבוט רץ ברקע (pythonw) אין בכלל stdout — ואז פשוט אין למי להדפיס."""
    if sys.stdout is None:
        return
    try:
        print(text, flush=True)
    except (OSError, ValueError):
        pass


def setup_logging():
    config.LOG_DIR.mkdir(parents=True, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    file_handler = logging.handlers.RotatingFileHandler(
        config.LOG_DIR / "grabber.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8"
    )
    file_handler.setFormatter(fmt)
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(file_handler)
    if sys.stdout is not None:
        console = logging.StreamHandler(sys.stdout)
        console.setFormatter(fmt)
        root.addHandler(console)


def load_state() -> dict:
    try:
        return json.loads(config.STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_state(state: dict):
    config.LOG_DIR.mkdir(parents=True, exist_ok=True)
    try:
        config.STATE_PATH.write_text(json.dumps(state), encoding="utf-8")
    except OSError as exc:
        log.warning("שמירת state נכשלה: %s", exc)


def progress_bar(percent: float, width: int = 12) -> str:
    filled = max(0, min(width, int(round(percent / 100 * width))))
    return "▓" * filled + "░" * (width - filled)


def friendly_error(raw: str) -> str:
    """תרגום שגיאות של yt-dlp למשהו שאפשר לעשות איתו משהו."""
    low = (raw or "").lower()
    if "login required" in low or "log in" in low or "cookies" in low or "rate-limit" in low:
        return ("התוכן דורש התחברות. שלח/י <code>/cookies chrome</code> "
                "(או edge / firefox) כדי שאשתמש בהתחברות מהדפדפן במחשב, ואז נסה/י שוב.")
    if "private" in low:
        return "הפוסט פרטי — אין גישה אליו מהחשבון שמחובר במחשב."
    if "unsupported url" in low:
        return "הקישור הזה לא נתמך. אם זה קישור לעמוד ולא לסרטון — שלח/י את הקישור הישיר לסרטון."
    if "video unavailable" in low or "not available" in low:
        return "הסרטון לא זמין (נמחק, הוגבל למדינה או שהוסר)."
    if "age" in low and "confirm" in low:
        return "הסרטון מוגבל בגיל. <code>/cookies chrome</code> יאפשר לי להשתמש בהתחברות מהדפדפן."
    if "max-filesize" in low or "larger than" in low:
        return "הקובץ גדול מהמגבלה שהוגדרה ב-config.json (max_filesize_mb)."
    if "ffmpeg" in low:
        return "חסר ffmpeg. הריצו שוב את setup.ps1 במחשב."
    return ""


class Bot:
    def __init__(self, cfg: dict, tg: Telegram, downloader: Downloader):
        self.cfg = cfg
        self.tg = tg
        self.dl = downloader
        self.queue = queue.Queue()
        self.current = None
        self.lock = threading.Lock()
        self.stopping = threading.Event()
        self.pairing_code = None
        if not cfg["allowed_user_ids"]:
            self.pairing_code = f"{random.randint(100000, 999999)}"

    # ---------- הרשאות ----------

    def authorized(self, user_id: int) -> bool:
        return user_id in self.cfg["allowed_user_ids"]

    def try_pairing(self, user_id: int, chat_id: int, text: str) -> bool:
        if not self.pairing_code:
            return False
        if text.strip() != self.pairing_code:
            self.tg.send_message(chat_id, "כדי להתחבר שלח/י את קוד הצימוד שמופיע בחלון של המחשב.")
            return True
        self.cfg["allowed_user_ids"].append(user_id)
        config.save(self.cfg)
        self.pairing_code = None
        log.info("משתמש %s צומד לבוט", user_id)
        self.tg.send_message(chat_id, "✅ מחובר! מעכשיו אפשר פשוט לשלוח לי קישורים.\n\n" + HELP)
        return True

    # ---------- קליטת הודעות ----------

    def handle_update(self, update: dict):
        msg = update.get("message")
        if not msg:
            return
        chat_id = msg["chat"]["id"]
        user_id = (msg.get("from") or {}).get("id")
        text = msg.get("text") or msg.get("caption") or ""
        if not user_id:
            return
        if not self.authorized(user_id):
            if self.try_pairing(user_id, chat_id, text):
                return
            log.warning("הודעה ממשתמש לא מורשה: %s", user_id)
            self.tg.send_message(chat_id, f"אין לך הרשאה לבוט הזה.\nה-ID שלך: <code>{user_id}</code>")
            return
        if text.startswith("/"):
            self.handle_command(chat_id, user_id, text)
            return
        self.enqueue_urls(chat_id, user_id, text, self.cfg["default_format"])

    def handle_command(self, chat_id, user_id, text):
        parts = text.split(maxsplit=1)
        cmd = parts[0].split("@")[0].lower()
        rest = parts[1] if len(parts) > 1 else ""
        if cmd in ("/start", "/help"):
            self.tg.send_message(chat_id, HELP)
        elif cmd == "/mp3":
            self.enqueue_urls(chat_id, user_id, rest, "audio")
        elif cmd == "/status":
            self.tg.send_message(chat_id, self.status_text())
        elif cmd == "/cancel":
            self.tg.send_message(chat_id, self.cancel_all())
        elif cmd == "/last":
            self.tg.send_message(chat_id, self.history_text())
        elif cmd == "/where":
            base = self.cfg["download_dir"]
            per = "כן" if self.cfg.get("folder_per_platform", True) else "לא"
            self.tg.send_message(
                chat_id,
                f"📁 הקבצים נשמרים ב:\n<code>{escape(base)}</code>\n"
                f"תיקייה נפרדת לכל פלטפורמה: {per}",
            )
        elif cmd == "/cookies":
            self.tg.send_message(chat_id, self.set_cookies(rest.strip().lower()))
        elif cmd == "/id":
            self.tg.send_message(chat_id, f"ה-ID שלך: <code>{user_id}</code>")
        else:
            self.tg.send_message(chat_id, "לא מכיר את הפקודה הזו. /help")

    def enqueue_urls(self, chat_id, user_id, text, mode):
        urls = find_urls(text)
        if not urls:
            self.tg.send_message(chat_id, "לא מצאתי קישור בהודעה. שלח/י קישור לסרטון, או /help.")
            return
        for url in urls:
            job = Job(url=url, chat_id=chat_id, user_id=user_id, mode=mode)
            job.platform = detect_platform(url)
            waiting = self.queue.qsize() + (1 if self.current else 0)
            kind = "🎵 MP3" if mode == "audio" else "🎬 וידאו"
            position = f"\nבתור: מקום {waiting}" if waiting else ""
            job.message_id = self.tg.send_message(
                chat_id,
                f"⏳ התקבל — {escape(job.platform[1])} · {kind}\n"
                f"<code>{escape(url)}</code>{position}",
            )
            self.queue.put(job)
            log.info("נוסף לתור: %s (%s)", url, mode)

    # ---------- פקודות מידע ----------

    def status_text(self) -> str:
        with self.lock:
            current = self.current
        pending = self.queue.qsize()
        if not current and not pending:
            return "אין הורדות פעילות. שלח/י קישור ונתחיל 🙂"
        lines = []
        if current:
            lines.append(f"⬇️ עכשיו: {escape(current.platform[1])}\n<code>{escape(current.url)}</code>")
        if pending:
            lines.append(f"⏳ בתור: {pending}")
        return "\n\n".join(lines)

    def cancel_all(self) -> str:
        cancelled = 0
        while True:
            try:
                job = self.queue.get_nowait()
            except queue.Empty:
                break
            cancelled += 1
            if job.message_id:
                self.tg.edit_message(job.chat_id, job.message_id, "🚫 בוטל לפני שהתחיל")
            self.queue.task_done()
        with self.lock:
            current = self.current
        if current:
            current.cancel()
            return f"🚫 מבטל את ההורדה הנוכחית ועוד {cancelled} בתור."
        if cancelled:
            return f"🚫 בוטלו {cancelled} הורדות מהתור."
        return "אין מה לבטל."

    def history_text(self) -> str:
        try:
            lines = config.HISTORY_PATH.read_text(encoding="utf-8").splitlines()[-5:]
        except OSError:
            return "עוד לא ירד כלום."
        if not lines:
            return "עוד לא ירד כלום."
        out = ["<b>ההורדות האחרונות</b>"]
        for line in reversed(lines):
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            when = time.strftime("%d/%m %H:%M", time.localtime(item.get("at", 0)))
            if item.get("ok"):
                out.append(f"✅ {when} · {escape(item.get('platform', ''))}\n"
                           f"{escape(item.get('title', ''))}\n<code>{escape(item.get('path', ''))}</code>")
            else:
                out.append(f"❌ {when} · {escape(item.get('platform', ''))}\n{escape(item.get('error', ''))}")
        return "\n\n".join(out)

    def set_cookies(self, value: str) -> str:
        allowed = ("chrome", "edge", "firefox", "brave", "opera", "vivaldi", "safari")
        if value in ("off", "none", ""):
            self.cfg["cookies_from_browser"] = ""
            config.save(self.cfg)
            return "בוטל השימוש בקוקיז מהדפדפן."
        if value not in allowed:
            return "דפדפנים אפשריים: " + ", ".join(allowed) + " או off"
        self.cfg["cookies_from_browser"] = value
        config.save(self.cfg)
        return (f"מעכשיו אשתמש בהתחברות מ-{value} שבמחשב.\n"
                "שימו לב: צריך שהדפדפן יהיה סגור בזמן ההורדה כדי שיוכל לקרוא את הקוקיז.")

    # ---------- עובד ההורדות ----------

    def worker(self):
        while not self.stopping.is_set():
            try:
                job = self.queue.get(timeout=1)
            except queue.Empty:
                continue
            if job is None:
                break
            with self.lock:
                self.current = job
            try:
                self.process(job)
            except MissingYtDlp as exc:
                self.fail(job, str(exc))
            except Exception as exc:  # הורדה אחת שנופלת לא מפילה את הבוט
                log.exception("שגיאה בהורדה")
                self.fail(job, f"שגיאה לא צפויה: {exc}")
            finally:
                with self.lock:
                    self.current = None
                self.queue.task_done()

    def process(self, job: Job):
        last_edit = [0.0]
        last_percent = [-100.0]
        header = f"{escape(job.platform[1])} · {'🎵 MP3' if job.mode == 'audio' else '🎬 וידאו'}"

        def on_progress(stage, percent):
            # טלגרם חוסם עריכות תכופות, ולכן מעדכנים לאט: לא יותר מפעם ב-3 שניות
            now = time.time()
            if now - last_edit[0] < EDIT_MIN_INTERVAL:
                return
            if percent < 100 and abs(percent - last_percent[0]) < EDIT_MIN_DELTA:
                return
            last_edit[0] = now
            last_percent[0] = percent
            bar = progress_bar(percent)
            self.tg.edit_message(
                job.chat_id, job.message_id,
                f"⬇️ {stage} — {header}\n<code>{bar} {percent:.0f}%</code>\n"
                f"<code>{escape(job.url)}</code>",
            )

        self.tg.edit_message(job.chat_id, job.message_id, f"⬇️ מתחיל — {header}\n<code>{escape(job.url)}</code>")
        result = self.dl.run(job, on_progress=on_progress)
        if result.cancelled:
            self.fail(job, "בוטל", cancelled=True)
            return
        if not result.ok:
            self.fail(job, result.error)
            return
        meta = []
        if result.uploader:
            meta.append(f"👤 {escape(result.uploader)}")
        length = duration_text(result.duration)
        if length:
            meta.append(f"⏱ {length}")
        meta.append(f"💾 {human_size(result.size)}")
        text = (
            f"✅ נשמר במחשב — {header}\n"
            f"<b>{escape(result.title)}</b>\n"
            f"{' · '.join(meta)}\n"
            f"📁 <code>{escape(result.path)}</code>"
        )
        self.tg.edit_message(job.chat_id, job.message_id, text)
        self.write_history(job, ok=True, path=result.path, title=result.title)
        log.info("הושלם: %s", result.path)

    def fail(self, job: Job, error="", cancelled=False):
        icon = "🚫" if cancelled else "❌"
        hint = "" if cancelled else friendly_error(error)
        text = f"{icon} {escape(job.platform[1])}\n<code>{escape(job.url)}</code>\n\n{escape(error)}"
        if hint:
            text += f"\n\n💡 {hint}"
        self.tg.edit_message(job.chat_id, job.message_id, text)
        self.write_history(job, ok=False, error=error)
        log.error("נכשל: %s — %s", job.url, error)

    def write_history(self, job: Job, ok: bool, path="", title="", error=""):
        record = {
            "at": time.time(), "url": job.url, "platform": job.platform[1],
            "mode": job.mode, "ok": ok, "path": path, "title": title, "error": error,
        }
        try:
            config.LOG_DIR.mkdir(parents=True, exist_ok=True)
            with config.HISTORY_PATH.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(record, ensure_ascii=False) + "\n")
            self.trim_history()
        except OSError as exc:
            log.warning("כתיבת היסטוריה נכשלה: %s", exc)

    def trim_history(self):
        limit = int(self.cfg.get("history_size") or 500)
        try:
            lines = config.HISTORY_PATH.read_text(encoding="utf-8").splitlines()
        except OSError:
            return
        if len(lines) > limit * 2:
            config.HISTORY_PATH.write_text("\n".join(lines[-limit:]) + "\n", encoding="utf-8")

    # ---------- לולאה ראשית ----------

    def run(self):
        me = self.tg.get_me()
        log.info("מחובר לבוט @%s", me.get("username"))
        version = self.dl.version()
        if version:
            log.info("yt-dlp גרסה %s", version)
        if self.cfg.get("auto_update_ytdlp", True):
            updated = self.dl.self_update()
            if updated:
                log.info("%s", updated)
        Path(self.cfg["download_dir"]).mkdir(parents=True, exist_ok=True)
        log.info("הקבצים יישמרו ב: %s", self.cfg["download_dir"])
        if self.pairing_code:
            log.warning("ממתין לצימוד. קוד: %s", self.pairing_code)
            console_print("\n" + "=" * 56)
            console_print("  עדיין לא מחובר טלפון.")
            console_print(f"  פתח/י בטלגרם את @{me.get('username')} ושלח/י את הקוד:")
            console_print(f"\n            {self.pairing_code}\n")
            console_print("=" * 56 + "\n")

        worker = threading.Thread(target=self.worker, name="downloader", daemon=True)
        worker.start()

        state = load_state()
        offset = state.get("offset")
        idle_errors = 0
        while not self.stopping.is_set():
            try:
                updates = self.tg.get_updates(offset=offset, poll_timeout=POLL_TIMEOUT) or []
                idle_errors = 0
            except TelegramError as exc:
                if exc.code == 401:
                    log.error("הטוקן שגוי או נמחק. עדכנו bot_token ב-config.json")
                    return 1
                idle_errors += 1
                wait = min(60, 2 ** min(idle_errors, 5))
                log.warning("קריאה לטלגרם נכשלה (%s) — מנסה שוב בעוד %ss", exc, wait)
                self.stopping.wait(wait)
                continue
            for update in updates:
                offset = update["update_id"] + 1
                try:
                    self.handle_update(update)
                except TelegramError as exc:
                    log.warning("טיפול בהודעה נכשל: %s", exc)
                except Exception:
                    log.exception("שגיאה בטיפול בהודעה")
            if updates:
                save_state({"offset": offset})
        return 0

    def stop(self, *_):
        if self.stopping.is_set():
            return
        log.info("סוגר…")
        self.stopping.set()
        with self.lock:
            if self.current:
                self.current.cancel()


def main():
    setup_logging()
    try:
        cfg = config.load()
    except config.ConfigError as exc:
        log.error("%s", exc)
        return 1
    if not cfg["bot_token"]:
        log.error("חסר bot_token. הריצו setup.ps1 או ערכו את config.json ידנית.")
        return 1
    downloader = Downloader(cfg)
    try:
        downloader.ensure_available()
    except MissingYtDlp as exc:
        log.error("%s", exc)
        return 1
    bot = Bot(cfg, Telegram(cfg["bot_token"]), downloader)
    signal.signal(signal.SIGINT, bot.stop)
    signal.signal(signal.SIGTERM, bot.stop)
    try:
        return bot.run()
    except KeyboardInterrupt:
        bot.stop()
        return 0


if __name__ == "__main__":
    sys.exit(main())
