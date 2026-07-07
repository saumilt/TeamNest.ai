# TeamNest · Native iOS & Android (Capacitor)

This document explains how to ship the React PWA as a real native **iOS** and
**Android** app using [Capacitor](https://capacitorjs.com/). Every line of
React code is reused — the native shell just loads the production web bundle
from `https://teamnest.ai`.

---

## 1. What's already wired up (inside this repo)

| Concern | Status |
| --- | --- |
| `frontend/capacitor.config.json` | ✅ App ID `ai.teamnest.app`, display name `TeamNest`, dark theme |
| iOS native project (`frontend/ios/`) | ✅ Bundled, ready for Xcode |
| Android native project (`frontend/android/`) | ✅ Bundled, ready for Android Studio |
| Capacitor plugins installed | ✅ App, Camera, Haptics, Keyboard, Push Notifications, Share, Splash Screen, Status Bar, Native Biometric |
| iOS `Info.plist` usage strings | ✅ Camera, Photo Library, Microphone, Face ID, Local Network, Background modes (push, audio, voip) |
| Android `AndroidManifest.xml` permissions | ✅ Camera, Mic, Biometric, Push, Bluetooth, Vibrate, Wake Lock |
| Runtime bridge (`frontend/src/lib/native.js`) | ✅ `initNativeShell`, `registerPush`, `hapticTap`, `sharePayload`, `pickPhoto`, `unlockWithBiometrics` |
| App-launch native shell init | ✅ Hooked into `App.js` |
| Push device registration endpoint | ✅ `POST /api/devices/register` |
| Icon + splash source assets | ✅ `frontend/resources/icon.png` (1024×1024), `splash.png` (2732×2732) |
| Yarn convenience scripts | ✅ `yarn cap:sync`, `yarn cap:ios`, `yarn cap:android`, `yarn cap:assets` |

You do **not** need to run `npx cap init` or `npx cap add ios/android` — both
platforms are already added and committed.

---

## 2. Building locally (the traditional path)

> ⚠️ Native builds cannot run inside the Emergent container — they need
> **Xcode** (macOS only) and/or **Android Studio** (any OS).

### Android (works on Windows, Mac, or Linux)

```bash
git pull                  # get the latest committed Capacitor scaffold
cd frontend
yarn install
yarn cap:assets           # one-time: generate per-density icons & splashes
yarn cap:android          # builds React, syncs, then opens Android Studio
```

In Android Studio:

1. Wait for Gradle sync to finish.
2. **Build → Generate Signed App Bundle / APK → Android App Bundle (.aab)**.
3. The first time, generate a new keystore and store it safely — you'll need
   it for every future release.
4. Upload the `.aab` to [Play Console](https://play.google.com/console).

### iOS (macOS only)

```bash
git pull
cd frontend
yarn install
yarn cap:assets
sudo gem install cocoapods   # one-time
yarn cap:ios                 # builds React, syncs, then opens Xcode
```

In Xcode:

1. Select target **App** → **Signing & Capabilities** → pick your Apple
   Developer Team. Xcode auto-creates the provisioning profile.
2. **Product → Archive** → **Distribute App → App Store Connect → Upload**.
3. The build appears in App Store Connect → TestFlight within ~20 min.

---

## 3. Building **without a Mac** (cloud build for iOS)

You asked for this — since you don't have a Mac, here are the three best
managed services that build the `.ipa` for you on macOS runners. All three
read the same `frontend/ios/` folder we've already committed.

### Option A · Codemagic (recommended, free tier covers small teams)

Best UX for Capacitor / Ionic apps; reads your repo, no YAML required.

1. Sign up at <https://codemagic.io/signup> (free 500 build min/month).
2. Connect your GitHub repo (use **Save to GitHub** from the Emergent chat
   first).
3. **Add application → React → Capacitor**. Codemagic auto-detects iOS &
   Android.
4. Project settings → **iOS code signing → Automatic**. Paste your **Apple
   Developer Team ID** and an **App Store Connect API key**
   ([how to generate](https://appstoreconnect.apple.com/access/integrations/api))
   — Codemagic handles certificates + provisioning end-to-end.
5. Hit **Start new build** → it produces an `.ipa` + uploads to TestFlight
   automatically.

Sample `codemagic.yaml` (drop it at repo root if you prefer config-as-code):

```yaml
workflows:
  ios-release:
    name: iOS Release
    environment:
      vars:
        XCODE_WORKSPACE: "frontend/ios/App/App.xcworkspace"
        XCODE_SCHEME: "App"
        BUNDLE_ID: "ai.teamnest.app"
      node: 20
      xcode: latest
      cocoapods: default
    scripts:
      - name: Install deps
        script: cd frontend && yarn install
      - name: Build web bundle
        script: cd frontend && yarn build
      - name: Capacitor sync iOS
        script: cd frontend && npx cap sync ios
      - name: Install pods
        script: cd frontend/ios/App && pod install
      - name: Build & sign IPA
        script: |
          xcode-project use-profiles
          xcode-project build-ipa \
            --workspace "$CM_BUILD_DIR/$XCODE_WORKSPACE" \
            --scheme "$XCODE_SCHEME"
    artifacts:
      - build/ios/ipa/*.ipa
    publishing:
      app_store_connect:
        api_key: $APP_STORE_CONNECT_PRIVATE_KEY
        key_id: $APP_STORE_CONNECT_KEY_IDENTIFIER
        issuer_id: $APP_STORE_CONNECT_ISSUER_ID
        submit_to_testflight: true
```

### Option B · Ionic Appflow

Owned by the Capacitor team. Cleanest dashboard, but the iOS package starts
at $49/mo (Launch plan).

* <https://ionic.io/appflow>
* Connect repo → pick **Capacitor** → upload your iOS signing certificate +
  App Store Connect API key → tap **Build iOS**.
* Bonus: Appflow's **Live Updates** lets you push a fresh React bundle to
  installed users without going through App Store review (huge for hotfixes).

### Option C · GitHub Actions with `macos-latest` runner

Free for public repos (2,000 min/month private). Most flexible, most YAML to
write.

Drop this at `.github/workflows/ios-build.yml`:

```yaml
name: iOS Build
on: { workflow_dispatch: {} }
jobs:
  ios:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'yarn', cache-dependency-path: frontend/yarn.lock }
      - run: cd frontend && yarn install --frozen-lockfile
      - run: cd frontend && yarn build
      - run: cd frontend && npx cap sync ios
      - run: cd frontend/ios/App && pod install
      - uses: apple-actions/import-codesign-certs@v3
        with:
          p12-file-base64: ${{ secrets.IOS_DIST_CERT_P12_BASE64 }}
          p12-password: ${{ secrets.IOS_DIST_CERT_PASSWORD }}
      - uses: apple-actions/download-provisioning-profiles@v3
        with:
          bundle-id: ai.teamnest.app
          issuer-id: ${{ secrets.APPSTORE_ISSUER_ID }}
          api-key-id: ${{ secrets.APPSTORE_KEY_ID }}
          api-private-key: ${{ secrets.APPSTORE_PRIVATE_KEY }}
      - run: |
          cd frontend/ios/App
          xcodebuild -workspace App.xcworkspace -scheme App \
            -configuration Release -archivePath build/App.xcarchive archive
          xcodebuild -exportArchive -archivePath build/App.xcarchive \
            -exportOptionsPlist ../../../docs/exportOptions.plist \
            -exportPath build/ipa
      - uses: apple-actions/upload-testflight-build@v1
        with:
          app-path: frontend/ios/App/build/ipa/App.ipa
          issuer-id: ${{ secrets.APPSTORE_ISSUER_ID }}
          api-key-id: ${{ secrets.APPSTORE_KEY_ID }}
          api-private-key: ${{ secrets.APPSTORE_PRIVATE_KEY }}
```

**Recommendation**: start with **Codemagic** — it has the gentlest learning
curve and a generous free tier. Move to GitHub Actions later if you want
everything in one place.

---

## 4. Pre-flight checklist before your first store submission

### Apple App Store

- [ ] Enroll in [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
- [ ] Create an App ID at <https://developer.apple.com/account/resources/identifiers> → bundle `ai.teamnest.app`
- [ ] In App Store Connect, create app record: name `TeamNest`, primary language English, bundle `ai.teamnest.app`
- [ ] Privacy policy URL (mandatory) — host `/privacy` page on `teamnest.ai`
- [ ] Screenshots: 6.7" (1290×2796), 6.5" (1284×2778), 5.5" (1242×2208) — at least 3 each
- [ ] App preview video (optional but boosts conversion)
- [ ] Age rating questionnaire
- [ ] Export compliance — already set to `false` in Info.plist

### Google Play

- [ ] Create [Google Play Console account](https://play.google.com/console) ($25 one-time)
- [ ] Generate signing keystore: `keytool -genkey -v -keystore teamnest-release.jks -alias teamnest -keyalg RSA -keysize 2048 -validity 10000`
- [ ] Store the keystore + password in a password manager (lose this = lose your app forever)
- [ ] App content: privacy policy URL, target audience, ads declaration, data safety form
- [ ] Screenshots: phone (1080×1920 min), 7" tablet, 10" tablet
- [ ] Feature graphic 1024×500
- [ ] Short description (80 chars) + full description (4000 chars)

### Required policy pages (host these on `teamnest.ai`)

* `/privacy` — privacy policy describing camera, mic, push, contacts usage
* `/terms` — terms of service
* `/support` — support contact (required for App Store)

---

## 5. Daily dev loop (after first build)

Anytime you change React code:

```bash
cd frontend
yarn cap:sync          # rebuilds web + copies into ios/ & android/
```

Anytime you change `capacitor.config.json` or install a Capacitor plugin:

```bash
cd frontend
yarn cap:sync          # plus the IDEs will prompt to "Sync project"
```

To preview the app on a connected device without rebuilding signed binaries:

* **Android** – `cd frontend/android && ./gradlew installDebug`
* **iOS** – open Xcode → ▶ on device

---

## 6. Live updates (no resubmission needed)

Because `capacitor.config.json` points `server.url` at `https://teamnest.ai`,
**all React/UI changes go live the moment you deploy the web app**. Users
don't need to download a new binary. You only need a new App Store /
Play submission when:

* You change `capacitor.config.json`
* You install/upgrade a Capacitor plugin
* You change native code in `ios/` or `android/`
* You bump the app version for new store metadata / screenshots

---

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `pod install` fails on M1/M2 Mac | `sudo arch -x86_64 gem install ffi` then `arch -x86_64 pod install` |
| Android build fails: "SDK location not found" | Create `frontend/android/local.properties` with `sdk.dir=/Users/you/Library/Android/sdk` |
| Push not arriving in TestFlight | Check **Apple → Keys → APNs Key** is uploaded to Codemagic / your build service; bundle ID must match exactly |
| White screen on launch | `yarn build` first; the iOS/Android assets need a fresh `build/` folder |
| Camera permission popup never appears | iOS — confirm `NSCameraUsageDescription` is in Info.plist (already done) |

---

**Questions?** Ping the Emergent agent — most issues boil down to
certificates, bundle IDs, or stale `yarn cap:sync`.
