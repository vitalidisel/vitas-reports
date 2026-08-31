#!/usr/bin/env python3
"""בדיקות אופליין — בלי רשת, בלי טלגרם אמיתי ובלי yt-dlp אמיתי.

הרצה:  python3 tests/test_grabber.py
"""
import json
import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from grabber import config, downloader  # noqa: E402
from grabber.downloader import Downloader, Job, detect_platform, find_urls  # noqa: E402

FAKE = str(ROOT / "tests" / "fake_ytdlp.py")


def make_cfg(tmpdir, **over):
    cfg = dict(config.DEFAULTS)
    cfg["download_dir"] = str(tmpdir)
    cfg.update(over)
    return cfg


def make_job(url="https://www.youtube.com/watch?v=abc", mode="video"):
    job = Job(url=url, chat_id=1, user_id=2, mode=mode, message_id=10)
    job.platform = detect_platform(url)
    return job


class TestParsing(unittest.TestCase):
    def test_find_urls(self):
        text = "תראה (https://youtu.be/aA1?t=3), וגם https://vm.tiktok.com/ZM1/ https://youtu.be/aA1?t=3"
        self.assertEqual(find_urls(text), ["https://youtu.be/aA1?t=3", "https://vm.tiktok.com/ZM1/"])
        self.assertEqual(find_urls(""), [])
        self.assertEqual(find_urls("בלי קישורים כאן"), [])

    def test_detect_platform(self):
        cases = {
            "https://www.youtube.com/shorts/xY": "YouTube Shorts",
            "https://m.youtube.com/watch?v=xY": "YouTube",
            "https://youtu.be/xY": "YouTube",
            "https://www.tiktok.com/@user/video/123": "TikTok",
            "https://vm.tiktok.com/ZM1/": "TikTok",
            "https://www.instagram.com/reel/xY/": "Instagram",
            "https://fb.watch/xY/": "Facebook",
            "https://www.facebook.com/watch/?v=1": "Facebook",
            "https://x.com/u/status/1": "X / Twitter",
            "https://example.com/clip.mp4": "אחר",
        }
        for url, label in cases.items():
            self.assertEqual(detect_platform(url)[1], label, url)

    def test_shorts_folder_is_under_youtube(self):
        self.assertEqual(detect_platform("https://youtube.com/shorts/x")[2],
                         os.path.join("YouTube", "Shorts"))

    def test_helpers(self):
        self.assertEqual(downloader.human_size(1024 * 1024 * 3), "3.0 MB")
        self.assertEqual(downloader.duration_text(95), "1:35")
        self.assertEqual(downloader.duration_text(3725), "1:02:05")
        self.assertEqual(downloader.duration_text(None), "")


class TestCommand(unittest.TestCase):
    def test_video_command(self):
        with tempfile.TemporaryDirectory() as tmp:
            dl = Downloader(make_cfg(tmp, max_filesize_mb=500, cookies_from_browser="chrome"))
            cmd = dl.build_command(make_job(), "/tmp/meta.txt")
            self.assertIn("--merge-output-format", cmd)
            self.assertEqual(cmd[cmd.index("--merge-output-format") + 1], "mp4")
            self.assertEqual(cmd[cmd.index("--max-filesize") + 1], "500M")
            self.assertEqual(cmd[cmd.index("--cookies-from-browser") + 1], "chrome")
            self.assertEqual(cmd[cmd.index("-P") + 1], os.path.join(tmp, "YouTube"))
            self.assertEqual(cmd[-1], "https://www.youtube.com/watch?v=abc")

    def test_audio_command(self):
        with tempfile.TemporaryDirectory() as tmp:
            dl = Downloader(make_cfg(tmp))
            cmd = dl.build_command(make_job(mode="audio"), "/tmp/meta.txt")
            self.assertIn("-x", cmd)
            self.assertEqual(cmd[cmd.index("--audio-format") + 1], "mp3")
            self.assertNotIn("--merge-output-format", cmd)
            self.assertNotIn("--max-filesize", cmd)
            self.assertNotIn("--cookies-from-browser", cmd)

    def test_flat_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            dl = Downloader(make_cfg(tmp, folder_per_platform=False))
            cmd = dl.build_command(make_job(), "/tmp/meta.txt")
            self.assertEqual(cmd[cmd.index("-P") + 1], tmp)


class TestDownload(unittest.TestCase):
    def run_fake(self, mode="ok", job=None):
        os.environ["FAKE_MODE"] = mode
        tmp = tempfile.mkdtemp()
        dl = Downloader(make_cfg(tmp))
        dl.ytdlp = FAKE
        events = []
        result = dl.run(job or make_job(), on_progress=lambda s, p: events.append((s, p)))
        return result, events, tmp

    def test_success(self):
        result, events, tmp = self.run_fake()
        self.assertTrue(result.ok, result.error)
        self.assertEqual(result.title, "מודעת קמפיין")
        self.assertEqual(result.uploader, "Vitas Marketing")
        self.assertAlmostEqual(result.duration, 95.4)
        self.assertEqual(result.size, 1024 * 1024)
        self.assertTrue(os.path.exists(result.path))
        self.assertEqual(Path(result.path).parent, Path(tmp) / "YouTube")
        self.assertTrue(any(p >= 100 for _, p in events), events)

    def test_error_is_reported(self):
        result, _, _ = self.run_fake(mode="error")
        self.assertFalse(result.ok)
        self.assertIn("login required", result.error)

    def test_cancel_stops_the_download(self):
        os.environ["FAKE_MODE"] = "slow"
        tmp = tempfile.mkdtemp()
        dl = Downloader(make_cfg(tmp))
        dl.ytdlp = FAKE
        job = make_job()
        threading.Timer(0.5, job.cancel).start()
        result = dl.run(job)
        self.assertFalse(result.ok)
        self.assertTrue(result.cancelled)

    def test_meta_file_is_cleaned_up(self):
        before = set(Path(tempfile.gettempdir()).glob("grabber-*.txt"))
        self.run_fake()
        after = set(Path(tempfile.gettempdir()).glob("grabber-*.txt"))
        self.assertEqual(before, after)


class TestConfig(unittest.TestCase):
    def test_roundtrip_and_defaults(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = config.CONFIG_PATH
            config.CONFIG_PATH = Path(tmp) / "config.json"
            try:
                config.save({"bot_token": "t", "allowed_user_ids": [5], "download_dir": "",
                             "default_format": "nonsense"})
                cfg = config.load()
                self.assertEqual(cfg["bot_token"], "t")
                self.assertEqual(cfg["allowed_user_ids"], [5])
                self.assertEqual(cfg["default_format"], "video")   # ערך לא חוקי חוזר לברירת מחדל
                self.assertTrue(cfg["download_dir"])               # מתמלא לבד
                self.assertTrue(cfg["folder_per_platform"])
                saved = json.loads(config.CONFIG_PATH.read_text(encoding="utf-8"))
                self.assertEqual(set(saved), set(config.DEFAULTS))
            finally:
                config.CONFIG_PATH = original


class FakeTelegram:
    def __init__(self):
        self.sent, self.edits = [], []

    def send_message(self, chat_id, text, reply_to=None, preview=False):
        self.sent.append(text)
        return len(self.sent)

    def edit_message(self, chat_id, message_id, text):
        self.edits.append(text)
        return True


class TestBotFlow(unittest.TestCase):
    def setUp(self):
        sys.path.insert(0, str(ROOT))
        import bot as bot_module
        self.bot_module = bot_module
        self.tmp = tempfile.mkdtemp()
        self.log_dir = Path(self.tmp) / "logs"
        config.LOG_DIR = self.log_dir
        config.HISTORY_PATH = self.log_dir / "history.jsonl"
        config.STATE_PATH = self.log_dir / "state.json"
        self.cfg = make_cfg(self.tmp, allowed_user_ids=[42])
        self.tg = FakeTelegram()
        dl = Downloader(self.cfg)
        dl.ytdlp = FAKE
        self.bot = bot_module.Bot(self.cfg, self.tg, dl)
        os.environ["FAKE_MODE"] = "ok"

    def update(self, text, user_id=42):
        return {"update_id": 1, "message": {"chat": {"id": 7}, "from": {"id": user_id}, "text": text}}

    def test_link_downloads_and_writes_history(self):
        self.bot.handle_update(self.update("שווה לראות https://www.tiktok.com/@a/video/1"))
        self.assertEqual(self.bot.queue.qsize(), 1)
        job = self.bot.queue.get()
        self.bot.process(job)
        self.assertIn("נשמר במחשב", self.tg.edits[-1])
        self.assertIn("TikTok", self.tg.edits[-1])
        history = config.HISTORY_PATH.read_text(encoding="utf-8").strip().splitlines()
        self.assertEqual(len(history), 1)
        self.assertTrue(json.loads(history[0])["ok"])

    def test_failure_adds_hint(self):
        os.environ["FAKE_MODE"] = "error"
        self.bot.handle_update(self.update("https://www.instagram.com/reel/x/"))
        self.bot.process(self.bot.queue.get())
        self.assertIn("/cookies chrome", self.tg.edits[-1])
        self.assertFalse(json.loads(config.HISTORY_PATH.read_text(encoding="utf-8").strip())["ok"])

    def test_two_urls_two_jobs(self):
        self.bot.handle_update(self.update("https://youtu.be/a https://youtu.be/b"))
        self.assertEqual(self.bot.queue.qsize(), 2)

    def test_mp3_command(self):
        self.bot.handle_update(self.update("/mp3 https://youtu.be/a"))
        self.assertEqual(self.bot.queue.get().mode, "audio")

    def test_message_without_url(self):
        self.bot.handle_update(self.update("היי"))
        self.assertEqual(self.bot.queue.qsize(), 0)
        self.assertIn("לא מצאתי קישור", self.tg.sent[-1])

    def test_unauthorized_user_is_blocked(self):
        self.bot.pairing_code = None
        self.bot.handle_update(self.update("https://youtu.be/a", user_id=999))
        self.assertEqual(self.bot.queue.qsize(), 0)
        self.assertIn("אין לך הרשאה", self.tg.sent[-1])

    def test_pairing_registers_user(self):
        original = config.CONFIG_PATH
        config.CONFIG_PATH = Path(self.tmp) / "config.json"
        try:
            self.cfg["allowed_user_ids"] = []
            self.bot.pairing_code = "123456"
            self.bot.handle_update(self.update("123456", user_id=999))
            self.assertIn(999, self.cfg["allowed_user_ids"])
            self.assertIsNone(self.bot.pairing_code)
        finally:
            config.CONFIG_PATH = original

    def test_cookies_command(self):
        original = config.CONFIG_PATH
        config.CONFIG_PATH = Path(self.tmp) / "config.json"
        try:
            self.bot.handle_update(self.update("/cookies chrome"))
            self.assertEqual(self.cfg["cookies_from_browser"], "chrome")
            self.bot.handle_update(self.update("/cookies off"))
            self.assertEqual(self.cfg["cookies_from_browser"], "")
            self.bot.handle_update(self.update("/cookies netscape"))
            self.assertIn("דפדפנים אפשריים", self.tg.sent[-1])
        finally:
            config.CONFIG_PATH = original

    def test_cancel_empties_queue(self):
        self.bot.handle_update(self.update("https://youtu.be/a https://youtu.be/b"))
        self.assertIn("בוטלו 2", self.bot.cancel_all())
        self.assertEqual(self.bot.queue.qsize(), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
