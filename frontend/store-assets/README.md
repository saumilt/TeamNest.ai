# TeamNest · App Store + Play Store Assets

Pre-generated, store-ready screenshots and marketing artwork for the **TeamNest** native apps.

## What's in this folder

```
store-assets/
├── README.md                       ← you are here
├── raw/                            ← unframed source screenshots (1290×2796)
│   ├── 01_welcome.png
│   ├── 02_group_chat.png
│   ├── 03_ai_compare.png
│   ├── 04_tasks.png
│   ├── 05_billing.png
│   ├── 06_dashboard.png
│   └── app_preview.webm            ← raw 15-sec walkthrough recording
│
├── ios/
│   ├── 6.7inch/                    ← 1290×2796 — iPhone 15/16 Pro Max, 14/15 Plus
│   │   └── 01..06_*.png
│   ├── 6.5inch/                    ← 1284×2778 — iPhone Xs Max, 11 Pro Max
│   │   └── 01..06_*.png
│   ├── 5.5inch/                    ← 1242×2208 — iPhone 8 Plus (still required by Apple)
│   │   └── 01..06_*.png
│   └── app_preview_6.7inch.mp4     ← 15-sec H.264 MP4 (1080×1920) — App Store preview
│
└── android/
    ├── phone/                      ← 1080×1920 — Pixel, Samsung phones
    │   └── 01..06_*.png
    ├── feature_graphic.png         ← 1024×500 — Google Play storefront banner
    └── app_preview.mp4             ← same 15-sec MP4 — Play Store promo video
```

Every framed screenshot includes:
- Bold caption + sub-caption at the top
- The actual app screenshot with rounded corners + yellow accent border
- Solid dark brand background

### Required policy pages — **already live on teamnest.ai**

| URL | Status | Notes |
| --- | --- | --- |
| `https://teamnest.ai/privacy`   | ✅ Live | GDPR / CCPA / DPDP compliant. Lists OpenAI / Anthropic / Google / Deepgram / Stripe as sub-processors. |
| `https://teamnest.ai/terms`     | ✅ Live | Subscription, AUP, AI disclaimer, arbitration clause, $100 liability cap. |
| `https://teamnest.ai/support`   | ✅ Live | support@ / security@ / privacy@ / legal@ contact tiles + FAQ. |

Paste these URLs directly into:
- App Store Connect → App Information → **Privacy Policy URL** = `https://teamnest.ai/privacy`
- App Store Connect → App Information → **Support URL**         = `https://teamnest.ai/support`
- Play Console → Store presence → **Privacy policy**             = `https://teamnest.ai/privacy`
- Play Console → Store presence → **Email / Website**            = `support@teamnest.ai` / `https://teamnest.ai/support`

Need a different jurisdiction? Edit `frontend/src/pages/legal/*.jsx` and deploy.

---

## How to use

### Apple App Store (App Store Connect)

1. Go to **App Store Connect → My Apps → TeamNest → App Store tab**.
2. Under **Screenshots**, click the **6.7" Display** slot (required).
3. Upload all 6 PNGs from `ios/6.7inch/` in order (01 → 06). The first 2 are
   what most users see — those have the strongest taglines.
4. Repeat for the **6.5" Display** slot with `ios/6.5inch/`.
5. **5.5" Display** is technically optional now but recommended for older
   device coverage — upload `ios/5.5inch/`.
6. **App Preview** (optional, but boosts install rate ~25%): under the same
   6.7" Display section, click **App Preview → Upload** and select
   `ios/app_preview_6.7inch.mp4`. 1080×1920, H.264, 15 sec, ~1 MB.

Apple requires **at least 3 screenshots per slot**; we provide 6 so you can pick.

### Google Play (Play Console)

1. Go to **Play Console → Your App → Grow → Store presence → Main store listing**.
2. **Phone screenshots** section — upload `android/phone/*.png` (min 2, max 8).
3. **Feature graphic** section — upload `android/feature_graphic.png` (1024×500).
4. **Promo video** (optional but recommended): upload `android/app_preview.mp4`
   to YouTube first (Play Console only accepts YouTube links), then paste the
   URL in **Promo video** field. The 15-sec MP4 will lift install rate ~15%.
5. **App icon** — use the existing `frontend/resources/icon.png` (1024×1024).

Play also asks for 7" and 10" tablet screenshots. You can either:
- Re-run the capture script with a tablet viewport, or
- Skip them — phone-only listings are accepted (just lower-priority in Play search).

## Marketing copy (paste these directly into the stores)

### Short description (Google Play — 80 chars max)
> Team chat + 6 AIs + tasks. Ask GPT, Claude & Gemini together. Built for teams.

### Full description (4000 chars max — copy below)

```
TeamNest is the AI-native team workspace where chat, research, decisions,
and tasks live in the same thread.

✦ ASK 6 AIs THE SAME QUESTION
ChatGPT, Claude, Gemini, DeepSeek, Perplexity and Grok answer side-by-side.
We auto-synthesize the best answer so you don't have to compare them yourself.

✦ CHAT THAT KNOWS YOUR TEAM
Real-time group chats with @mentions, reactions, voice notes, file uploads,
and pinned messages. Workspaces for every project.

✦ DECISIONS BECOME TASKS — AUTOMATICALLY
Type @task in any message and TeamNest creates a kanban task, assigns it,
and reminds the right person. Convert any AI answer into an action item.

✦ VIDEO + AUDIO CALLS WITH LIVE TRANSCRIPTION
Sub-second live captions powered by Deepgram. Auto-generated meeting
summaries the second the call ends.

✦ PROJECT FOLDERS
Save AI research threads, files, and chats into project folders. Share a
public snapshot link to anyone — no signup required for the viewer.

✦ FREE FOREVER. PRO WHEN YOU NEED IT.
Every workspace starts free with 300 AI credits/month. Upgrade for unlimited
premium models, longer threads, and team admin controls.

Built by Emergent for fast-moving teams who don't want to babysit six AI tabs.
Web, iOS, and Android — same app, same workspace.

Try the demo workspace from the welcome screen — no signup needed.
```

### App preview tagline (75 chars — App Store subtitle)
> AI-native team chat — ask, decide, assign together.

### Keywords (App Store — 100 chars, comma-separated)
> team chat,ai,gpt,claude,gemini,project,task,kanban,workspace,collaboration

## Regenerating these assets

If the app UI changes and you want fresh screenshots:

```bash
# 1. (Optional) Clean the demo workspace of test artifacts
cd /app/backend && python3 /app/scripts/clean_demo_for_screenshots.py
cd /app/backend && python3 /app/scripts/clean_demo_round2.py
cd /app/backend && python3 /app/scripts/seed_marketing_demo.py

# 2. Capture raw screenshots (run on Emergent container or any machine with Playwright)
cd /app && python3 scripts/capture_store_screenshots.py

# 3. Frame + caption + resize to all 4 store dimensions
cd /app && python3 scripts/frame_store_screenshots.py

# 4. Regenerate the Play Store feature graphic
cd /app && python3 scripts/make_feature_graphic.py
```

## Editing the captions

Captions live at the top of `/app/scripts/frame_store_screenshots.py` in the
`CAPTIONS` dict — change them and re-run step 3.

## Editing the marketing demo content

The seed thread + task list lives in
`/app/scripts/seed_marketing_demo.py`. Edit and re-run if you want different
chat content / task titles for the screenshots.
