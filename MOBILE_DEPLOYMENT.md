# 📱 Deploying TeamNest.ai to iOS & Android App Stores

> **TL;DR**: Capacitor is fully scaffolded. You build & ship the apps via **Codemagic** (cloud CI — no Mac required). Total elapsed time: ~3-7 days (most of that is waiting for Apple's developer account approval).

---

## What's already done ✅

* React app wrapped in **Capacitor v7** native shell.
* iOS Xcode project: `frontend/ios/App/App.xcworkspace`
* Android Gradle project: `frontend/android/`
* `capacitor.config.json` configured (`appId: ai.teamnest.app`, splash, status bar).
* Native plugins installed: App, Splash Screen, Status Bar, Haptics, Keyboard.
* CI pipeline ready: `/app/codemagic.yaml`.

---

## What you need to do (one-time setup)

### Step 1 — Apple Developer Program ($99/yr)

1. Go to https://developer.apple.com/programs/enroll/
2. Use your existing Apple ID (or create a new one).
3. Enroll as an **Individual** (~$99/yr) or **Organization** (~$99/yr but requires D-U-N-S number for businesses).
4. Wait 24-48 hrs for approval.
5. Once approved, log in to **App Store Connect** (https://appstoreconnect.apple.com) and create a new app:
   * Platforms: iOS
   * Name: `TeamNest.ai`
   * Primary language: English
   * Bundle ID: `ai.teamnest.app` *(must match `capacitor.config.json`)*
   * SKU: `teamnest-ai-001`

### Step 2 — Google Play Console ($25 one-time)

1. Go to https://play.google.com/console/signup
2. Pay the $25 registration fee (one-time, lifetime).
3. Create a new app:
   * App name: `TeamNest.ai`
   * Default language: English
   * App or game: App
   * Free or paid: Free *(in-app purchases enabled later via Stripe webview)*
4. Note your app's **package name**: `ai.teamnest.app` *(must match `capacitor.config.json`)*

### Step 3 — Codemagic account (free starter tier)

1. Go to https://codemagic.io and sign up.
2. Connect your **GitHub** account (where the TeamNest.ai code lives).
3. Click **Add Application** → select the TeamNest.ai repo.
4. Codemagic will detect `codemagic.yaml` at the repo root automatically.

### Step 4 — Upload signing credentials to Codemagic

This is the most fiddly bit, but Codemagic has a UI walkthrough for each.

**For Android:**
1. Generate a keystore on your machine (only need to do this ONCE — keep this file safe forever, you can't update the app without it):
   ```bash
   keytool -genkey -v -keystore teamnest-release.jks -alias teamnest -keyalg RSA -keysize 2048 -validity 10000
   ```
2. In Codemagic: **Teams → [Your team] → Code signing identities → Android keystores**
3. Upload `teamnest-release.jks`, name it `tn_android_keystore` (matches `codemagic.yaml`).
4. Save the keystore password, key alias, and key password in 1Password.

**For Google Play upload:**
1. In Google Play Console → **Setup → API access → Create new service account**.
2. Follow the wizard to create a service account in Google Cloud, give it **Release Manager** permission.
3. Download the JSON key file.
4. In Codemagic: **Environment variables** → add `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` → paste the JSON content.

**For iOS signing:**

Easiest path: enable **Codemagic-managed signing** (Codemagic generates + rotates certs for you).

1. In Codemagic: **Teams → [Your team] → Code signing identities → iOS code signing → App Store Connect API integrations**.
2. In App Store Connect: **Users and Access → Keys → +** to create an API key with **App Manager** role.
3. Download the `.p8` file, copy the Key ID and Issuer ID.
4. Paste them into Codemagic.
5. Codemagic will auto-create the distribution certificate and provisioning profile named `tn_distribution_cert` and `tn_appstore_profile` (matching `codemagic.yaml`).

### Step 5 — Trigger your first build

```bash
git push origin main
```

Codemagic auto-detects the push, runs both workflows in parallel:
* `android-release` → ~8-12 min → uploads to **Internal testing track** in Play Console
* `ios-release` → ~15-25 min → uploads to **TestFlight**

You'll get email notifications when each finishes.

### Step 6 — Test internally

* **TestFlight**: Install the [TestFlight](https://apps.apple.com/app/testflight/id899247664) app on your iPhone. Open the email Apple sends, tap **Install**. New TestFlight builds auto-update.
* **Play Console Internal Testing**: In Play Console → Internal testing → invite your email → install via the link Google emails.

### Step 7 — Submit for public release

When you're happy with the TestFlight / Internal-test builds:

**iOS** (App Store review takes 1-7 days):
1. App Store Connect → your app → **App Store** tab → **Prepare for Submission**.
2. Fill in app description, screenshots (6.7" iPhone + 12.9" iPad), privacy policy URL, age rating questionnaire, etc.
3. Click **Submit for Review**.

**Android** (Play Store review takes 1-3 days):
1. Play Console → your app → **Production track** → **Create new release**.
2. Promote the build from Internal → Production.
3. Fill in store listing (screenshots, description, content rating).
4. Click **Send for review**.

---

## 🔁 Day-to-day workflow

After the one-time setup, every new release is just:

```bash
git commit -m "Add awesome new feature"
git push origin main
```

Codemagic does the rest. Both stores receive new builds automatically.

If you want to release to TestFlight/Internal **only on specific commits** rather than every push, change the trigger in `codemagic.yaml` to use tag patterns:

```yaml
tag_patterns:
  - pattern: "ios-v*"
    include: true
```

Then release with `git tag ios-v1.0.5 && git push --tags`.

---

## 🎨 App icons + splash screen

The default icons are placeholders. Replace them before submitting:

1. Place a 1024×1024 PNG at `frontend/public/icon-source.png`.
2. Install `@capacitor/assets`:
   ```bash
   cd frontend
   yarn add -D @capacitor/assets
   ```
3. Generate all required sizes:
   ```bash
   npx @capacitor/assets generate --iconBackgroundColor "#0a0a0a" --splashBackgroundColor "#0a0a0a"
   ```
4. Commit + push.

---

## 💰 Cost summary

| Item | Cost | Frequency |
|---|---|---|
| Apple Developer Program | $99 | Per year |
| Google Play Console | $25 | One-time |
| Codemagic | $0 / 500 min/mo | Free tier covers ~25 builds |
| Codemagic Pro (if needed) | $99/mo | Optional — only if you outgrow free tier |

---

## ⚠️ Common gotchas

* **Bundle ID mismatch**: `capacitor.config.json` says `ai.teamnest.app`. Make sure App Store Connect, Play Console, and Codemagic all use the **same** identifier.
* **Don't change the Android keystore** after first release. Google rejects updates signed with a different key. Keep `teamnest-release.jks` in a secure password manager forever.
* **iOS rejection for "wrapped website"**: Apple sometimes rejects Capacitor apps as too web-shaped. Mitigation: ensure native plugins are used (haptics, push notifications) and that the app has features that "feel native" (we already have haptic feedback hooks set up).
* **`@capacitor/push-notifications`** is NOT included by default. Add later when you build push notifications: `yarn add @capacitor/push-notifications`.

---

## 🆘 Where to get help

* Capacitor docs: https://capacitorjs.com/docs
* Codemagic Slack: https://slack.codemagic.io
* Apple Developer support: https://developer.apple.com/contact/
* This codebase: just ping in the chat and I'll help you debug.
