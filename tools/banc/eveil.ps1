# Empeche la mise en veille du PC tant que la fenetre Edge du banc reste ouverte, et se ferme toute seule apres elle.
# L'ecran, lui, peut s'eteindre. (Avant le 01/11 : il suffisait d'appuyer sur Entree ici pour rendre la veille, et la nuit s'arretait.)
try { $host.UI.RawUI.WindowTitle = 'Arcanes - PC eveille' } catch {}
$prof = (Join-Path $PSScriptRoot 'profil-navigateur').ToLower()
try {
  $k = Add-Type -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);' -Name Power -Namespace ArcanesBanc -PassThru
} catch {
  Write-Host "Impossible d'empecher la veille : regle la mise en veille sur Jamais pour cette nuit." -ForegroundColor Yellow
  Start-Sleep -Seconds 3600; exit
}
Write-Host ""
Write-Host "Le banc tourne dans la fenetre Edge. Ne la reduis pas : laisse-la ouverte, derriere les autres si tu veux."
Write-Host "Tant que cette fenetre noire reste ouverte, le PC ne se met pas en veille (l'ecran peut s'eteindre)."
Write-Host "Elle se ferme toute seule quand tu fermes la fenetre Edge du banc. Ne la ferme pas avant."
$vu = $false
while ($true) {
  [void]$k::SetThreadExecutionState([uint32]2147483649)   # ES_CONTINUOUS + ES_SYSTEM_REQUIRED
  Start-Sleep -Seconds 60
  # une fenetre Edge ouverte avec le profil du banc (un Edge reste parfois en arriere-plan sans fenetre : il ne compte pas)
  $ids = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains($prof) } | ForEach-Object { $_.ProcessId })
  $win = @($ids | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue } | Where-Object { $_.MainWindowHandle -ne 0 })
  if ($win.Count -gt 0) { $vu = $true } elseif ($vu) { break }
}
