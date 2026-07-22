const { contextBridge, ipcRenderer } = require("electron");

/*
 * Minimal, safe bridge exposed to the TeamNest web app running inside the
 * desktop shell. The web app is written platform-agnostically; these are
 * optional enhancements it can feature-detect via `window.desktop`.
 */
contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  platform: process.platform,
  // The web app already sets document.title to "(N) TeamNest.ai"; the main
  // process parses that. setBadge is an explicit belt-and-suspenders channel.
  setBadge: (count) => ipcRenderer.send("set-badge", count),
  toggleMiniWindow: () => ipcRenderer.send("toggle-mini"),
  openMainWindow: () => ipcRenderer.send("open-main"),
});
