#!/usr/bin/env python3
"""yt-dlp מזויף לבדיקות: מדפיס שורות התקדמות ויוצר קובץ יעד, בלי רשת.

התנהגות נשלטת דרך משתני סביבה:
  FAKE_MODE=ok|error|slow   (ברירת מחדל ok)
"""
import os
import sys
import time
from pathlib import Path

argv = sys.argv[1:]
mode = os.environ.get("FAKE_MODE", "ok")


def opt(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


target = Path(opt("-P", "."))
meta_file = argv[argv.index("--print-to-file") + 2]
url = argv[-1]

print("[youtube] Extracting URL: " + url)
if mode == "error":
    print("ERROR: [instagram] xyz: Requested content is not available, login required", file=sys.stdout)
    sys.exit(1)

target.mkdir(parents=True, exist_ok=True)
out = target / "2026-07-15 Vitas Marketing - מודעת קמפיין [abc123].mp4"
print(f"[download] Destination: {out}")
for percent in (0.0, 12.5, 47.3, 88.1, 100.0):
    print(f"[download]  {percent}% of 10.00MiB at 5.00MiB/s ETA 00:01")
    sys.stdout.flush()
    if mode == "slow":
        time.sleep(0.4)
print("[Merger] Merging formats into \"%s\"" % out)
out.write_bytes(b"x" * 1024 * 1024)
Path(meta_file).write_text(
    f"{out}|~|מודעת קמפיין|~|Vitas Marketing|~|95.4\n", encoding="utf-8"
)
