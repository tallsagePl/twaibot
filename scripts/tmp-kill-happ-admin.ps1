$ErrorActionPreference = 'Continue'
Stop-Process -Name 'Happ' -Force -ErrorAction SilentlyContinue
Stop-Process -Name 'happd' -Force -ErrorAction SilentlyContinue
Get-Service | Where-Object { $_.Name -match 'happ|sing' } | ForEach-Object {
  try { Stop-Service $_.Name -Force -ErrorAction Stop; Write-Output "Stopped service $($_.Name)" } catch { Write-Output "Service $($_.Name): $($_.Exception.Message)" }
}
Get-NetAdapter | Where-Object {
  $_.Name -match 'happ|tun|sing' -or $_.InterfaceDescription -match 'happ|tun|sing|Wintun|WireGuard|TAP'
} | ForEach-Object {
  try {
    Disable-NetAdapter -Name $_.Name -Confirm:$false -ErrorAction Stop
    Write-Output "Disabled adapter $($_.Name)"
  } catch {
    Write-Output "Adapter $($_.Name): $($_.Exception.Message)"
  }
}
Write-Output 'Processes left:'
Get-Process | Where-Object { $_.ProcessName -match 'happ|sing' } | Format-Table ProcessName, Id | Out-String | Write-Output
Write-Output 'Adapters:'
Get-NetAdapter | Format-Table Name, Status, InterfaceDescription -AutoSize | Out-String | Write-Output
