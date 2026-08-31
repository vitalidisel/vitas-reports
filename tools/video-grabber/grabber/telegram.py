"""לקוח מינימלי ל-Telegram Bot API — ספריות סטנדרט בלבד, בלי pip install."""

import json
import logging
import socket
import time
import urllib.error
import urllib.parse
import urllib.request

log = logging.getLogger("grabber.telegram")

API_ROOT = "https://api.telegram.org/bot{token}/{method}"


class TelegramError(Exception):
    def __init__(self, message, code=None, retry_after=None):
        super().__init__(message)
        self.code = code
        self.retry_after = retry_after


def escape(text) -> str:
    """הברחת תווים ל-parse_mode=HTML."""
    return (
        str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )


class Telegram:
    def __init__(self, token: str):
        if not token:
            raise TelegramError("חסר bot_token בהגדרות")
        self._token = token

    def _call(self, method: str, params: dict, timeout: int):
        payload = {}
        for key, value in params.items():
            if value is None:
                continue
            payload[key] = json.dumps(value) if isinstance(value, (dict, list, bool)) else value
        data = urllib.parse.urlencode(payload).encode("utf-8")
        url = API_ROOT.format(token=self._token, method=method)
        req = urllib.request.Request(url, data=data)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            try:
                body = json.loads(exc.read().decode("utf-8"))
            except Exception:
                raise TelegramError(f"{method}: HTTP {exc.code}", code=exc.code) from exc
            raise TelegramError(
                f"{method}: {body.get('description', 'שגיאה לא ידועה')}",
                code=body.get("error_code", exc.code),
                retry_after=(body.get("parameters") or {}).get("retry_after"),
            ) from exc
        except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError) as exc:
            raise TelegramError(f"{method}: תקלת רשת ({exc})") from exc
        if not body.get("ok"):
            raise TelegramError(f"{method}: {body.get('description')}", code=body.get("error_code"))
        return body.get("result")

    def call(self, method: str, _timeout: int = 30, _retries: int = 3, **params):
        """קריאה עם ניסיונות חוזרים על תקלות רשת ועל 429 (rate limit).

        פרמטרים של הבוט עוברים ב-**params; מה שמתחיל בקו תחתון הוא של הלקוח עצמו
        (כדי שלא יתנגש עם פרמטר בשם timeout של getUpdates).
        """
        delay = 2
        for attempt in range(1, _retries + 1):
            try:
                return self._call(method, params, _timeout)
            except TelegramError as exc:
                fatal = exc.code in (400, 401, 403, 404) and not exc.retry_after
                if fatal or attempt == _retries:
                    raise
                wait = exc.retry_after or delay
                log.warning("%s נכשל (%s) — ניסיון חוזר בעוד %ss", method, exc, wait)
                time.sleep(wait)
                delay = min(delay * 2, 30)
        return None

    # ---- מתודות נוחות ----

    def get_me(self):
        return self.call("getMe", _timeout=20)

    def get_updates(self, offset=None, poll_timeout=50):
        # long polling: הבקשה נשארת פתוחה עד שמגיעה הודעה או שנגמר ה-timeout שלה
        return self.call(
            "getUpdates",
            _timeout=poll_timeout + 15,
            _retries=1,
            offset=offset,
            timeout=poll_timeout,
            allowed_updates=["message"],
        )

    def send_message(self, chat_id, text, reply_to=None, preview=False):
        msg = self.call(
            "sendMessage",
            chat_id=chat_id,
            text=text,
            parse_mode="HTML",
            disable_web_page_preview=not preview,
            reply_to_message_id=reply_to,
        )
        return (msg or {}).get("message_id")

    def edit_message(self, chat_id, message_id, text):
        try:
            self.call(
                "editMessageText",
                _retries=1,
                chat_id=chat_id,
                message_id=message_id,
                text=text,
                parse_mode="HTML",
                disable_web_page_preview=True,
            )
            return True
        except TelegramError as exc:
            # "message is not modified" זו לא באמת שגיאה
            if "not modified" in str(exc).lower():
                return True
            log.debug("עריכת הודעה נכשלה: %s", exc)
            return False
