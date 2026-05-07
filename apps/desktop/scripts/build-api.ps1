$ErrorActionPreference = "Stop"

$apiDir = Resolve-Path (Join-Path $PSScriptRoot "..\..\api")
Set-Location $apiDir

$pyInstaller = Join-Path $apiDir "..\..\.venv\Scripts\pyinstaller.exe"
if (-not (Test-Path $pyInstaller)) {
  $pyInstaller = "pyinstaller"
}

& $pyInstaller --noconfirm --clean --onefile --name 3dagent-api desktop_entry.py
