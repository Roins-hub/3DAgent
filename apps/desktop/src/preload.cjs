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
