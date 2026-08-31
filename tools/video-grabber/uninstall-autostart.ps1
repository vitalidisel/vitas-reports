# מבטל את ההפעלה האוטומטית (הקבצים שכבר ירדו לא נמחקים)
$ErrorActionPreference = 'Stop'
Stop-ScheduledTask -TaskName 'video-grabber' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'video-grabber' -Confirm:$false
Write-Host '  ההפעלה האוטומטית בוטלה' -ForegroundColor Green
