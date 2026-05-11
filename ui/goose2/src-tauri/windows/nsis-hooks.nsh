!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Stopping running CodeMindX processes from the install directory..."
  nsExec::ExecToLog `powershell -NoProfile -ExecutionPolicy Bypass -Command "$$ErrorActionPreference = 'SilentlyContinue'; $$targets = @([IO.Path]::Combine('$INSTDIR', 'goose.exe'), [IO.Path]::Combine('$INSTDIR', 'goose-tauri.exe'), [IO.Path]::Combine('$INSTDIR', 'CodeMindX.exe')); Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -and ($$targets -contains $$_.ExecutablePath) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force }"`
  Sleep 1000
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Stopping running CodeMindX processes from the install directory..."
  nsExec::ExecToLog `powershell -NoProfile -ExecutionPolicy Bypass -Command "$$ErrorActionPreference = 'SilentlyContinue'; $$targets = @([IO.Path]::Combine('$INSTDIR', 'goose.exe'), [IO.Path]::Combine('$INSTDIR', 'goose-tauri.exe'), [IO.Path]::Combine('$INSTDIR', 'CodeMindX.exe')); Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -and ($$targets -contains $$_.ExecutablePath) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force }"`
  Sleep 1000
!macroend
