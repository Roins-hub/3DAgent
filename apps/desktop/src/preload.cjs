const { contextBridge, ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("desktop-app-shell");
});

contextBridge.exposeInMainWorld("desktopNavigation", {
  isDesktopApp: true,
  navigate: (action) => ipcRenderer.invoke("desktop:navigate", action),
  onStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("desktop:navigation-state", listener);
    return () => ipcRenderer.removeListener("desktop:navigation-state", listener);
  },
});

contextBridge.exposeInMainWorld("desktopUpdater", {
  getStatus: () => ipcRenderer.invoke("desktop:update-status"),
  check: () => ipcRenderer.invoke("desktop:update-check"),
  download: () => ipcRenderer.invoke("desktop:update-download"),
  install: () => ipcRenderer.invoke("desktop:update-install"),
  onStatusChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("desktop:update-status", listener);
    return () => ipcRenderer.removeListener("desktop:update-status", listener);
  },
});
