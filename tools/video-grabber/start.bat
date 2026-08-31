@echo off
chcp 65001 >nul
rem הפעלת הבוט בחלון גלוי — שימושי בהרצה הראשונה (קוד הצימוד) ולבדיקות.
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 bot.py
) else (
  python bot.py
)
echo.
echo הבוט נעצר. אפשר לסגור את החלון.
pause
