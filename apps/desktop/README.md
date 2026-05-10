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

## Updates

Desktop updates use `electron-updater` with a Tencent COS generic feed:

```text
https://3dagent-updates-1411701740.cos.ap-guangzhou.myqcloud.com/3dagent/win/
```

For each release, bump `apps/desktop/package.json` version, run:

```powershell
npm run build:desktop
```

Then upload these files from `apps/desktop/dist` to the COS `3dagent/win/` directory:

```text
latest.yml
3DAgent Setup <version>.exe
3DAgent Setup <version>.exe.blockmap
```
