# TeamNest.ai — App Store Submission Kit (Iteration 46)

Generated on 2026-06-01. Use this as your single source of truth for both
Apple App Store Connect and Google Play Console.

---

## 1. App Identity

| Field | Value |
|-------|-------|
| **App name** | TeamNest.ai |
| **Subtitle / Short description** | AI team chat with calls, transcription & memory |
| **Bundle ID (iOS)** | `ai.teamnest.app` |
| **Application ID (Android)** | `ai.teamnest.app` |
| **Category — Primary** | Business |
| **Category — Secondary** | Productivity |
| **Age rating** | 4+ (no objectionable content) |
| **Pricing tier** | Free (in-app subscription tier) |
| **Default language** | English (US) |
| **Privacy URL** | https://teamnest.ai/legal/privacy |
| **Terms / EULA URL** | https://teamnest.ai/legal/eula |
| **Support URL** | https://teamnest.ai/support |
| **Marketing URL** | https://teamnest.ai |

---

## 2. Short Promotional Text (30 chars) — App Store

```
AI-native team chat & calls
```

## 3. Subtitle (30 chars) — App Store

```
Chat. Call. Transcribe. Recall.
```

## 4. Short description (80 chars) — Play Store

```
AI chat, calls & transcription for teams. Memory that never forgets a meeting.
```

---

## 5. Full Description (4000 chars max) — Both Stores

```
TeamNest.ai is the AI-native team workspace that thinks alongside you.

Built for fast teams who refuse to lose context between chats, calls, and
meetings, TeamNest combines WhatsApp-simple group chat with first-class AI
employees, audio + video calls with live transcription, and a persistent
memory layer that lets the AI quote your past decisions back to you.

WHAT YOU GET

▸ Group chat with @mention AI
   Tag @AI, @Paralegal, @CMO, @Bookkeeper, or @CFO inside any chat and get
   instant answers grounded in your team's context.

▸ Audio & video calls with live transcription
   One-tap calls inside any chat. Team plan includes live transcription
   during calls + unlimited recorded transcription. Pro gets post-call
   transcription at 10 credits per minute. AI meeting summaries are 20
   credits per call across all plans.

▸ AI Employees that get smarter every week
   Hire an AI Paralegal, AI CMO, AI Bookkeeper, AI Sales Rep, or AI CFO.
   Each tracks hours saved and dollars saved on your savings dashboard.

▸ Persistent team memory (RAG)
   TeamNest remembers every decision, doc, call summary, and policy. Ask
   "what did we decide about Q3 pricing?" and get a citation, not a guess.

▸ AI Billing & Permissions per group
   5 billing modes (Workspace pays, Requester pays, Sponsor pays, Split,
   Guest-disabled). Set per-question caps, monthly budgets, premium-model
   gates, and approval thresholds per group.

▸ Built-in integrations
   Stripe billing, QuickBooks bookkeeping, Plaid auto-statement download,
   Twilio SMS invites, Meta social analytics, biometric MFA.

▸ Mobile-first, native
   Capacitor-powered iOS & Android apps. Push notifications, contact-book
   sync, biometric login (Face ID / Touch ID / Android Biometric).

PRICING

• Free — $0. 300 AI credits / workspace / month.
• Pro — $9.99 / seat / month. 3,000 credits / seat. Post-call transcription.
• Team — $19.99 / seat / month. 9,000 credits / seat. FREE live
  transcription + unlimited recorded transcription.
• Enterprise — Custom. SSO, SOC 2, dedicated CSM.

WHY TEAMS PICK TEAMNEST

• AI is built in, not bolted on.
• You see who pays for each AI call, before it costs you.
• Your meetings transcribe themselves and your memory layer cites them.
• Per-seat pricing scales with your team — no surprise bills.

Start free at teamnest.ai. No credit card required.
```

---

## 6. Keywords (100 chars, comma-separated) — App Store

```
team chat,AI,collaboration,calls,transcription,meetings,WhatsApp,Slack,workspace,memory,RAG,AI agent
```

---

## 7. App Store Categories

- **Primary**: Business
- **Secondary**: Productivity

## Google Play Categories

- **Application category**: Business
- **Tags**: Communication · Collaboration · Productivity

---

## 8. "What's New in This Version" (release notes)

### v1.0.0 — First public release

```
Welcome to TeamNest.ai! 🎉

This is our first public release on the App Store and Play Store.

Highlights:
• WhatsApp-simple group chat with @mention AI Employees
• Audio & video calls with live transcription (Team plan)
• AI Billing & Permissions per group — control who pays for AI
• Per-seat pricing — pay only for active seats
• Contact-book auto-sync (with permission) for one-tap invites
• Biometric login with Face ID / Touch ID / Android Biometric
• Native push notifications

If you spot anything off, email us at support@teamnest.ai. We reply within
4 business hours.
```

---

## 9. Reviewer Demo Account

Apple and Google reviewers need a working login. Provide:

```
Email:    reviewer@teamnest.ai     (we'll provision this fresh for review)
Password: AppleReview!2026
Workspace: "Apple Review Demo"
Notes:    Pre-populated with 1 group chat, 1 AI Employee subscription, and
          1 sample document so reviewers don't see an empty state.
```

⚠️ Create this account in production BEFORE submitting to review. Use the
admin endpoint `POST /api/admin/seed-reviewer-account` (TODO if not built).

---

## 10. Review Notes (App Store Connect → "Notes for the Reviewer")

```
TeamNest.ai is a B2B team-collaboration app with built-in AI assistants.

LOGIN
- Tap "Try the demo" on the launch screen, or use the credentials above.
- The demo workspace contains pre-seeded conversations and an AI Employee
  subscription so reviewers don't see empty states.

REQUIRED PERMISSIONS
- Microphone: required for audio calls and voice notes. Optional —
  reviewers can deny and the app still works (calls are gated behind a
  pre-flight check that explains the requirement clearly).
- Camera: optional, only used during video calls.
- Contacts: optional, only used by the in-app "Invite from your contacts"
  feature. Contacts are SHA-256 hashed client-side before being sent for
  matching — raw phone numbers never leave the device.
- Push notifications: optional, for chat & call alerts.

THIRD-PARTY ACCOUNTS
- No external accounts are required to evaluate the app.
- All in-app purchases (Pro $9.99/seat/mo, Team $19.99/seat/mo) go through
  Stripe checkout in the system browser. Apple is not the seller of record
  for these B2B SaaS subscriptions (per App Store Review Guideline 3.1.3(b)
  "Reader" app provisions — TeamNest is a business management tool).
- Email & calendar integrations are optional and not exercised in review.

PRIVACY
- We never sell user data.
- All data is encrypted at rest (MongoDB Atlas) and in transit (TLS 1.3).
- Privacy policy: https://teamnest.ai/legal/privacy
- EULA: https://teamnest.ai/legal/eula

CONTACT
- support@teamnest.ai — replies within 4 business hours.
- For App Review urgent matters: amit@teamnest.ai
```

---

## 11. Privacy Manifest — App Store Required Reasons API

iOS 17+ requires `PrivacyInfo.xcprivacy`. We use:

| API category | Reason code | Rationale |
|--------------|-------------|-----------|
| `NSPrivacyAccessedAPIUserDefaults` | `CA92.1` | App preferences (theme, last workspace) |
| `NSPrivacyAccessedAPIFileTimestamp` | `C617.1` | File picker for chat attachments |
| `NSPrivacyAccessedAPISystemBootTime` | `35F9.1` | Network reachability heuristics |
| `NSPrivacyAccessedAPIDiskSpace` | `E174.1` | Offline-cache size check before downloads |

Stub file at `frontend/ios/App/App/PrivacyInfo.xcprivacy` — verify before
each archive.

---

## 12. Data Safety / App Privacy disclosures

### Data collected (linked to user identity)
- Email address — account creation
- Phone number (optional) — SMS invites & Twilio bridging
- Phone book hashes (only if user opts in) — contact matching
- Chat message contents — stored for the user's own retrieval & RAG
- Audio recordings (only when user records) — stored for transcription
- Stripe customer ID — billing

### Data collected (not linked to identity)
- Crash logs (Sentry, planned)
- Anonymous feature usage analytics (PostHog, planned)

### Data NOT collected
- Browsing history outside the app
- Location
- Health data
- Financial data outside what the user explicitly imports via Plaid /
  QuickBooks (which they revoke at any time)

---

## 13. App Tracking Transparency (ATT)

We do NOT track users across apps & websites. ATT prompt is not required.

---

## 14. Pre-submission Checklist

- [ ] Bump `version` in `frontend/ios/App/App.xcodeproj` → 1.0.0
- [ ] Bump `versionCode` in `frontend/android/app/build.gradle` → 1
- [ ] Add `PrivacyInfo.xcprivacy` (see section 11)
- [ ] Provision `reviewer@teamnest.ai` demo account in production
- [ ] Set `STRIPE_PRO_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`,
      `STRIPE_TEAM_PRICE_ID`, `STRIPE_TEAM_ANNUAL_PRICE_ID` in production env
- [ ] Generate App Store screenshots (6.7", 6.1", 5.5" iPhone + 12.9" iPad)
      and Play Store screenshots (Phone, 7" tablet, 10" tablet)
- [ ] Verify push notification entitlement in `App.entitlements`
- [ ] Run `cd frontend && npx cap sync ios && npx cap sync android`
- [ ] In Xcode, Archive & Distribute → App Store Connect → TestFlight first
- [ ] In Android Studio, Generate Signed Bundle → Internal Testing track first

---

## 15. Screenshot Capture Targets

Capture from `/chats` (group with AI replies), `/employees` (savings
dashboard), `/billing` (pricing tiles), and `/call/new` (preflight screen).

iOS dimensions:
- 6.7" → 1290 × 2796
- 6.1" → 1170 × 2532
- 5.5" → 1242 × 2208
- 12.9" iPad → 2048 × 2732

Android:
- Phone → 1080 × 1920 minimum
- 7" tablet → 1200 × 1920
- 10" tablet → 1920 × 1200

Tip: open https://teamnest.ai in Chrome → DevTools → Device Toolbar →
custom dimensions → screenshot full page.
