"""תגיות נושא — חילוץ מתוך ההודעה והפיכתן לשם תיקייה בטוח."""

import re

# תגית: כל מה שאחרי # עד רווח. עברית, אנגלית, ספרות, מקפים וגרשיים
TAG_RE = re.compile(r"#([^\s#]+)")

# תווים שאסורים בשם תיקייה בווינדוס
INVALID_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
QUOTES = re.compile(r"[\"'`׳״]")

# שמות שמורים בווינדוס — תיקייה בשם כזה פשוט לא נוצרת
RESERVED = {
    "con", "prn", "aux", "nul",
    *(f"com{i}" for i in range(1, 10)),
    *(f"lpt{i}" for i in range(1, 10)),
}

UNTAGGED = "כללי"
MAX_LEN = 60


def safe_folder(name: str) -> str:
    """שם תיקייה תקין לווינדוס, או מחרוזת ריקה אם לא נשאר ממנו כלום.

    גרשיים נמחקים (נדל\"ן → נדלן), שאר התווים האסורים הופכים למקף,
    וכל ניסיון לצאת מהתיקייה (.. או נתיב מלא) נחסם.
    """
    name = (name or "").strip()
    name = QUOTES.sub("", name)
    name = INVALID_CHARS.sub("-", name)
    name = re.sub(r"\s+", " ", name).strip(" .-_")
    name = name[:MAX_LEN].strip(" .-_")
    if not name or set(name) <= {"."}:
        return ""
    if name.lower() in RESERVED:
        name = f"{name}-tag"
    return name


def extract(text: str):
    """כל התגיות בהודעה, מנוקות ובלי כפילויות. הראשונה קובעת את התיקייה."""
    seen, tags = set(), []
    for raw in TAG_RE.findall(text or ""):
        tag = safe_folder(raw)
        if tag and tag.lower() not in seen:
            seen.add(tag.lower())
            tags.append(tag)
    return tags


def strip_tags(text: str) -> str:
    """ההודעה בלי התגיות — כדי שהן לא ייחשבו בטעות לחלק מקישור."""
    return TAG_RE.sub(" ", text or "")
