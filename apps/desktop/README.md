# 3DAgent Desktop

Electron desktop shell for the 3DAgent web and FastAPI apps.

## Development

```powershell
npm run dev:desktop
```

This starts the existing FastAPI backend on `8016`, starts the Next.js web app on `3000`, then opens an Electron window.

## Windows Installer

```powershell
npm install
npm run build:desktop
```

The production build expects PyInstaller to be available. If it is not already installed in `.venv`, install it first:

```powershell
.\.venv\Scripts\python.exe -m pip install pyinstaller
```

The installer output is written to `apps/desktop/dist`.
