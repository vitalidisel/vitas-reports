<#
    setup.ps1 — התקנה חד-פעמית של video-grabber על מחשב Windows.

    מה זה עושה:
      1. מוודא ש-Python מותקן (ומתקין דרך winget אם צריך)
      2. מוריד yt-dlp.exe ו-ffmpeg לתיקיית bin
      3. שואל על טוקן הבוט ועל תיקיית היעד, וכותב config.json
      4. מציע להגדיר הפעלה אוטומטית עם הדלקת המחשב

    הרצה:  לחיצה ימנית על הקובץ → Run with PowerShell
    או:    powershell -ExecutionPolicy Bypass -File setup.ps1
#>

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Root    = Split-Path -Parent $MyInvocation.MyCommand.Path
$BinDir  = Join-Path $Root 'bin'
$Config  = Join-Path $Root 'config.json'

function Write-Step($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }
function Write-Ok($text)   { Write-Host "  $([char]0x2713) $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  ! $text" -ForegroundColor Yellow }

Write-Host @"

  video-grabber — הורדת סרטונים מהטלפון ישירות למחשב
  ---------------------------------------------------
"@ -ForegroundColor White

# ---------- 1. Python ----------
Write-Step "בודק Python"
$python = $null
foreach ($candidate in @('py', 'python', 'python3')) {
    $exe = Get-Command $candidate -ErrorAction SilentlyContinue
    if (-not $exe) { continue }
    $pyArgs = if ($candidate -eq 'py') { @('-3', '--version') } else { @('--version') }
    try { $version = (& $exe.Source @pyArgs 2>&1 | Out-String).Trim() } catch { continue }
    if ($version -match 'Python 3\.(\d+)' -and [int]$Matches[1] -ge 8) {
        $python = if ($candidate -eq 'py') { "$($exe.Source) -3" } else { $exe.Source }
        Write-Ok "נמצא $version"
        break
    }
}
if (-not $python) {
    Write-Warn 'Python 3 לא נמצא — מנסה להתקין דרך winget'
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id Python.Python.3.12 --source winget --accept-package-agreements --accept-source-agreements
        Write-Warn 'ההתקנה הסתיימה. סגרו את החלון, פתחו PowerShell מחדש והריצו שוב את setup.ps1'
    } else {
        Write-Warn 'אין winget במחשב. התקינו Python מ-https://www.python.org/downloads/ (סמנו "Add python.exe to PATH") והריצו שוב.'
    }
    Read-Host 'Enter לסיום'
    exit 1
}

# ---------- 2. yt-dlp + ffmpeg ----------
Write-Step 'מוריד yt-dlp ו-ffmpeg'
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

$ytdlp = Join-Path $BinDir 'yt-dlp.exe'
Invoke-WebRequest -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' `
                  -OutFile $ytdlp -UseBasicParsing
Write-Ok "yt-dlp הותקן ($([math]::Round((Get-Item $ytdlp).Length / 1MB, 1)) MB)"

if (Test-Path (Join-Path $BinDir 'ffmpeg.exe')) {
    Write-Ok 'ffmpeg כבר קיים'
} else {
    $zip  = Join-Path $env:TEMP 'ffmpeg-grabber.zip'
    $temp = Join-Path $env:TEMP 'ffmpeg-grabber'
    Invoke-WebRequest -Uri 'https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip' `
                      -OutFile $zip -UseBasicParsing
    if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $temp -Force
    Get-ChildItem -Path $temp -Recurse -Include 'ffmpeg.exe', 'ffprobe.exe' |
        ForEach-Object { Copy-Item $_.FullName -Destination $BinDir -Force }
    Remove-Item $zip, $temp -Recurse -Force
    Write-Ok 'ffmpeg הותקן (נדרש למיזוג וידאו+אודיו לאיכות מלאה)'
}

# ---------- 3. הגדרות ----------
Write-Step 'הגדרות'
$existing = @{}
if (Test-Path $Config) {
    try { (Get-Content $Config -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties |
            ForEach-Object { $existing[$_.Name] = $_.Value } } catch { }
    Write-Warn 'נמצא config.json קיים — Enter ישאיר את הערכים הנוכחיים'
}

Write-Host @'

  איך משיגים טוקן לבוט (פעם אחת, חינם, 2 דקות):
    1. בטלגרם בטלפון פתחו צ'אט עם @BotFather
    2. שלחו /newbot ובחרו שם ושם-משתמש שמסתיים ב-bot
    3. העתיקו את הטוקן שהוא שולח והדביקו כאן

'@ -ForegroundColor Gray

$tokenPrompt = if ($existing.bot_token) { 'טוקן הבוט [נשאר כמו שהוא]' } else { 'טוקן הבוט' }
$token = Read-Host $tokenPrompt
if (-not $token) { $token = [string]$existing.bot_token }
if (-not $token) { Write-Warn 'בלי טוקן הבוט לא יעבוד. אפשר להוסיף אותו אחר כך ל-config.json'; }

$defaultDir = if ($existing.download_dir) { [string]$existing.download_dir }
              else { Join-Path $env:USERPROFILE 'Videos\Downloads' }
$dir = Read-Host "תיקיית שמירה [$defaultDir]"
if (-not $dir) { $dir = $defaultDir }
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$ids = @()
if ($existing.allowed_user_ids) { $ids = @($existing.allowed_user_ids) }

$cfg = [ordered]@{
    bot_token           = $token
    allowed_user_ids    = $ids
    download_dir        = $dir
    folder_per_platform = $true
    default_format      = 'video'
    default_tag         = [string]$existing.default_tag
    cookies_from_browser = [string]$existing.cookies_from_browser
    max_filesize_mb     = 0
    history_size        = 500
    auto_update_ytdlp   = $true
}
$json = $cfg | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($Config, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Ok "נשמר $Config"

# ---------- 4. הפעלה אוטומטית ----------
Write-Step 'הפעלה עם הדלקת המחשב'
$auto = Read-Host 'להגדיר שהבוט יעלה לבד בכל כניסה למחשב? (Y/n)'
if ($auto -ne 'n' -and $auto -ne 'N') {
    & (Join-Path $Root 'install-autostart.ps1')
}

Write-Host @"

  הכול מוכן.
  1. הריצו את start.bat  (בהרצה הראשונה יופיע קוד צימוד)
  2. בטלגרם בטלפון פתחו את הבוט שלכם ושלחו לו את הקוד
  3. מעכשיו: שיתוף של כל סרטון לבוט = הורדה למחשב

"@ -ForegroundColor Green
Read-Host 'Enter לסיום'
