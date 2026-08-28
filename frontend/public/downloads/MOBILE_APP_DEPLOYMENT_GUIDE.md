# TeamNest Mobile App — Store Submission Guide

**Audience**: Your programming team
**Goal**: Get TeamNest on the **Apple App Store** and **Google Play Store**
**Bundle ID / Application ID**: `ai.teamnest.app`
**Display name**: TeamNest

This guide assumes you have the project zip (`teamnest-mobile.zip`) and the following credentials:

- ✅ Apple App Store login + paid Apple Developer Program ($99/year)
- ✅ Google Play Console login (one-time $25 dev fee)

---

## What's in the zip?

```
teamnest-mobile/
├── frontend/                       # React source (Capacitor wraps this)
│   ├── src/                        # All React code
│   ├── capacitor.config.json       # Native app config (bundle id, name)
│   ├── ios/                        # Xcode project — DO NOT EDIT manually
│   ├── android/                    # Gradle project — DO NOT EDIT manually
│   ├── resources/                  # icon.png (1024²) + splash.png (2732²)
│   ├── store-assets/               # Pre-rendered screenshots + feature graphic + app preview video
│   ├── package.json
│   └── yarn.lock
├── CAPACITOR.md                    # Architecture reference
├── MOBILE_APP_DEPLOYMENT_GUIDE.md  # This file
└── README_FOR_DEVS.md              # First-read summary
```

The native projects under `frontend/ios/` and `frontend/android/` are **already wired up** with all required plugins, permissions, and `Info.plist` entries. Your team does NOT need to run `npx cap init` or `npx cap add ios/android`.

---

## Prerequisite tooling

Your developer's machine needs:

| Tool | Required for | Where |
|---|---|---|
| **Node 20+** + **yarn** | Build the React bundle | <https://nodejs.org> |
| **Android Studio** (latest) | Build & sign the Android `.aab` | <https://developer.android.com/studio> |
| **Xcode 15+** (Mac only) | Build & sign the iOS `.ipa` | Mac App Store |
| **CocoaPods** (Mac only) | `pod install` for iOS deps | `sudo gem install cocoapods` |
| **JDK 17+** | Android Gradle builds | Bundled with Android Studio |

> No Mac? Skip Xcode and use the **Codemagic cloud build** path under iOS Step B below.

---

# 🟢 Part A — Android (Google Play Store)

### Step 1 · Unzip & install deps

```bash
unzip teamnest-mobile.zip
cd teamnest-mobile/frontend
yarn install
```

### Step 2 · Generate icons + splashes (one-time)

```bash
yarn cap:assets
```

This populates every density-bucket inside `android/app/src/main/res/`.

### Step 3 · Build the React bundle & sync to Android

```bash
yarn cap:android
```

This runs three things automatically:
1. `yarn build` — produces `build/`
2. `npx cap sync android` — copies the bundle into `android/app/src/main/assets/public/`
3. Opens **Android Studio** with the project pre-loaded

Wait for **Gradle sync** in the status bar to finish (~2-5 min first time).

### Step 4 · Generate the signing keystore (FIRST RELEASE ONLY)

> ⚠️ **Critical**: lose this keystore = lose ability to push updates to existing installs forever. Back it up in two places.

In a terminal:

```bash
keytool -genkey -v \
  -keystore teamnest-release.jks \
  -alias teamnest \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Answer the prompts (organization name, OU, country, etc.). When done, copy `teamnest-release.jks` somewhere safe (1Password / vault). Note the **keystore password**, the **key alias** (`teamnest`), and the **key password** — you'll re-enter them every release.

### Step 5 · Build the signed App Bundle (.aab)

In Android Studio:

1. **Build → Generate Signed App Bundle / APK**
2. Choose **Android App Bundle** → Next
3. Browse to your `teamnest-release.jks`, enter passwords, alias
4. Build variant: **release**
5. Click **Finish**

Output: `frontend/android/app/release/app-release.aab` (~10-15 MB).

### Step 6 · Upload to Play Console

1. Open <https://play.google.com/console>
2. **Create app** → name `TeamNest`, default lang **English (United States)**, app/game = **App**, free/paid = **Free**, accept declarations
3. From the left nav, fill in:
   - **App content** → privacy URL `https://teamnest.ai/privacy`, target audience (18+), data safety form (mark Personal Info / Camera / Mic / Audio), ads = no
   - **Main store listing**:
     - **Short description** (80 chars): `AI-native team chat. 6 AI models in one workspace. Real research, no toggling.`
     - **Full description**: paste from `frontend/store-assets/README.md`
     - **App icon**: upload `frontend/resources/icon.png` (Play resizes itself)
     - **Feature graphic** (1024×500): `frontend/store-assets/android/feature_graphic.png`
     - **Phone screenshots** (min 2, up to 8): everything in `frontend/store-assets/android/phone/*.png`
     - **Promo video** (optional): upload `frontend/store-assets/app_preview.mp4` to YouTube first, paste the URL
4. **Production → Create new release**
5. **Upload** the `app-release.aab` from Step 5
6. **Release notes** (English US): `First release — chat with your team and 6 AI models in one place.`
7. **Review release** → **Start rollout to production**

Google reviews within **1–7 days**. You'll get an email when approved.

---

# 🍎 Part B — iOS (Apple App Store)

Choose **B1** if you have a Mac, otherwise **B2** (cloud).

## B1 · Build on a Mac (fastest)

### Step 1 · Install deps & open Xcode

```bash
cd teamnest-mobile/frontend
yarn install
sudo gem install cocoapods    # one-time
yarn cap:assets               # generates iOS app icons
yarn cap:ios                  # builds + syncs + opens Xcode
```

When Xcode opens, click **Trust** if prompted and let it index (~1 min).

### Step 2 · Configure signing in Xcode

1. In the left tree, click **App** (the blue project icon)
2. Top middle: select the **App** target
3. Tab: **Signing & Capabilities**
4. **Team**: pick your Apple Developer account
5. **Bundle Identifier**: confirm it shows `ai.teamnest.app`
6. Check **Automatically manage signing** — Xcode creates the provisioning profile

### Step 3 · Archive & upload

1. In Xcode top bar: select device target = **Any iOS Device (arm64)**
2. **Product → Archive** (takes ~3-5 min)
3. When done, the **Organizer** window opens
4. Click **Distribute App → App Store Connect → Upload → Next**
5. Use **Automatically manage signing** → Next → Upload

Wait ~15-20 min. Then the build appears in App Store Connect → TestFlight.

### Step 4 · Configure App Store Connect

1. Go to <https://appstoreconnect.apple.com> → **My Apps → +** → **New App**
2. Platform: **iOS** · Name: **TeamNest** · Primary language: **English (US)** · Bundle ID: `ai.teamnest.app` · SKU: `teamnest-ios`
3. **App Information**:
   - Subtitle: `AI-native team chat`
   - Category: Primary **Productivity**, Secondary **Business**
4. **Pricing**: Free, all territories
5. **App Privacy** → Get Started:
   - Data Types collected: Email, Name, User ID, Messages, Audio Data, Photos, Phone Number
   - Used for: App Functionality, Analytics
   - Linked to user: Yes
   - Used for tracking: **No**
6. **Privacy Policy URL**: `https://teamnest.ai/privacy`
7. **App Review Information**:
   - Sign-in info: `amit@demo.team` / `DemoPass123!` (demo account — pre-seeded)
   - Contact: your team's email + phone
   - Notes: `Use the "Try demo workspace" button on the welcome screen for fastest review — pre-populated workspace with 5 users, sample chats, tasks, and AI threads.`
8. **Version Information** (1.0.0):
   - **Promotional text** (170 char): `Chat with your team and six AI models side-by-side. Compare answers, save research, turn decisions into tasks — without leaving the conversation.`
   - **Description**: paste from `frontend/store-assets/README.md`
   - **Keywords**: `ai,chat,team,collaboration,gpt,claude,gemini,productivity,research,workspace`
   - **Support URL**: `https://teamnest.ai/support`
   - **Marketing URL** (optional): `https://teamnest.ai`
9. **Screenshots** — upload these per device size:
   - **6.7" iPhone** (1290×2796): `frontend/store-assets/ios/6.7-inch/*.png`
   - **6.5" iPhone** (1284×2778): `frontend/store-assets/ios/6.5-inch/*.png`
   - **5.5" iPhone** (1242×2208): `frontend/store-assets/ios/5.5-inch/*.png`
10. **App Preview** (optional but boosts conversion ~25%):
    - 6.7" preview: `frontend/store-assets/ios/app_preview_6.7inch.mp4`
11. **Build**: scroll to "Build" section, click **+ Select Build** → pick the build that appeared from Step 3 (may take 30 min after upload to show up)
12. **Age Rating**: answer the questionnaire — TeamNest = **4+**
13. **Export Compliance**: select **No** (we already declared `ITSAppUsesNonExemptEncryption=false` in `Info.plist`)
14. Top right → **Add for Review** → **Submit to App Review**

Apple reviews within **24–48 hours**.

---

## B2 · Build without a Mac (Codemagic cloud)

For teams without macOS hardware. Costs $0/mo (500 free build min) up to ~$28/mo for unlimited.

### Step 1 · Push the zip's contents to your GitHub repo

(If you already have a repo: skip to Step 2)

```bash
cd teamnest-mobile
git init
git add .
git commit -m "Initial Capacitor scaffold"
git remote add origin https://github.com/YOUR-ORG/teamnest-mobile.git
git push -u origin main
```

### Step 2 · Create an App Store Connect API key

1. <https://appstoreconnect.apple.com/access/integrations/api>
2. **Generate API Key** → name: `Codemagic` → access: **App Manager** → Generate
3. Download the `.p8` file
4. Note the **Key ID** and the **Issuer ID** (shown on the page)

### Step 3 · Connect Codemagic

1. Sign up at <https://codemagic.io/signup>
2. **Add application** → connect GitHub → pick the `teamnest-mobile` repo
3. Choose framework: **Capacitor**
4. **Teams → Integrations → Apple Developer Portal** → upload the `.p8`, paste Key ID + Issuer ID
5. Back on your app → **iOS code signing → Automatic** → select Team & bundle `ai.teamnest.app`
6. Click **Start new build**

The build runs on Codemagic's macOS runner (~12 min), produces a signed `.ipa`, and uploads it directly to TestFlight.

### Step 4 · Continue from "Step 4 · Configure App Store Connect" above

Same flow as B1 — fill out App Store Connect, pick the build, submit.

---

# 🔁 Pushing future updates

You'll only need a brand-new submission when:
- You change `frontend/capacitor.config.json`
- You install or upgrade a Capacitor plugin
- You touch native code in `ios/` or `android/`
- You bump the version number for new screenshots

**Pure React/UI changes** go live the moment you deploy the web app — `capacitor.config.json` points `server.url` at `https://teamnest.ai`, so the native shell always loads the latest production web bundle. **No App Store re-review needed.**

For native bumps, increment **two** version numbers in lockstep:

| Platform | File | Field |
|---|---|---|
| iOS | `frontend/ios/App/App.xcodeproj/project.pbxproj` (or in Xcode → Target → General) | `MARKETING_VERSION` (1.0.0 → 1.1.0) + `CURRENT_PROJECT_VERSION` (1 → 2) |
| Android | `frontend/android/app/build.gradle` | `versionCode` (1 → 2) + `versionName` ("1.0" → "1.1") |

Then re-run `yarn cap:android` / `yarn cap:ios` and repeat the upload steps.

---

# 🚨 Common gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `pod install` fails on Apple Silicon | x86 native deps | `sudo arch -x86_64 gem install ffi && cd ios/App && arch -x86_64 pod install` |
| Android build: "SDK location not found" | Studio not set up | Create `frontend/android/local.properties` with `sdk.dir=/path/to/Android/sdk` |
| White screen on launch | Stale build/ | Delete `frontend/build/` and re-run `yarn cap:android` |
| TestFlight build never appears | Code signing mismatch | Check Apple Developer → Certificates and re-import in Xcode |
| Push notifications don't arrive on device | APNs key missing | Apple Developer → Keys → Create APNs Key → upload to your push backend |
| Camera permission popup missing | `Info.plist` stripped | Already configured — confirm `NSCameraUsageDescription` is in `frontend/ios/App/App/Info.plist` |
| App rejected: "metadata mismatch" | Demo creds not working | Verify `amit@demo.team` / `DemoPass123!` still seeded in production |

---

# 📦 Where to upload what — quick reference

| Where | File |
|---|---|
| **App Store** Privacy URL | `https://teamnest.ai/privacy` |
| **App Store** Support URL | `https://teamnest.ai/support` |
| **App Store** Marketing URL | `https://teamnest.ai` |
| **App Store** 6.7" screenshots | `frontend/store-assets/ios/6.7-inch/*.png` |
| **App Store** 6.5" screenshots | `frontend/store-assets/ios/6.5-inch/*.png` |
| **App Store** 5.5" screenshots | `frontend/store-assets/ios/5.5-inch/*.png` |
| **App Store** App preview video | `frontend/store-assets/ios/app_preview_6.7inch.mp4` |
| **Play Console** Privacy URL | `https://teamnest.ai/privacy` |
| **Play Console** Feature graphic | `frontend/store-assets/android/feature_graphic.png` |
| **Play Console** Phone screenshots | `frontend/store-assets/android/phone/*.png` |
| **Play Console** Promo video | upload `frontend/store-assets/app_preview.mp4` to YouTube, paste URL |
| **Both stores** App icon source | `frontend/resources/icon.png` |
| **Both stores** Marketing copy | `frontend/store-assets/README.md` |

---

# ✅ Pre-submission checklist

Before tapping **Submit for Review** on either store:

- [ ] App launches and loads `https://teamnest.ai` correctly on a real device
- [ ] Demo login (`amit@demo.team` / `DemoPass123!`) works through the native shell
- [ ] Camera, mic, photo permissions all prompt with friendly copy
- [ ] Push notification permission prompt appears on first launch
- [ ] Sign out works (cookie cleared on backend)
- [ ] Both stores have privacy + support URLs set
- [ ] Screenshots show real-looking content (no Lorem ipsum)
- [ ] Bundle ID is `ai.teamnest.app` in **both** stores
- [ ] Demo workspace data is seeded in production DB
- [ ] Keystore (.jks) backed up in two locations

---

Questions? Reach out to the Emergent engineering team — most rejections boil down to (a) demo account access, (b) privacy URL missing, (c) crash on first launch from screenshot of a stale build.

Good luck, and welcome to App Store & Play! 🚀
