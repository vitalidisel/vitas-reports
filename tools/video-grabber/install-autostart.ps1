<#
    מגדיר משימה מתוזמנת שמריצה את הבוט ברקע בכל כניסה למשתמש.
    הרצה: powershell -ExecutionPolicy Bypass -File install-autostart.ps1
#>
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$TaskName = 'video-grabber'

# pythonw/pyw מריצים בלי חלון קונסולה — לכן הם מועדפים על python.exe
$exePath = $null; $exeArgs = 'bot.py'
foreach ($candidate in @('pythonw', 'pyw', 'python')) {
    $exe = Get-Command $candidate -ErrorAction SilentlyContinue
    if (-not $exe) { continue }
    $exePath = $exe.Source
    if ($candidate -eq 'pyw') { $exeArgs = '-3 bot.py' }
    break
}
if (-not $exePath) { throw 'Python לא נמצא ב-PATH. הריצו קודם את setup.ps1' }

$user = "$env:USERDOMAIN\$env:USERNAME"
$action   = New-ScheduledTaskAction -Execute $exePath -Argument $exeArgs -WorkingDirectory $Root
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
            -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
            -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Description 'הורדת סרטונים מטלגרם למחשב' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "  $([char]0x2713) הבוט יעלה אוטומטית בכל כניסה למחשב (משימה: $TaskName)" -ForegroundColor Green
Write-Host "    לעצירה זמנית: Stop-ScheduledTask -TaskName $TaskName" -ForegroundColor Gray
