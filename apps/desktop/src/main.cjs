const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const http = require("http");
const path = require("path");

const WEB_PORT = Number(process.env.DESKTOP_WEB_PORT || 39281);
const API_PORT = Number(process.env.DESKTOP_API_PORT || 39282);
const WEB_URL = process.env.DESKTOP_WEB_URL || `http://127.0.0.1:${WEB_PORT}`;
const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || `http://127.0.0.1:${API_PORT}`;
const UPDATE_FEED_URL =
  process.env.THREEDAGENT_UPDATE_FEED_URL ||
  "https://3dagent-updates-1411701740.cos.ap-guangzhou.myqcloud.com/3dagent/win/";

const processes = [];
let mainWindow;
let updateStatus = {
  status: "idle",
  currentVersion: app.getVersion(),
  feedUrl: UPDATE_FEED_URL,
};

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.setFeedURL({
  provider: "generic",
  url: UPDATE_FEED_URL,
});

function desktopWebUrl() {
  const url = new URL(WEB_URL);
  url.searchParams.set("__desktop", "1");
  return url.toString();
}

function normalizeUpdateInfo(info = {}) {
  return {
    version: info.version,
    releaseName: info.releaseName,
    releaseDate: info.releaseDate,
    releaseNotes: info.releaseNotes,
  };
}

function sendUpdateStatus(status) {
  updateStatus = {
    ...updateStatus,
    ...status,
    currentVersion: app.getVersion(),
    feedUrl: UPDATE_FEED_URL,
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:update-status", updateStatus);
  }

  return updateStatus;
}

function repoRoot() {
  return path.resolve(__dirname, "..", "..", "..");
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function spawnService(command, args, options) {
  const child = spawn(command, args, {
    stdio: "inherit",
    windowsHide: true,
    ...options,
    env: {
      ...process.env,
      ...options?.env,
    },
  });

  processes.push(child);
  child.on("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM") {
      console.error(`[desktop] ${command} exited with code ${code ?? signal}`);
    }
  });
  return child;
}

function waitForHttp(url, timeoutMs = 120000) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(attempt, 500);
      });

      request.setTimeout(2000, () => {
        request.destroy();
      });
    };

    attempt();
  });
}

function startDevServices() {
  const root = repoRoot();

  spawnService(npmCommand(), ["run", "dev:api"], {
    cwd: root,
  });

  spawnService(npmCommand(), ["run", "dev:web"], {
    cwd: root,
    env: {
      NEXT_PUBLIC_API_BASE_URL: API_URL,
    },
  });
}

function startPackagedServices() {
  const resources = process.resourcesPath;
  const dataRoot = app.getPath("userData");
  const webServer = path.join(resources, "web", "apps", "web", "server.js");
  const webCwd = path.join(resources, "web", "apps", "web");
  const apiExe = path.join(resources, "api", "3dagent-api.exe");
  const apiCwd = path.join(resources, "api");
  const publicDir = path.join(resources, "web", "apps", "web", "public");

  if (!fs.existsSync(apiExe)) {
    throw new Error(`Missing packaged FastAPI executable: ${apiExe}`);
  }
  if (!fs.existsSync(webServer)) {
    throw new Error(`Missing packaged Next.js server: ${webServer}`);
  }

  spawnService(apiExe, [], {
    cwd: apiCwd,
    env: {
      PORT: String(API_PORT),
      THREEDAGENT_ROOT_DIR: dataRoot,
      THREEDAGENT_API_DIR: apiCwd,
      THREEDAGENT_DEMO_MODEL_PATH: path.join(publicDir, "models", "demo-asset.glb"),
      THREEDAGENT_MODEL_CACHE_DIR: path.join(dataRoot, ".cache", "models"),
      THREEDAGENT_IMAGE_CACHE_DIR: path.join(dataRoot, "generated", "images"),
      THREEDAGENT_LEGACY_IMAGE_CACHE_DIR: path.join(dataRoot, ".cache", "images"),
      THREEDAGENT_MODEL_CONVERTER_SCRIPT: path.join(apiCwd, "scripts", "convert_model.mjs"),
    },
  });

  spawnService(process.execPath, [webServer], {
    cwd: webCwd,
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      PORT: String(WEB_PORT),
      NEXT_PUBLIC_API_BASE_URL: API_URL,
    },
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#0b0f19",
    title: "3DAgent",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  const sendNavigationState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.webContents.send("desktop:navigation-state", {
      canGoBack: mainWindow.webContents.canGoBack(),
      canGoForward: mainWindow.webContents.canGoForward(),
    });
  };

  mainWindow.webContents.on("did-finish-load", sendNavigationState);
  mainWindow.webContents.on("did-navigate", sendNavigationState);
  mainWindow.webContents.on("did-navigate-in-page", sendNavigationState);

  await mainWindow.loadURL(desktopWebUrl());

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

ipcMain.handle("desktop:navigate", (event, action) => {
  const contents = event.sender;

  if (action === "back" && contents.canGoBack()) {
    contents.goBack();
  }
  if (action === "forward" && contents.canGoForward()) {
    contents.goForward();
  }
  if (action === "reload") {
    contents.reload();
  }
  if (action === "home") {
    contents.loadURL(desktopWebUrl());
  }

  return {
    canGoBack: contents.canGoBack(),
    canGoForward: contents.canGoForward(),
  };
});

ipcMain.handle("desktop:update-status", () => updateStatus);

ipcMain.handle("desktop:update-check", async () => {
  if (!app.isPackaged) {
    return sendUpdateStatus({
      status: "unsupported",
      message: "开发模式下无法检查安装包更新，请在打包安装后测试。",
    });
  }

  sendUpdateStatus({ status: "checking", message: null });
  await autoUpdater.checkForUpdates();
  return updateStatus;
});

ipcMain.handle("desktop:update-download", async () => {
  if (!app.isPackaged) {
    return sendUpdateStatus({
      status: "unsupported",
      message: "开发模式下无法下载安装包更新，请在打包安装后测试。",
    });
  }

  sendUpdateStatus({ status: "downloading", percent: 0, message: null });
  await autoUpdater.downloadUpdate();
  return updateStatus;
});

ipcMain.handle("desktop:update-install", () => {
  if (updateStatus.status !== "downloaded") {
    return sendUpdateStatus({
      status: "error",
      message: "更新尚未下载完成。",
    });
  }

  sendUpdateStatus({ status: "installing", message: "正在重启并安装更新。" });
  autoUpdater.quitAndInstall(false, true);
  return updateStatus;
});

autoUpdater.on("checking-for-update", () => {
  sendUpdateStatus({ status: "checking", message: null });
});

autoUpdater.on("update-available", (info) => {
  sendUpdateStatus({
    status: "available",
    updateInfo: normalizeUpdateInfo(info),
    message: null,
  });
});

autoUpdater.on("update-not-available", (info) => {
  sendUpdateStatus({
    status: "not-available",
    updateInfo: normalizeUpdateInfo(info),
    message: "当前已是最新版本。",
  });
});

autoUpdater.on("download-progress", (progress) => {
  sendUpdateStatus({
    status: "downloading",
    percent: Math.round(progress.percent || 0),
    transferred: progress.transferred,
    total: progress.total,
    bytesPerSecond: progress.bytesPerSecond,
    message: null,
  });
});

autoUpdater.on("update-downloaded", (info) => {
  sendUpdateStatus({
    status: "downloaded",
    percent: 100,
    updateInfo: normalizeUpdateInfo(info),
    message: "更新已下载完成。",
  });
});

autoUpdater.on("error", (error) => {
  sendUpdateStatus({
    status: "error",
    message: error instanceof Error ? error.message : String(error),
  });
});

async function boot() {
  try {
    if (app.isPackaged) {
      startPackagedServices();
    } else {
      startDevServices();
    }

    await Promise.all([
      waitForHttp(WEB_URL),
      waitForHttp(`${API_URL}/api/health`).catch(() => waitForHttp(API_URL)),
    ]);

    await createWindow();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("3DAgent failed to start", message);
    app.quit();
  }
}

function stopServices() {
  for (const child of processes) {
    if (!child.killed) {
      child.kill();
    }
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  return boot();
});

app.on("window-all-closed", () => {
  stopServices();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", stopServices);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
