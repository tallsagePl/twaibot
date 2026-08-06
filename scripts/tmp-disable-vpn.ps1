$ErrorActionPreference = 'Continue'

Write-Output '=== Adapters ==='
Get-NetAdapter | Where-Object {
  $_.Name -match 'happ|tun|sing' -or $_.InterfaceDescription -match 'happ|tun|sing|Wintun|WireGuard'
} | Format-Table Name, Status, InterfaceDescription -AutoSize | Out-String | Write-Output

Write-Output '=== Processes ==='
Get-Process | Where-Object {
  $_.ProcessName -match 'happ|sing-box|clash|v2ray|xray|hiddify|nekoray'
} | Select-Object ProcessName, Id, Path | Format-Table -AutoSize | Out-String | Write-Output

Write-Output '=== Disabling matching adapters ==='
Get-NetAdapter | Where-Object {
  $_.Name -match 'happ|tun|sing' -or $_.InterfaceDescription -match 'happ|tun|sing|Wintun'
} | ForEach-Object {
  Write-Output ("Disable-NetAdapter: {0}" -f $_.Name)
  try {
    Disable-NetAdapter -Name $_.Name -Confirm:$false -ErrorAction Stop
    Write-Output '  OK'
  } catch {
    Write-Output ("  FAIL: {0}" -f $_.Exception.Message)
  }
}

Write-Output '=== Stopping matching processes ==='
Get-Process | Where-Object {
  $_.ProcessName -match 'happ|sing-box|clash|v2ray|xray|hiddify|nekoray'
} | ForEach-Object {
  Write-Output ("Stop-Process: {0} ({1})" -f $_.ProcessName, $_.Id)
  try {
    Stop-Process -Id $_.Id -Force -ErrorAction Stop
    Write-Output '  OK'
  } catch {
    Write-Output ("  FAIL: {0}" -f $_.Exception.Message)
  }
}

Write-Output '=== Adapters after ==='
Get-NetAdapter | Where-Object {
  $_.Name -match 'happ|tun|sing' -or $_.InterfaceDescription -match 'happ|tun|sing|Wintun'
} | Format-Table Name, Status, InterfaceDescription -AutoSize | Out-String | Write-Output
