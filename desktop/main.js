const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  shell,
  ipcMain,
  session,
} = require("electron");
const path = require("path");

// Production TeamNest.ai (override with TEAMNEST_URL for staging/preview).
const APP_URL = process.env.TEAMNEST_URL || "https://teamnest.ai";
const APP_ORIGIN = new URL(APP_URL).origin;
const IS_MAC = process.platform === "darwin";
const IS_WIN = process.platform === "win32";

let mainWindow = null;
let miniWindow = null;
let tray = null;
let isQuitting = false;

// Windows notifications need a stable AppUserModelID to show the app name/icon.
if (IS_WIN) app.setAppUserModelId("ai.teamnest.desktop");

// Single-instance: focus the existing window instead of launching a second app.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMain();
  });
}

function iconPath(file) {
  return path.join(__dirname, "assets", file);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    show: false,
    title: "TeamNest.ai",
    icon: iconPath("icon.png"),
    titleBarStyle: IS_MAC ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  mainWindow.loadURL(APP_URL);
  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Unread badge: the web app sets its title to "(N) TeamNest.ai" — parse it.
  mainWindow.on("page-title-updated", (_e, title) => {
    const m = /^\((\d+)\+?\)/.exec(title || "");
    setUnreadBadge(m ? parseInt(m[1], 10) : 0);
  });

  // Keep external links in the user's real browser; keep TeamNest in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_ORIGIN)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // Close → hide to tray (Teams/Zoom behaviour); real quit via tray/menu.
  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createMiniWindow() {
  if (miniWindow) {
    miniWindow.show();
    miniWindow.focus();
    return;
  }
  miniWindow = new BrowserWindow({
    width: 400,
    height: 640,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#0a0a0a",
    title: "TeamNest — Mini",
    icon: iconPath("icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  miniWindow.setAlwaysOnTop(true, "floating");
  miniWindow.loadURL(`${APP_URL}/chats`);
  miniWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_ORIGIN)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  miniWindow.on("closed", () => {
    miniWindow = null;
  });
}

function toggleMini() {
  if (miniWindow && miniWindow.isVisible()) {
    miniWindow.close();
  } else {
    createMiniWindow();
  }
}

function showMain() {
  if (!mainWindow) createMainWindow();
  else {
    mainWindow.show();
    mainWindow.focus();
  }
}

// ── Unread badge, cross-platform ────────────────────────────────────────────
function setUnreadBadge(count) {
  const n = Number(count) || 0;
  // macOS (dock) + Linux (Unity launcher)
  if (typeof app.setBadgeCount === "function") app.setBadgeCount(n);
  // Windows taskbar overlay (setBadgeCount is unsupported there)
  if (IS_WIN && mainWindow && !mainWindow.isDestroyed()) {
    if (n > 0) {
      const overlay = nativeImage.createFromPath(iconPath("badge.png"));
      mainWindow.setOverlayIcon(overlay, `${n} unread`);
      mainWindow.flashFrame(true);
    } else {
      mainWindow.setOverlayIcon(null, "");
      mainWindow.flashFrame(false);
    }
  }
}

// ── Launch at login ─────────────────────────────────────────────────────────
function getOpenAtLogin() {
  return app.getLoginItemSettings().openAtLogin;
}
function setOpenAtLogin(enabled) {
  app.setLoginItemSettings({ openAtLogin: !!enabled, openAsHidden: true });
  buildTrayMenu();
}

// ── Tray ────────────────────────────────────────────────────────────────────
function buildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: "Open TeamNest", click: () => showMain() },
    { label: "Toggle mini window (always on top)", click: () => toggleMini() },
    { type: "separator" },
    {
      label: "Launch at login",
      type: "checkbox",
      checked: getOpenAtLogin(),
      click: (item) => setOpenAtLogin(item.checked),
    },
    { type: "separator" },
    {
      label: "Quit TeamNest",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  const img = nativeImage.createFromPath(iconPath("tray.png"));
  tray = new Tray(img);
  tray.setToolTip("TeamNest.ai");
  buildTrayMenu();
  tray.on("click", () => showMain());
}

// ── App menu (needed for copy/paste + shortcuts, esp. on macOS) ─────────────
function buildAppMenu() {
  const template = [
    ...(IS_MAC ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Home", accelerator: "CmdOrCtrl+H", click: () => showMain() },
        { label: "Mini window", accelerator: "CmdOrCtrl+Shift+M", click: () => toggleMini() },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC bridge from the renderer (preload) ──────────────────────────────────
ipcMain.on("set-badge", (_e, count) => setUnreadBadge(count));
ipcMain.on("toggle-mini", () => toggleMini());
ipcMain.on("open-main", () => showMain());

app.whenReady().then(() => {
  // Allow notifications + mic/camera (for calls) on our own origin.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(["notifications", "media", "clipboard-read", "fullscreen"].includes(permission));
  });

  createMainWindow();
  createTray();
  buildAppMenu();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else showMain();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

// Keep running in the tray when all windows are closed (desktop-app behaviour).
app.on("window-all-closed", () => {
  // Intentionally do NOT quit — the tray keeps the app alive.
});
