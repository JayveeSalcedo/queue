# Registers the queue server to start when Windows starts (before anyone logs in),
# restart itself if it ever stops, and run forever. Run by the installer.
$ErrorActionPreference = 'Stop'
$name = 'QueueSystem Server'
$exe = Join-Path $PSScriptRoot 'QueueServer.exe'

$action    = New-ScheduledTaskAction -Execute $exe -WorkingDirectory $PSScriptRoot
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
# Defaults would stop the task after 72 hours and when on battery: turn both off
$settings  = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $name
