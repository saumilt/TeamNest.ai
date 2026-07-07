# TeamNest Mobile — README for Dev Team

Hi! This zip contains everything you need to ship TeamNest to the **Apple App Store** and **Google Play Store**.

## TL;DR — what to do

1. Read `MOBILE_APP_DEPLOYMENT_GUIDE.md` end-to-end (15 min).
2. Install Node 20+ and yarn.
3. `cd frontend && yarn install` (5 min — fetches ~1.4 GB of deps).
4. Follow **Part A** for Android, **Part B** for iOS.

That's it. Both native projects (`frontend/ios/`, `frontend/android/`) are
fully scaffolded — no `cap init` / `cap add` needed.

## What's already done for you

- ✅ Capacitor 7 scaffold with 9 plugins installed (push, camera, haptics, biometric, share, splash, status bar, keyboard, app)
- ✅ iOS `Info.plist` filled out with all required usage strings + background modes
- ✅ Android `AndroidManifest.xml` with all required permissions
- ✅ App icons (1024×1024) + splash (2732×2732) source assets
- ✅ Bundle ID set to `ai.teamnest.app` on both platforms
- ✅ Display name "TeamNest"
- ✅ JS runtime bridge wired into `src/lib/native.js` (push registration, haptics, share, biometric, photo picker)
- ✅ App-launch native init hooked in `App.js`
- ✅ Backend push device-registration endpoint live: `POST /api/devices/register`
- ✅ 31 pre-rendered store screenshots (4 device sizes)
- ✅ Google Play feature graphic (1024×500)
- ✅ 15-second app preview video (1080×1920, H.264)
- ✅ Legal pages live: `https://teamnest.ai/privacy` · `/terms` · `/support`
- ✅ Marketing copy in `frontend/store-assets/README.md`

## Architecture in 30 seconds

```
   [App Store / Play Store]
        ↓ installs
   [Native shell]  ← Capacitor (Swift on iOS / Kotlin on Android)
        ↓ loads
   https://teamnest.ai  ← React PWA (already deployed)
        ↓ talks to
   https://teamnest.ai/api/*  ← FastAPI backend
        ↓ stores in
   MongoDB
```

The native shell is **just a thin wrapper** that loads the live web app. So
99% of UI updates ship through the regular `yarn build && deploy` flow —
you only re-submit to the stores when you change Capacitor plugins / config /
native code.

## Credentials you'll need to provide

| Service | What |
|---|---|
| Apple Developer | Apple ID + signing certificate or **App Store Connect API key** (`.p8`) |
| Google Play | Play Console signed-in Google account |
| Android signing | You'll generate a `teamnest-release.jks` on first build — back it up |

Push notification setup (post-launch):
- Apple: **Keys → Create APNs Key**, upload to whatever push provider you wire to `/api/devices/register`
- Android: **Firebase Cloud Messaging Server Key** — same flow

## Questions

Refer to `MOBILE_APP_DEPLOYMENT_GUIDE.md` for the canonical step-by-step.
For `CAPACITOR.md`, that's the deeper architectural reference if you need
to understand the plumbing.

Good luck!
