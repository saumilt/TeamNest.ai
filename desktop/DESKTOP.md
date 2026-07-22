# TeamNest.ai Desktop (macOS + Windows)

A native desktop app (Electron) that wraps the TeamNest.ai web app at
**https://teamnest.ai**, adding: system tray icon, unread badge count, native
desktop notifications, launch-at-login, and an always-on-top mini window.

> The web app itself lives in `/app/frontend`. This shell just loads the
> deployed site and adds OS integrations. It also works as an **installable PWA**
> — see "PWA install (no build required)" at the bottom.

---

## 1. Prerequisites

- **Node.js 18+** and either `npm` or `yarn`.
- To build the **macOS** `.dmg`: **a Mac** (Apple's tools only run on macOS).
- To build the **Windows** `.exe`: **a Windows PC** (or a Windows CI runner).
  You cannot build a Windows installer on macOS/Linux reliably, nor a signed
  macOS app off a Mac.

## 2. Run it locally (dev)

```bash
cd desktop
npm install          # already installed here via yarn; safe to re-run
npm start            # opens the app pointing at https://teamnest.ai
# or point at your local web dev server:
npm run dev          # TEAMNEST_URL=http://localhost:3000
```

To point at a different environment, set `TEAMNEST_URL`:

```bash
TEAMNEST_URL=https://your-preview-url.example.com npm start
```

## 3. Build installers

```bash
# On a Mac  → produces release/TeamNest-<ver>-arm64.dmg and -x64.dmg
npm run dist:mac

# On Windows → produces release/TeamNest Setup <ver>.exe (NSIS installer)
npm run dist:win

# Optional Linux (AppImage + .deb)
npm run dist:linux
```

Output lands in `desktop/release/`.

> Icons: `build/icon.png` (1024×1024) is included; electron-builder auto-derives
> the `.icns` (mac) and `.ico` (win) from it.

---

## 4. Code signing & notarization (so installers don't warn users)

**Unsigned apps still install**, but users see scary warnings ("unidentified
developer" on macOS, "Windows protected your PC" SmartScreen). To ship a clean
experience you need certificates. You do **not** have these yet — here's how to
get them.

### 4a. macOS — Apple Developer Program (~US$99/year)

1. Go to <https://developer.apple.com/programs/> → **Enroll**. Sign in with an
   Apple ID, choose Individual or Organization (Organization needs a D-U-N-S
   number), and pay the annual fee.
2. In Xcode (or the Apple Developer portal) create a
   **"Developer ID Application"** certificate and install it in your login
   keychain.
3. Create an **app-specific password** for notarization at
   <https://appleid.apple.com> → Sign-In & Security → App-Specific Passwords.
4. Build & notarize with environment variables:

   ```bash
   export CSC_NAME="Developer ID Application: Your Name (TEAMID)"
   export APPLE_ID="[email protected]"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   export APPLE_TEAM_ID="YOURTEAMID"
   npm run dist:mac
   ```

   electron-builder signs with the Developer ID cert and notarizes automatically
   when these vars are present (hardened runtime + entitlements are already
   configured in `package.json` / `build/entitlements.mac.plist`).

### 4b. Windows — Code-signing certificate (~US$70–400/year)

1. Buy an **OV** or (recommended) **EV code-signing certificate** from a CA such
   as **DigiCert, Sectigo, SSL.com, or Certum** (Certum offers low-cost options
   for individuals). EV certs give instant SmartScreen reputation but require a
   hardware token / cloud HSM.
2. Export the cert as a `.pfx` (OV) or follow the CA's token instructions (EV).
3. Sign during the build:

   ```powershell
   $env:CSC_LINK="C:\path\to\cert.pfx"
   $env:CSC_KEY_PASSWORD="your-pfx-password"
   npm run dist:win
   ```

> Tip: For teams, run these in **CI** (GitHub Actions has `macos-latest` and
> `windows-latest` runners) and store certs/passwords as encrypted secrets so
> you don't handle them by hand.

---

## 5. Auto-updates (optional, later)

Add `electron-updater` + a publish target (GitHub Releases, S3, or a generic
server). Not enabled by default because it needs a place to host the update
feed. Ask and we'll wire it in.

---

## 6. Features included

| Feature | How it works |
|---|---|
| System tray icon | `assets/tray.png`; menu: Open / Mini window / Launch at login / Quit |
| Unread badge | Web app sets title `(N) TeamNest.ai`; main process → dock badge (mac/linux) or taskbar overlay + flash (Windows) |
| Desktop notifications | The web app's HTML5 notifications render as native OS notifications inside Electron |
| Launch at login | Tray checkbox → `app.setLoginItemSettings` |
| Always-on-top mini window | Tray → "Toggle mini window", 400×640, floats above other apps, loads `/chats` |
| External links | Open in the user's default browser; TeamNest stays in-app |
| Close-to-tray | Closing the window hides to tray (quit from the tray/menu) |

---

## PWA install (no build required)

The web app is also an installable PWA. On **Chrome/Edge (Windows, macOS,
Linux)** open <https://teamnest.ai> and click the **Install** icon in the
address bar (or the in-app "Install desktop app" prompt) to get a standalone
app window with its own Dock/Taskbar icon — no signing, no download, updates
instantly with the website. This is the fastest way to give users a "desktop
app" today; the Electron installers above are for a fully native experience.
