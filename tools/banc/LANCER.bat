@echo off
rem Banc de test Arcanes : ouvre la page dans une fenetre Edge a part (profil dedie, sans ralentissement en arriere-plan),
rem puis garde le PC eveille tant que cette fenetre reste ouverte. Rien a installer.
cd /d "%~dp0"
start "" msedge --user-data-dir="%~dp0profil-navigateur" --no-first-run --no-default-browser-check --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,UseEcoQoSForBackgroundProcess --new-window "%~dp0banc.html"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0eveil.ps1"
