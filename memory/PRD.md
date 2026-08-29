# TeamNest.ai — Product Requirements

## Original Problem Statement
AI-native team communication & research platform — chat, multi-AI research, project
folders, tasks, AI message polish, integrations, public snapshots, and (now)
invite-your-friends flows.

## Architecture
- **Backend**: FastAPI + MongoDB + WebSocket. JWT auth (bcrypt). emergentintegrations
  for OpenAI/Anthropic/Gemini; direct keys for DeepSeek/Perplexity/Grok.
- **Frontend**: React + Tailwind + Shadcn, dark "Swiss Brutalism" theme. Yellow `TN`
  brand mark.
- **Real-time**: WS at `/api/ws/{chat_id}?token=` with reconnecting client.

## Implemented Features
### Canvas Node Configs + Employee Weekly Digest + Meeting Prep Calendar — 2026-08-29
- **Canvas Node Configs (web)**: `AutomationNodeBuilder.jsx` rewritten so each node opens a config settings panel mirroring the backend plan schema. Trigger node: type (manual/scheduled/condition/event) + sub-config (schedule freq/time/weekday, condition, event). Step nodes: Get data (source) · Summarize (AI) · Draft email (AI) · Post to a chat (chat picker) · App action (update_crm/notify/create_task). Labels auto-suggest from config; reorder/add/delete; saves a working automation via the existing create API. Testids: `node-settings`, `trigger-type-select`, `trigger-sched-*`, `node-type-select-<i>`, `node-source/op/post-target/app-action`, etc.
- **Employee Activity Digest (backend + web + mobile)**: `GET /api/ai-employees/_/digests` → per subscribed employee (last 7 days): tasks, hours_saved, dollar_savings, highlights, and an AI one-line recap (`complete()`). Web `WeeklyDigests` section ("This week with your AI team", `digest-<key>`) on `AIEmployees.jsx`; mobile digest section in `AIEmployeesPanel`.
- **Meeting Prep Calendar (backend + web + mobile)**: chose in-app scheduling. New `routes/meetings.py` (`POST /meetings`, `GET /meetings`, `GET /meetings/upcoming?chat_id=`, `DELETE /meetings/{id}`; registered in `server.py`). `POST /ai/meeting-prep` upgraded to auto-attach the next upcoming meeting (accepts optional `meeting_id`) and brief that actual call — returns `{title, brief, meeting}`; falls back to chat recap when none. Web `MeetingPrepButton.jsx` + mobile `MeetingPrepButton.tsx` rewritten with an upcoming-meeting view + quick scheduling (web datetime form; mobile title + preset-time chips).
- **Demo seed**: `services/demo_reset.py` now reseeds a "Priya AI" (CMO) trial + 3 tasks (→ digest shows 3 tasks · 2.25h · $405) and an upcoming "Weekly Team Sync" meeting so fresh demo workspaces show these features populated; `meetings` added to the wipe list.
- Tested: iteration_154 — backend 11/11, web + mobile all pass. Known cosmetic (non-blocking): RN deprecation warnings in Expo web console (`shadow*`, `pointerEvents`, `Image.resizeMode`).

### Node Workflow Builder — web visual canvas alongside the NL builder — 2026-08-29
- Web-only (per user choice; mobile keeps the natural-language builder). New `frontend/src/components/AutomationNodeBuilder.jsx` integrated into `Automations.jsx` with a **List / Canvas** toggle (`builder-mode-nl` / `builder-mode-visual`) and a **"Build on canvas"** starter (`automation-blank-canvas`) that seeds a blank plan.
- Canvas renders the plan as a draggable WHEN → GET/THEN pipeline (`node-trigger`, `node-step-<i>`) on a grid canvas with SVG connectors. Per-node: editable label (`node-label-<i>`, `node-trigger-label`), GET↔THEN toggle (`node-kind-<i>`), reorder (`node-up/down-<i>`), delete (`node-remove-<i>`), editable automation name (`automation-name-input`), and `node-add-step`.
- Edits mutate the same `plan` object the NL builder produces, so Canvas↔List stay in sync and **Activate / Test** save via the existing `POST /api/automations` (no backend change). Verified round-trip + save-persists.
- Tested: iteration_153 (web node builder full flow PASS; also re-verified the mobile auth-race fix — `/api/ai-employees` + `/api/ai/activity` now 200 on first mount for owner + member, zero 401s).
- Note (non-blocking): RN deprecation warnings in Expo web console (`shadow*` → `boxShadow`, `props.pointerEvents` → `style.pointerEvents`) — cosmetic.

### Mobile AI Hub + Meeting Prep parity + Employees role-first intro (web + mobile) — 2026-08-29
- **Mobile AI Hub** (`mobile/app/ai/index.tsx`, route `/ai`): mirrors web's `/ai` with 4 sub-tabs — Research (Ask) / Employees (Do) / Automations (Watch) / Activity — plus the Ask·Do·Watch legend. Reached from Home (`home-action-aihub` + "+ New" menu) and You (`you-ai-hub`); the Research bottom tab stays for fast access (per user choice). Research + Automations screens gained an `embedded` prop (hide own header/top-inset) so the hub reuses them with no duplication.
- New mobile panels: `AIEmployeesPanel` (from `/ai-employees`, with the role-first intro) and `ActivityPanel` (from `/ai/activity`). Both gate fetches on the hydrated auth `token` (fixes the mount-time 401 race — verified member `raj` now sees the full gated roster).
- **Mobile Meeting Prep** (`MeetingPrepButton.tsx`, Modal): "Prepare me" icon in the chat header of non-AI chats → `POST /ai/meeting-prep` brief. Hidden on personal-AI chats.
- **Employees role-first intro** (web `AIEmployees.jsx` `RoleFirstIntro` + mobile `AIEmployeesPanel`): dismissible "Meet your AI team — who does what" card grouping employees by Marketing / Finance / Sales / Legal / Operations so new managers instantly see who does what. Persisted (localStorage `tn_ai_employees_intro_v1` / storage `ai_employees_intro_seen_v1`).
- No backend changes (reuses `/ai-employees`, `/ai/activity`, `/ai/meeting-prep`). Tested: iteration_152 (web + mobile pass; the one HIGH auth-race bug was fixed and re-verified on the exact repro).
- **Pending from this batch:** Node Workflow Builder (web-only visual canvas alongside the NL builder) — NOT yet built; next up.

### Phase 5 (Round 3) — "Do This For Me" contextual AI actions (web + mobile + backend) — 2026-08-29
One-tap, draft-only AI actions on a Task / Document / Chat, reusing the AI layer + approvals. Never writes or sends on its own.
- Backend (`routes/ai.py`): `GET /ai/do-actions?entity_type=` (catalogue) + `POST /ai/do-action` {entity_type, entity_id, action}. Actions — task: summarize/subtasks/update/draft_email; document: summarize/action_items/draft_email (pulls `knowledge_chunks` text); chat: summarize/reply/decisions/draft_email (builds a transcript from `messages`). Returns `{title, result, followups:[copy | automate(prompt) | draft_email(content)]}`. 400 on bad action/entity_type; 404 when entity not in caller's workspace / chat non-member. Read-only verified.
- Web reusable `components/DoThisForMe.jsx` (props entityType/entityId/compact/icon) wired into: Tasks cards (compact), Knowledge document detail (default), ChatHeader (icon, non-AI chats only). Follow-ups: copy, "Automate this" → `/automations?prompt=`, "Draft email" → subject+body inline.
- Mobile reusable `src/components/DoThisForMe.tsx` (React Native **Modal** bottom sheet, `expo-clipboard`) wired into Tasks rows (icon) + Documents detail (pill). Mobile automations screen now reads `?prompt=` (`useLocalSearchParams`) so "Automate this" prefills the builder.
- Tested: iter150 (backend 13/13 + web 100%) and iter151 (mobile retest 100% after fixing the sheet-overlay bug by moving to a Modal). Knowledge-document path structurally wired but not exercised (demo workspace has 0 knowledge sources) — non-blocking.

### Phase 4 + Round 2 — Apps Marketplace, live Zapier, Approval Inbox, Automation Insights (web + mobile + backend) — 2026-08-29
- **Apps Marketplace** (`routes/apps.py`, registered in `server.py`): rebranded Connectors → **Apps** with categories (Email/CRM/Chat/Files/Automation) + search, a Native vs Partner split, and plain-English Read/Act consent per app. `GET /apps` (catalogue, `?q=`/`?category=`), built from the existing `connectors_registry` + a new Zapier partner entry. Web `pages/AppsPage.jsx` (route `/apps`, sidebar `nav-apps`); mobile `app/apps/index.tsx` (entry from You-tab).
- **Live Zapier** (keyless, webhook-based; user chose Zapier): `POST /apps/zapier/connect` {catch_hook_url?} (owner/admin; https-only), `GET /apps/zapier`, `POST /apps/zapier/disconnect`, `POST /apps/zapier/test` (outbound), public inbound `POST /apps/webhooks/zapier/{token}?secret=` (signed → posts a "⚡ via Zapier" message; 401 bad secret, 404 unknown token). Stored in `app_connections` (workspace-scoped). Outbound `emit_zapier_event` fires on automation-run completion. Clients need only a free Zapier account — no API keys.
- **Approval Inbox**: web `pages/ApprovalInbox.jsx` (route `/approvals-inbox`) + sidebar `nav-approvals` with a live badge (polls `/automations/pending` every 60s + `tn:approvals-changed` event; owner/admin only). Mobile `app/approvals/index.tsx` (You-tab `you-approvals` link + badge). Approve/reject reuse the Phase 3 endpoints.
- **Automation Insights**: `GET /automations/insights` → per-automation + workspace `{runs, success, failed, pending, saved_hours, success_rate, series[7]}`. Web: per-row insight line + a 7-day sparkline in the automation detail modal. Mobile: per-row insight line.
- Tested: Phase 4 iter148 (backend 17/17, web + mobile parity); Round 2 iter149 (9/9 backend + web + mobile parity). No blockers.

### Phase 3 — Automation Engine: real triggers + approvals + suggestions (web + mobile + backend) — 2026-08-29
User approved: use the existing 60s in-process tick loop (NO cron/celery); activate scheduled + internal condition + external event triggers; ONLY high-risk requires approval (low/medium auto-run); include Suggested Automations + rate limits.
- **Trigger engine** (`backend/routes/automations.py` `run_due_automations()`, called by a new 60s loop in `server.py` startup): **scheduled** (fires when `next_run_at` ≤ now, then recomputes via `compute_next_run`), **condition** (`overdue_tasks`/`stalled_projects` with a 12h cooldown via `last_condition_fire_at`), **event** (`crm_lead_created`→polls `external_contacts`, `task_created`→polls `tasks`, since `last_event_check_at`). Autonomous runs act as the automation's owner and are never self-approved. Verified: a due scheduled automation fired autonomously (status `success`, `trigger_source=scheduled`) and advanced `next_run_at`.
- **Approval gating** (per-workspace `automation_policies`, default `{low:false, medium:false, high:true}`): `_maybe_execute` records a `pending_approval` run + DMs owners/admins instead of executing when approval is required and the caller can't self-approve. Manual `/run`: owner/admin execute directly; members hit the gate. Endpoints: `GET /automations/pending`, `POST /automations/runs/{run_id}/approve` (executes in place, sets `approved_by`), `POST /automations/runs/{run_id}/reject` (→ `rejected`) — both owner/admin only (member 403). Policy: `GET`/`PUT /automations/policy` (PUT owner/admin only).
- **Suggested Automations** (`GET /automations/suggestions`): derives up to 3 cards from real signals (overdue tasks → daily digest, ≥3 research threads → weekly digest, tasks open >7d → stalled alert), skipping ones already covered by existing automations.
- **Rate limit**: `AUTOMATION_MAX_RUNS_PER_HOUR` (env, default 30) → `/run` returns 429 past the cap; tick loop silently skips rate-limited automations.
- New run statuses: `success|partial|simulated|failed|pending_approval|rejected`. New automation fields: `next_run_at`, `last_condition_fire_at`, `last_event_check_at`; new run fields: `trigger_source`, `approved_by`. `stats.needs_approval` now counts `pending_approval` runs.
- **Web** (`Automations.jsx`): "Suggested for you" (`automations-suggestions`, `suggestion-<key>` → prefills builder), "Waiting for approval" (`automations-pending`, `pending-approve/reject-<id>`, owner/admin only), next-run label on scheduled rows.
- **Mobile** (`app/automations/index.tsx`): `mobile-suggestions` chips, `mobile-pending` with approve/reject (owner/admin) or "Needs admin" chip (member), next-run on rows; fetches gated on hydrated auth token.
- **Tested**: testing_agent iteration 147 — backend 16/16, web + mobile pass, no blockers (report `/app/test_reports/iteration_147.json`, tests `tests/test_iteration147_automation_triggers.py`).

### Phase 2 — Drop 2: Automation Builder + enhancements (web + mobile + backend) — 2026-08-29
- **Automation Builder** (`backend/routes/automations.py`, `frontend/src/pages/Automations.jsx`, `mobile/app/automations/index.tsx`): describe in plain English → LLM parses into **WHEN / GET / THEN** + risk → save → **manual Run/Test**. The safe recipe (`overdue_tasks` | `recent_research` → AI summarize → **post to a chat**) executes for REAL (verified: posts an actual message to the target chat); other action kinds are logged as **"simulated"** in the run timeline. Includes a 9-item templates gallery, dashboard stats (running/needs_approval/failed/saved_hours/credits_used), run history + user-facing reasoning summary, pause/activate, risk tags. Endpoints (router has NO prefix; parent adds `/api`): `/automations/templates`, `/automations/parse`, CRUD `/automations[/{id}]`, `/automations/{id}/run`, `/automations/{id}/runs`, `/automations/stats`. **Real scheduled/event triggers are DEFERRED** (next).
- **Ask Composer** (`Research.jsx`): `research-ask-input` + `research-ask-btn` on the AI Research tab (`/ai` + `/research`) → starts research via the personal-AI chat (`/my-ai?ask=`).
- **Action Bar Everywhere** (`ModelCard.jsx` + `AIComparison.jsx` passes `threadId`): single-model answer cards now show Save to Knowledge / Draft Email / Automate; plus the Drop-1 synthesis bar (full-screen + inline) reused.
- **Meeting Prep** (`backend/routes/ai.py POST /api/ai/meeting-prep`, `frontend/src/components/MeetingPrepButton.jsx` on `Calls.jsx` recent rows): "Prepare me" briefs from the meeting's chat history + workspace documents (read-only). Button uses preventDefault/stopPropagation so it doesn't trigger row nav.
- Mobile entry points wired: Home "Automate Something", "+ New → Automation", and Research "Automate This" all open `/automations` (mobile screen gates fetches on the rehydrated auth token to avoid a cold-load race).
- **Tested**: testing_agent iteration 146 — backend 9/9 (incl. real chat-post + meeting-prep), web + mobile all target flows pass (report `/app/test_reports/iteration_146.json`). Tester added one missing `data-testid="automations-stats"`.
- **Known follow-ups (non-blocking)**: mobile Meeting Prep not yet added; no per-user rate limit on `/automations/{id}/run`; real scheduled/event execution still pending.

### Phase 2 — Drop 1: Mobile Home landing + AI hub + Response Action Bar (web + mobile + backend) — 2026-08-29
User approved a/a/a/a; shipped in two drops. This is Drop 1.
- **Mobile Home landing**: app now opens directly on the Home hub (redirects → `/(tabs)/home` in `app/index.tsx`, `(auth)/login.tsx`, `(auth)/_layout.tsx`), not the chat list.
- **AI hub** (`pages/AIHub.jsx`, route `/ai`): tabs **Research · Employees · Automations · Activity** framed as **Ask / Do / Watch**. Nav "AI" (testid `nav-research`) repointed to `/ai`; `/research`, `/employees`, `/automations` still work directly. Each tab reuses the existing page (no duplication); Activity = new `components/AIActivity.jsx` fed by `GET /api/ai/activity`.
- **Response Action Bar** ("Do something with this") after AI answers — added the missing actions to BOTH the full-screen (`SynthesisFooter.jsx`) and inline in-chat (`AIComparisonInline.jsx`) synthesis footers, and to mobile Research (`app/(tabs)/research.tsx`): **Save to Knowledge** (reuses `POST /api/ai/threads/{id}/save-knowledge`), **Draft Email** (new `POST /api/ai/draft-email`, draft-only via `DraftEmailDialog.jsx` / mobile draft sheet — does NOT send), **Ask Another AI** (→ `/ai?tab=research`), **Automate This** (→ `/automations?prompt=…`). Existing actions (copy/share/task/save/approval/PDF) preserved.
- **Backend** (`routes/ai.py`, additive): `POST /api/ai/draft-email` (LLM via `ai_service.complete`, Emergent key) and `GET /api/ai/activity`.
- **Tested**: testing_agent iteration 145 — backend 5/5; web + mobile all target flows pass (report `/app/test_reports/iteration_145.json`). Inline-footer parity added after the report (same handlers/endpoints as the passing full-screen bar).
- **Known follow-ups (non-blocking)**: `/ai` Research tab has no inline composer (ask via TopActionBar / +New); single-model answer cards don't yet show the new action bar; `sendForApproval` uses a hard reload; `GET /api/ai/activity` isn't per-approval permission-filtered.

### Phase 1 — UX Simplification: Navigation + Home IA (web + mobile + backend) — 2026-08-29
Part of the multi-phase "Simplicity + AI Actions + Automation + Integration UX" upgrade. User chose web + mobile together; full automation engine deferred to Phase 3 (start with center/builder/manual then real triggers); LLM reuse via Emergent key = yes; one real partner integration to be wired in Phase 4.
- **Backend** (`routes/dashboard.py`, additive): `GET /api/home/overview` → `{remembers:{my_memory,team_knowledge,research,decisions,documents}, continue:{meetings[],documents[]}}` (sources: learned_memories personal, memory_items workspace + decision, ai_threads, knowledge_sources, calls). `GET /api/home/summary` extended with `my_memory` + `team_knowledge` (regression-safe).
- **Web**: Enhanced `StartCenterHome.jsx` (NOT duplicated) — now the DEFAULT Home look (`homeVariant.getHomeVariant` → "start"). Header "What do you want to do?", added "Automate Something" card, added "What TeamNest Remembers" section (5 count cards + deep-link buttons), extended Continue Working with tasks/meetings/documents. Global "+ New" menu = `components/NewMenu.jsx` + `lib/nav.js` (`createOptions`); persona-aware primary nav = `lib/nav.js` `primaryNav(user)` (reorders the same 7 items, preserves all testids). `/automations` placeholder page (`pages/Automations.jsx`, route in `App.js`).
- **Mobile**: New Home tab (first tab) `app/(tabs)/home.tsx` — quick actions, "What TeamNest Remembers" row, Continue Working (chats/tasks/meetings/documents), global "+ New" bottom sheet `src/components/NewMenuSheet.tsx` (research/chat/task/document/automation/AI employee). Tab bar now Home | Chats | Research | Tasks | You.
- **Tested**: testing_agent iteration 144 — backend 4/4 pass; web + mobile target flows pass; mobile parity gaps (meetings/docs columns, AI Employee option) then closed. Report: `/app/test_reports/iteration_144.json`.
- **Known follow-ups**: mobile still opens on Chats (index) not Home (landing change deferred); mobile "+ New" omits meeting/project (no create flow on mobile yet); Automation is a placeholder (Phase 3).

### ROADMAP (remaining phases, user-approved)
- **Phase 2** — AI as Ask / Do / Watch: AI landing tabs (Research/Employees/Automations/Activity), AI Response Action Bar ("Do something with this"), contextual "Do This for Me" (reuse credit governance + approvals).
- **Phase 3** — Automation engine: model + executor (reuse 1h tick-loop), NL→workflow builder (LLM), templates gallery, suggested automations, execution timeline, risk/approval policies, provider abstraction. Start with center + NL builder + manual Run/Test, then real scheduled/event triggers.
- **Phase 4** — Apps marketplace: rebrand Connectors → "Apps", categories + search, Read vs Act permissions, plain-English consent UX, native/partner architecture + wire one real partner (TBD with user).

### Iteration 159 (CI/CD) — Monorepo GitHub Actions + foundational test infra
- Added three path-filtered GitHub Actions workflows under `.github/workflows/` so a change to one surface only runs that surface's pipeline:
  - `backend-ci.yml` (push paths `backend/**`; PRs run always): installs a slim public-only pinned subset (`backend/requirements-ci.txt` — the full `requirements.txt` needs the private `emergentintegrations` package which isn't resolvable on GitHub runners), runs `flake8` syntax/undefined-name check (`--select=E9,F63,F7,F82`, scans without importing), and the pure unit tests (`tests/test_unit_resolve_app_base.py`, 6 tests — `deps` import chain needs no private pkg; verified in a clean venv with `env -i`). Full integration suite intentionally NOT in this pass.
  - `frontend-ci.yml` (push paths `frontend/**`; PRs run always): Node 22 (testing libs need ≥22), `yarn install` + `CI=true yarn test`.
  - `mobile-ci.yml` (push paths `mobile/**`; PRs run always): Node 22, `yarn install` + `yarn test --ci`.
  - All trigger on PR + push to `main`; secrets referenced via GitHub Secrets only (no real URLs/keys committed).
- Backend test infra: new pure unit test `tests/test_unit_resolve_app_base.py` (6 tests) covering the emailed-link origin allow-list (`resolve_app_base` / `_link_host_allowed`) — no network/DB. Passes locally.
- Frontend test infra (was none): added `@testing-library/react@16`, `@testing-library/jest-dom@7`, `@testing-library/dom@10`, `@testing-library/user-event@14` (devDeps); `src/setupTests.js` (jest-dom); jest `moduleNameMapper` for the `@/` alias added to `craco.config.js`. Tests: `src/lib/persona.test.js` + `src/components/ui/button.test.jsx` (RTL) — 4 pass.
- Mobile test infra (was none): added `jest-expo@~54`, `jest@30`, `@testing-library/react-native@14` (devDeps; no react-test-renderer per React 19); `"jest": {"preset":"jest-expo"}` + `"test":"jest"` in `package.json`. Test: `src/components/groupAvatarPresets.test.ts` — 5 pass.
- Fixed a pre-existing blocking lint error: service workers used a bare `importScripts` → switched to `self.importScripts` in `frontend/public/service-worker.js` + `OneSignalSDKWorker.js`.
- NOT run through the testing_agent (this is CI/test tooling; verified by running each suite locally: backend 6/6 + collect 1270/0-errors + flake8 clean, frontend 4/4, mobile 5/5).

### Iteration 158 (repo hygiene + docs) — Full credential scrub + README
- Moved ALL remaining credentials out of tracked code into gitignored `backend/.env`: `Demo@2026`→`DEMO_PASSWORD`, `secret123`→`TEST_PASSWORD`, `Summer$123`→`RADCITI_TEST_PASSWORD` (plus `SUPERADMIN_TEST_PASSWORD`, `RC_WEBHOOK_AUTH` from iter 157). 70 files parameterized to `os.environ.get(..., "<generic placeholder>")`; `seed.py` default changed to a generic placeholder; docs use placeholders. `conftest.py` loads `backend/.env`. Verified: 1264 tests collect (0 errors), py_compile OK, all env vars resolve.
- Final 3-way scan across 9492 tracked files: [1] real passwords NONE, [2] real API secrets NONE, [3] live-format patterns NONE. (Benign: `sk_test_emergent` sentinel, `nest-app-prep` subdomain.)
- Created `README.md`: local run steps (backend uvicorn :8001, web `yarn start` :3000, mobile `yarn expo start`, Mongo, seed), required env vars per surface, test instructions, project structure, and a GitHub Flow branch strategy + CI secrets guidance.
- Fixed a pre-existing lint error in `frontend/public/OneSignalSDKWorker.js` (`/* global importScripts */`).


### Iteration 157 (repo hygiene) — Secret-proofing before GitHub push
- `.gitignore`: added rules so real `.env` files (backend/frontend/mobile) are never committed; keep `*.env.example` templates. Added `test_reports/` (untracked 231 internal QA artifacts via `git rm --cached`; they held the prod super-admin password + an RC webhook token).
- Created `.env.example` templates (backend/frontend/mobile) documenting every key with placeholder values (no real secrets).
- Removed the hardcoded **prod super-admin password** from 21 tracked test files + a RevenueCat webhook token from 1 test — parameterized to `os.environ.get("SUPERADMIN_TEST_PASSWORD")` / `RC_WEBHOOK_AUTH`; added `SUPERADMIN_TEST_PASSWORD` to the gitignored `backend/.env`; `conftest.py` now `load_dotenv(backend/.env)` so tests still pass. Verified 1264 tests collect with 0 errors.
- Final scan: no hard secret (API keys/tokens/prod password) in any git-tracked file. Remaining scan matches are false positives: `STRIPE_API_KEY=sk_test_emergent` (Emergent mode sentinel) and `DEEPGRAM_API_KEY=nest-app-prep` (preview subdomain). NOTE: demo/seed passwords (`DemoPass123!` in 61 files incl. seed.py, `TestPass123!` in 6) remain as non-production fixtures — flagged to user.


### Iteration 156 (web) — Onboarding layout pick + land-on-choice
- **Land On Choice** (`homeVariant.js`): `homeLanding()` now always returns `/dashboard`, so users land on their chosen Home layout after login (previously Chat-View/classic users were sent to `/chats`).
- **Live switching**: `setHomeVariant()` dispatches a `tn:home-variant` CustomEvent; `Home.jsx` listens and re-renders the chosen look immediately (so the switcher AND the welcome picker update the Home live).
- **Onboarding Pick** (`WelcomeTour.jsx`): added a "Choose your Home layout" slide (2nd in the welcome variant) with three options — Chat View / ChatGPT Layout / Claude Layout (`welcome-layout-picker`, `welcome-layout-{classic|ask|focus}`). Selecting one calls `setHomeVariant` and updates the Home behind the card live. Verified via screenshots (picker shown, live switch to ChatGPT layout, login lands on /dashboard).


### Iteration 155 (web) — Clearer Home layout switcher labels
- `HomeLookSwitcher.jsx` button relabeled "Home: {look}" → **"Change layout"**. `homeVariant.js` HOME_LOOKS labels: Classic→**Chat View**, Ask AI→**ChatGPT Layout**, Focus→**Claude Layout** (Start Center kept). Internal values/storage keys unchanged (non-breaking). Verified via screenshot on /dashboard.


### Iteration 154 (web) — Super Admin "Link Domain Guard"
- `pages/superadmin/UsersTab.jsx`: added `linkDomainIssue()` + `<LinkDomainWarning>` — after generating a reset link, if the link's origin ≠ the admin's current origin (a `PUBLIC_BACKEND_URL` mismatch), an amber warning shows the wrong vs expected domain and offers a one-click **corrected link** (domain swapped to the current origin). Test ids `sa-link-domain-warning`, `sa-copy-corrected-link`. Verified on preview: modal intact, no warning when domains match (correct); warning path triggers on mismatch (the production bug scenario).


### Iteration 153 (backend) — Prod password-reset/welcome links use request origin (login incident)
- **Incident:** a provisioned prod user couldn't sign in; generic "could not sign in". Root cause: production env var `PUBLIC_BACKEND_URL` = `https://emergent-ai-teams.emergent.host` (not `https://teamnest.ai`), so Super Admin reset links / welcome emails pointed users to the internal Emergent host where sign-in fails. teamnest.ai login itself works correctly (verified: wrong pw → clean 401 "Invalid credentials").
- **Fix (superadmin.py):** `generate_reset_link`, `reset_user_password` (temp-pw email) and `create_user` (`_send_credentials_email`) now build link base via `resolve_app_base(request)` (trusts allow-listed request Origin/Referer; falls back to `PUBLIC_BACKEND_URL`). Threaded `request: Request` into those endpoints. Mirrors the existing `forgot_password` pattern. Verified on preview: with a teamnest.ai Referer the reset link → `https://teamnest.ai/...`; without → env fallback. Proxy strips `Origin` but passes `Referer`, so real browsers on teamnest.ai resolve correctly.
- **Still recommended:** set `PUBLIC_BACKEND_URL=https://teamnest.ai` in the PRODUCTION deployment env — fixes background reminder emails + OAuth connector redirects too (those have no request context).


### Iteration 152 (web) — Hero polish + enterprise proof + demo band
- **Two-line accent headline** (`Hero.jsx`): `HERO_COPY` now has `headline` + `headlineAccent`; the accent line renders as a `block` in brand yellow (`--w-brand`). Default: "…think together —" / "so your intelligence never leaves." Alt (sharper enterprise angle for A/B): "Every conversation, decision, and insight —" / "kept, even after people leave." (governance/SSO/institutional-memory framing).
- **Enterprise proof strip** (`components/web/home/HeroProof.jsx`, mounted right under `<Hero/>` in HomeV2): honest capability stats — 5+ AI models · 100% retained · Zero knowledge lost · SSO + Audit. `data-testid="home-hero-proof"`.
- **Enterprise demo band** (`components/web/home/EnterpriseCTABand.jsx`, mounted between Capabilities and Plans): prominent "Request a Demo" primary CTA + "Explore TeamNest for Business", with governance/permissions/onboarding points. `data-testid="home-enterprise-cta"`, `enterprise-demo-cta`, `enterprise-explore-cta`.
- Verified via screenshots (default + `?hero=alt`). Copy/layout only, no backend. Redeploy (Publish) for production.

### Iteration 151 (web) — Unified marketing hero messaging
- Blended the enterprise hook into the homepage hero (`components/web/home/Hero.jsx`, default + alt variants). Headline: "Where people and AI think together — so your intelligence never leaves." Sub now leads with "Your organization's knowledge shouldn't disappear when people move on." + the connected-workspace + audience-breadth copy.
- `AudienceSections.jsx` BusinessSection headline changed to "Built for organizations that can't afford to lose what they know." to avoid duplicating the hero verbatim.
- Verified via screenshot on `/` (HomeV2). Copy-only change; redeploy (Publish) required to reach production teamnest.ai.


### Iteration 150 (web) — Universal Search / Command Palette (⌘K) + example prompts in empty states
- **Command Palette** (`components/CommandPalette.jsx`, mounted once in `AppShell.jsx`): global `⌘K` / `Ctrl+K` hotkey (toggle) + `window` event `tn:command-palette` (via `openCommandPalette()`); also opened from a new Sidebar **Search** button (`nav-command-palette`, shows a `⌘K` kbd hint). Portal overlay + backdrop, cmdk-powered fuzzy filter, ↑↓/Enter/Esc + backdrop-click close, query resets on close. Groups: **Quick actions** (new chat/group/project, host meeting, ask my AI, compare models, invite, upload docs, daily standup), **Message a person** (workspace members → opens existing direct chat or creates one), **Chats**, **Research threads** (→ `/chats/{chat_id}?thread={id}`), **Projects** (→ `/projects/{id}`), and **Go to** (all app routes, with enterprise/workspace-ai gated to owner/admin/super and superadmin gated). Data lazy-loaded once per session from `/chats`, `/ai/threads`, `/folders`, `/workspace/members`. Test ids: `command-palette`, `command-palette-input`, `command-act-*`, `command-nav-*`, `command-chat-<id>`, `command-thread-<id>`, `command-project-<id>`, `command-person-<id>`.
- **Empty-state example prompts** (P1): `Research.jsx` empty state now shows 4 clickable research example chips (`research-example-*`) that route to `/my-ai?ask=<prompt>` (prefills `@ai <prompt>` in the personal AI composer). `Projects.jsx` (ProjectsList) empty state shows 4 project example chips (`project-example-*`) that open the New folder dialog PREFILLED with name+description.
- Note: an early version used cmdk member-expression JSX (`<Command.Input>` …) which crashed the babel visual-edits plugin ("Maximum call stack size exceeded"); rewritten to use the wrapped `@/components/ui/command` components — compiles clean.
- Verified by testing_agent (iteration 143 — ALL PASS, no blockers): palette hotkey/button/filter/all quick actions + 14 nav items + chats/threads/projects/people navigation; Projects empty-state chips prefilled the dialog end-to-end; Research chips verified by route + code. Web-only — redeploy for teamnest.ai.


### Iteration 149 (web) — Persona nudge + Guided spotlight + Completion celebration
- **Onboarding Persona Prompt** (`components/PersonaNudge.jsx`): shown at the top of every Home look ONLY when `user.persona` is null. Picking a chip (personal/student/team/business/enterprise) PATCHes `/api/user/onboarding {persona, completed:true}`, refreshes the user, instantly tailors the Home top actions, and hides the nudge. Dismissible (`tn:persona-nudge:dismissed`). Test ids: `persona-nudge`, `persona-pick-<id>`, `persona-nudge-dismiss`.
- **Guided Highlights** (upgraded `components/ShowMeHow.jsx` + `target` per walkthrough in `lib/walkthroughs.js`): when a step targets an on-screen element, ShowMeHow renders a spotlight overlay (`show-me-how-spotlight`) that dims the page (box-shadow trick), draws a yellow ring around the real element, and positions a coachmark beside it. Targets the sidebar nav (research→`nav-research`, meetings→`nav-calls`, memory→`nav-ai-memory`, employees→`nav-employees`); recomputes on scroll/resize; scrolls target into view. Gracefully falls back to the centered modal guide when the target isn't in the DOM (e.g. narrow viewport). Shared `GuideBody` used by both modes.
- **Celebrate Completion** (`components/SetupChecklist.jsx` + `canvas-confetti`): when the checklist hits 7/7 for someone actually seeing it (new account OR force-opened), it shows a celebration card (`checklist-celebration`, "You're a TeamNest pro! 🎉") and fires a confetti burst — ONCE ever (`tn:checklist:celebrated`). `checklist-celebrate-done` dismisses. Non-new already-complete users aren't auto-celebrated unless they re-open the checklist.
- Added `canvas-confetti` dependency (frontend). Added sr-only `DialogTitle`/`DialogDescription` to the Show Me How dialog for a11y.
- Verified by testing_agent (iteration 142 — ALL 3 PASS + clean regressions). Web-only — redeploy for teamnest.ai.

### Iteration 148 (web) — Role-Based Home + Show Me How + Setup Checklist
- **Role-Based Home** (`lib/persona.js`): the Home looks now tailor their top actions to the persona captured at onboarding (`user.persona`: personal/student/team/business/enterprise). Start Center reorders its action cards (`cardOrder`), and Ask/Focus pass persona-specific composer chips + a `featureOrder` to `FeatureShortcuts` (which gained `role`→/enterprise and `people`→/team entries for enterprise). Unknown/other → generic defaults. No backend change (persona already on the user). Verified: business persona produced the exact configured card/feature order.
- **Show Me How** (`components/ShowMeHow.jsx` mounted in AppShell + `lib/walkthroughs.js` + `lib/showMeHow.js`): a replayable walkthrough system launched from the sidebar (`nav-show-me-how`). Menu lists 4 guides — AI Research, Meetings, Memory, AI Employees — each a 4-step stepper (progress dots, Back/Next) ending in a "Take me there" deep link (`/research`, `/calls`, `/ai-memory`, `/employees`). Opened globally via window events (`tn:show-me-how`, `tn:walkthrough`).
- **Setup Checklist** (`components/SetupChecklist.jsx` + `GET /api/home/checklist`): a "Get more from TeamNest" card shown at the top of every Home look for new accounts (<14d). Backend auto-derives 7 booleans from real activity (first_chat, started_research, compared_models, hosted_meeting, uploaded_document, created_task, saved_memory). Done items strike through; incomplete items show **Go** (deep link) + **Show me** (opens the matching walkthrough). Progress bar, collapse (`checklist-toggle`), dismiss (`checklist-dismiss`), and re-open from Show Me How ("Open my setup checklist" → persisted `tn:checklist:force` flag → navigates to /dashboard and force-shows).
- Test ids: `nav-show-me-how`, `show-me-how-menu`, `smh-guide-{research|meetings|memory|employees}`, `smh-next/prev/goto`, `smh-open-checklist`, `setup-checklist`, `checklist-{toggle|dismiss}`, `checklist-item/go/show-<key>`, `feature-{...|role|people}`.
- Verified by testing_agent (iteration 141 — ALL PASS: 11/11 backend + all frontend flows incl. persona ordering). Added an sr-only `DialogTitle` to Show Me How for a11y. Web-only — redeploy for teamnest.ai.

### Iteration 147 (web) — Multiple Home "looks" (ChatGPT-/Claude-style) + Intelligence banner
- The Home (`/dashboard`) now offers **four switchable looks** via a `HomeLookSwitcher` (`home-look-btn` → `home-look-{classic|start|ask|focus}`), persisted in `localStorage["tn:home:variant"]` (migrates the old `"new"` → `"start"`); brand-new accounts (created <7d) default to `start`, existing users to `classic`.
  - **Classic** — the original dashboard (stats, standup, page-aware TopActionBar).
  - **Start Center** (`home-start-center`) — big action cards for every feature.
  - **Ask AI** (`home-ask`) — ChatGPT-style: centered "What can I help with, <name>?" + prompt composer + example chips + feature shortcuts.
  - **Focus** (`home-focus`) — Claude-style: time-of-day greeting + composer + "Jump back in" recents + feature shortcuts.
- **Prompt-first composer** (`components/HomeComposer.jsx`): typing a prompt + Ask routes to `/my-ai?ask=...` which drops the user into their personal AI chat with the composer prefilled `@ai <prompt>` (or `@ai ask all <prompt>` when the **Compare models** toggle is on) — reuses the existing `?compose=` chat mechanism. `MyAI.jsx` now reads `?ask`/`?mode` and has an error fallback.
- **IntelligenceBanner** (`components/IntelligenceBanner.jsx`) pinned to the TOP of ALL four looks: headline "Your organization's intelligence shouldn't disappear when people move on." + live counts from `GET /api/home/summary` + CTAs Ask My Memory (`/ai-memory`), Team Knowledge (`/knowledge`), and Role Intelligence (`/enterprise`, owner/admin/super_admin only). Start Center's old bottom "remembers" block was removed (moved up into this banner).
- Shared `components/FeatureShortcuts.jsx` (Chat/Meeting/Tasks/Documents/AI Employees/Team Knowledge/Memory/Invite) keeps every capability one tap away on the AI-first looks.
- Post-login landing (`lib/homeVariant.js` `homeLanding`): any non-classic look → `/dashboard`; classic → `/chats` (used in `Auth.jsx` login/demo/MFA).
- Verified by testing_agent (iteration 140 — ALL PASS): all 4 looks + banner + switcher persistence + composer single/compare prefill + per-variant landing + regressions (/my-ai no-param, classic dashboard). Web-only — redeploy for teamnest.ai.

### Iteration 146 (web) — "What do you want to do next?" Top Action Bar (page-aware, personalized, dismissible)
- New reusable `components/TopActionBar.jsx`: a prominent, collapsible quick-action card driven by a central action **registry** + a per-page `items` prop. Actions: New Chat, New Group, Compare AI Models, Invite Teammates, Upload Documents, **Daily Standup** (→ `/dashboard?standup=1`, auto-runs the AI digest), **Hire an AI Employee** (→ `/employees`), **Ask My AI** (→ `/my-ai`), plus a custom **New Task** on Tasks (opens the task dialog).
- **Page-aware curated sets** (first item = the highlighted page lead; the rest reorder by personal usage):
  - Chats: New Chat · New Group · Ask My AI · Invite · Upload
  - Home/Dashboard: Daily Standup · Hire an AI Employee · New Chat · Ask My AI · Invite
  - Tasks: New Task · Daily Standup · New Chat · Ask My AI · Invite
  - AI Research: Ask My AI · Compare AI Models · Upload · New Chat · Hire an AI Employee
- **Personalized ordering**: each click increments a per-action counter in `localStorage["tn:quickbar:usage"]`; non-lead tiles sort by usage desc (stable tiebreak). Order frozen at mount (no reshuffle under the cursor).
- **Dismiss For Good**: a "×" (`quickbar-dismiss`) hides the bar app-wide (`localStorage["tn:quickbar:hidden"]`, exported as `QUICKBAR_HIDDEN_KEY`); re-enabled from **Profile → Preferences** ("Show quick actions", `show-quickbar-btn`). Also collapsible via `quickbar-toggle` (`tn:quickbar:collapsed`).
- New Chat/New Group wire through the `?new=chat|group` param that `Chats.jsx` reacts to; Daily Standup wires through `?standup=1` that `Dashboard.jsx` reacts to (auto-generates then strips the param).
- Test ids: `top-action-bar`, `quickbar-toggle`, `quickbar-dismiss`, `quickbar-{new-chat|new-group|new-task|compare|invite|upload|standup|hire-ai|my-ai}`, `show-quickbar-btn`.
- Self-verified via screenshots: correct set per page + lead highlight, New Chat→sheet, New Group→dialog, New Task→dialog, Daily Standup→digest generated on Home, dismiss hides everywhere + Profile re-enable restores, collapse/expand + reorder persist. Web-only — redeploy for teamnest.ai. (testing_agent NOT run — contained additive UI.)

### Iteration 145 (web) — "Show welcome again" replay
- Profile (`/profile`) gained a **Preferences** section with a "Show welcome again" button (`replay-welcome-btn`) that clears `tn:welcomed:<uid>` and dispatches a `tn:replay-welcome` window event. `WelcomeTour` listens for that event and re-opens the short welcome variant on demand. Verified via screenshot (tour reappears + toast). Web-only.

### Iteration 144 (web + backend) — First-time welcome + login rate-limit
- **Login rate-limit** (`services/login_throttle.py`, MongoDB-backed, no Redis): per `(client-ip + email)`, `LOGIN_MAX_FAILS=7` fails / `LOGIN_WINDOW_MIN=15` min → `LOGIN_LOCK_MIN=15` min lock; `/auth/login` (now takes `request`) returns **429** with a friendly "Too many sign-in attempts. Please try again in about N minutes." + `Retry-After` header. Success clears the counter; wrong password → 401 (unchanged) until lock. TTL-cleaned `login_attempts` collection. Verified via curl: 6×401 → 7th=429 (`Retry-After: 899`); valid login unaffected. Frontend already renders `err.response.data.detail`, so the message shows automatically. (integration_expert consulted per auth rule.)
- **First-time welcome** (`components/WelcomeTour.jsx`): added a short 3-slide "welcome" variant (Chat with your team → Compare AIs side-by-side → Invite your teammates, jump to `/chats?new=group`) shown once per real user via `localStorage["tn:welcomed:<uid>"]`. The existing demo-login sales tour (`demoSlides`, sessionStorage flag) is unchanged; `variant` selects between them.
- Verified via screenshot (welcome card slides 1→"Invite your teammates" + jump button; login regression ok). Web + backend — redeploy for teamnest.ai.

### Iteration 143 (web) — Self-recovery on sign-in + reset pages
- The `/login` page already had a visible "Forgot password?" link (`auth-forgot-link`) → working reset-request `ForgotForm`. Added deep-linking: `/login?forgot=1` opens that form directly.
- ResetPassword self-recovery for stuck invitees (expired / wrong-domain links): invalid/no-token branch now says "missing, malformed, or expired" with a "Request a new link" button → `/login?forgot=1` (`reset-request-new`); the set-password form gained an inline "Link expired? Request a new one" link (`reset-request-new-inline`).
- Verified via screenshots: forgot deep-link renders the email form; reset page shows the inline recover link with a token, and the invalid-link page shows "Request a new link" → `/login?forgot=1`. Web-only — redeploy for teamnest.ai.

### Iteration 142 (backend) — FIX: invite/reset links pointed to wrong domain (prod) → couldn't reset password / sign in
- **Root cause (production):** invite & password-reset emails built links from `PUBLIC_BACKEND_URL`, which in the deployed env was `https://emergent-ai-teams.emergent.host` (raw deploy host) instead of `https://teamnest.ai`. Invitees landed on the wrong domain → "invalid/expired reset link" + "could not sign in". Confirmed via the actual email link the user pasted. Auth code itself was correct (reset→login verified 200/200 in preview).
- **Fix (code hardening, `deps.resolve_app_base`)**: link domain now derives from the request's Origin/Referer, **allow-listed** to `teamnest.ai / emergent.host / emergentagent.com / localhost` (forged/untrusted origins fall back to `PUBLIC_BACKEND_URL`, so no phishing-domain injection). Wired into `/workspace/invite`, `/workspace/invite/{id}/resend` (both now take `request`), the "added" login link, and `/auth/forgot-password`. `mint_invite_link(user_id, base=None)` accepts the resolved base; the reminder loop still uses the env fallback.
- Verified: unit test of `resolve_app_base` (teamnest→teamnest, emergent.host→ok, preview→preview, evil→fallback, referer fallback, no-request→env) + live invite/forgot 200 with `Origin: teamnest.ai`. Lint clean, backend restarted.
- **Requires redeploy** to fix production. Belt-and-suspenders: also set prod `PUBLIC_BACKEND_URL=https://teamnest.ai` (covers background reminder emails). After redeploy, admins should **Resend** invites to pratik.d@thakkardevelopers.com and pooja@moderncb.com to issue fresh teamnest.ai links.

### Iteration 141 (web) — Resend-from-badge + Pending filter
- **Resend from badge**: the "invited" badge is now a clickable button for owners/admins that calls `POST /workspace/invite/{user_id}/resend` (existing endpoint; re-issues the set-password link + emails it) and toasts "Invite re-sent to …". Applied in NewChatDialog member rows, GroupInfo `MemberRow`, and AddMemberDialog workspace quick-add rows (RefreshCw icon + spin while sending; non-admins keep a static badge). Per-list `resendingId` guards the in-flight row.
- **Pending filter**: a "Pending" toggle shows only `status === "invited"` members. In NewChatDialog (`members-pending-filter`, disables frequent grouping while active) and GroupInfo members tab (`group-info-pending-filter`, shows the pending count). Only rendered when a workspace has ≥1 pending member.
- Verified: curl (resend → 200 ok, email returned) + screenshot (pending filter reduced 5→3 rows all invited; clicking a badge showed the re-sent toast). Web-only — redeploy for teamnest.ai.

### Iteration 140 (web) — "Invited" pending badge on member lists
- Added a small amber "invited" pill next to any member whose `status === "invited"` (created via invite, not yet accepted; flips to `active` on redeem/first login). `public_user` and the chat-members projection already expose `status`, so no backend change.
- Shown in three places: NewChatDialog member rows (`member-invited-{id}`), GroupInfo `MemberRow` meta (`member-invited-{id}`), and AddMemberDialog workspace quick-add rows (`ws-member-invited-{id}`).
- Verified: 3 invited badges render in the picker for the QA test invitees; active users show none. Web-only — redeploy for teamnest.ai.

### Iteration 139 (web) — Group form: bulk invite, role picker, recent-contacts ordering
- **Bulk Invite** (`NewChatDialog.jsx`): the invite field is now a Textarea; paste multiple emails (comma/space/newline/semicolon separated), parsed + deduped by `parseEmails`. Invite button shows the count ("Invite 3"), fires `POST /workspace/invite` per email via `Promise.allSettled`, adds+selects all successes, floats them to the top of the picker, and toasts "Added N people · M failed". ⌘/Ctrl+Enter submits. Capped at 20/batch.
- **Role On Invite**: MEMBER / VIEWER toggle (`invite-role-member` / `invite-role-viewer`) next to the field; the chosen role is passed to `/workspace/invite`. Verified end-to-end: invite-as-viewer creates the user with role=viewer.
- **Recent Contacts**: new backend `GET /workspace/contacts/frequent` ranks workspace members by shared-chat count with recency decay (`weight = 1/(1+rank*0.1)`). The dialog groups the list into "Frequently contacted" (top 6, `members-frequent-label`) and "All teammates" when not searching; a flat filtered list while searching.
- Verified via screenshot (all 3 render + function: grouping shows Priya/Qa on top, "INVITE 3", viewer toggle) and curl (frequent endpoint + role propagation). Testing agent NOT run this round (self-tested; builds on iter138's tested invite/create flow). Web-only — redeploy for teamnest.ai.

### Iteration 138 (web) — Group form: member search + invite-by-email; sticky footers on Add Member & Group Info
- **Member Search** (`NewChatDialog.jsx`): search box (`new-chat-member-search`) filters the member list by name/email; no-match empty state (`new-chat-members-empty`); a "N selected" counter on the MEMBERS label.
- **Invite In Create** (`NewChatDialog.jsx`, owner/admin only via `useAuth().user.role`): `new-chat-invite-row` with email field + Invite button calls `POST /workspace/invite`, then auto-adds the returned user to the member list AND checks them, so they're included when the group is created. Handles existing-user ("added to workspace") vs new-email (invite emailed). Hidden for member/viewer roles.
- **Sticky footer — AddMemberDialog**: converted to flex-col fixed-header/scroll-body with an always-visible `add-member-done-footer` (Done) bar.
- **Sticky footer — GroupInfo** (slide-over already had sticky header + scroll body): promoted the admin "Add member" action to a pinned bottom bar (`group-info-add-footer`), members tab + admin only.
- testing_agent iteration_138 = PASS (backend 3/3: invite new/existing/403-for-member; frontend 6/6 at 700px). Non-blocking: Sonner toast may briefly overlap the GroupInfo footer right after creation. Web-only change (redeploy to reach teamnest.ai).

### Iteration 137 (web) — Modal overflow fix: group-creation form + all popups
- **Bug**: On shorter laptop viewports the "New Chat" group-creation dialog was taller than the screen; the shadcn `DialogContent` had no height cap and no scroll, so the header + Create button + member controls overflowed off-screen and were unreachable. Reported on production (teamnest.ai) — same code in both envs.
- **Global fix** (`components/ui/dialog.jsx`): base `DialogContent` now `max-h-[90vh] overflow-y-auto` → no dialog can exceed the viewport; every popup scrolls to reveal its actions. (tailwind-merge lets individual dialogs override.)
- **Group form redesign** (`components/NewChatDialog.jsx`): converted to a flex column with a fixed header, a scrollable body (`new-chat-scroll`), and a **sticky footer** holding Cancel + Create (always visible). Removed the nested members inner-scroll in favour of one body scroll. Verified at 700px viewport: dialog 35→665, Create btn bottom 648, body scrollable — all within view.
- Note: the create dialog adds existing workspace members via checkboxes; inviting people OUTSIDE the workspace remains in Team → Invite / guest invite (unchanged). Fix is in preview — redeploy to push to teamnest.ai.

### Iteration 136 (Aug 2026) — Mobile IAP: variable/one-time consumables (pending-order pattern), Restore Prompt, Smart Upsell
- **Pending-order pattern** for consumables whose store product id doesn't identify the target (marketplace installs = variable price; storage packs). Client calls `POST /api/billing/iap/order {kind, ref_id}` → backend records a pending order + returns the store `product_id`; client buys it via RevenueCat; the signed webhook `NON_RENEWING_PURCHASE` matches (product_id + user) to the OLDEST pending order and fulfills it server-side (grants ONLY via webhook — no RevenueCat secret key). Client polls `GET /api/billing/iap/order/{id}` until `fulfilled`.
  - Storage packs map 1:1: `storage_10/50/100` → `pack-10/50/100`. Marketplace listings round UP to nearest tier: `marketplace_5/10/25/50/100` = 4.99/9.99/24.99/49.99/99.99.
  - Refactored shared grant helpers: `grant_storage_pack_to_workspace` (enterprise.py) + `install_listing_for_workspace` (ai_employee_marketplace.py), used by both the web routes and webhook fulfillment. Idempotent via atomic pending→processing claim + rc_events event-id dedupe (verified: 5→55 GB, duplicate = no double grant).
- **RevenueCat Apple public key** wired into `mobile/.env` (`EXPO_PUBLIC_RC_APPLE_KEY`). Bundle id = `ai.teamnest.app` (iOS + Android).
- **Restore Prompt** (`src/components/RestorePrompt.tsx`, root-mounted): first-launch one-tap "Restore my purchase" nudge for returning users with no active entitlement. Native-only (no-op in Expo Go / web preview).
- **Smart Upsell**: Pro-walls deep-link `/paywall?highlight=<plan>&reason=<text>` → contextual banner + "UNLOCKS THIS FEATURE" tag on the targeted plan card. Wired on the research tab Pro-wall.
- Mobile fallback: on web preview (no IAP) storage/free-marketplace fall back to the direct backend routes so the flow stays testable.
- **Post-purchase Toast** (`src/components/Toast.tsx`, `ToastProvider` root-mounted, `useToast().show()`): success toasts on storage-pack add ("N GB storage added") + marketplace install ("<name> installed"); marketplace errors now use the toast instead of `Alert`. Subscriptions/credits keep the paywall `flash` banner.
- **App display name** set to "TeamNest" in app.json (bundle id unchanged `ai.teamnest.app`; slug kept `mobile`).
- **Store-ready assets & metadata**: branded amber "nest" emblem icon (icon.png, adaptive-icon.png, favicon.png) + splash lockup (splash-image.png, imageWidth 220) on zinc-950 black. Set `version 1.0.0`, iOS `buildNumber "1"`, Android `versionCode 1`. (Icons/splash only render in a native Publish build, not the Expo web preview.)
- testing_agent iteration_136 = PASS (backend 17/17 + mobile UI). Toast + rename verified via screenshot (toast fired on storage add; login shows TeamNest branding). NOT testable in preview: real RevenueCat purchases + LiveKit — require a Publish (TestFlight) build.


### Iteration 133 (Jun 2026) — Live Reactions, Call Recap, Invite Timeline, Call Ringing (mobile)
- **Invite Timeline**: tappable team-member rows → sheet with the full Mailgun delivery timeline. Backend `GET /api/workspace/members/{id}/invite-timeline`.
- **Reaction Overlay**: quick-react now broadcasts an ephemeral live reaction (`POST /api/chats/{id}/reactions`, WS `reaction` event, not persisted) that floats up for everyone via `ReactionOverlay` — no longer posted as a chat message.
- **Call Recap**: `call_recap` card auto-posted after a call with a transcript (`generate_and_post_recap`); mobile `CallRecapCard` shows collapsible decision/action/risk/question highlights.
- **Call Ringing (foreground)**: new user-level WS `/api/ws/user` (declared before `/api/ws/{chat_id}`) + `ws_manager.send_to_user`; `start_call` broadcasts `incoming_call`, end broadcasts `call_unring`; mobile `CallRingListener` (root-mounted) shows an incoming-call banner + vibration with Accept/Decline. Background ringing needs push + a Publish build.
- testing_agent iteration_133 = PASS (backend 8/8 + mobile UI), no regressions.

### Iteration 132 (Jun 2026) — Phase 2 Mobile Calls (LiveKit) + Avatar Reactions
- **Mobile Calls (LiveKit)** on Expo, reusing the existing `/api/calls` backend (no backend changes). Header audio/video call buttons (group/direct only), in-chat LIVE call card + Join (and "ended" variant), full-screen call route `app/call/[id].tsx`. Native LiveKit room UI (`CallScreen.tsx`: mic/camera toggles, participant tiles, Android screen-share, hang-up) is **platform-guarded** — the web bundle resolves `CallScreen.web.tsx` (placeholder) so `@livekit/react-native` never reaches web. Installed LiveKit RN + webrtc packages + config plugins; app.json permissions set.
- ⚠️ Native calling only works in an Emergent **Publish** build (not Expo Go / web preview). iOS screen-share deferred (needs Broadcast Extension); screen-share control is Android-only.
- **Avatar Reactions**: header quick-react (`QuickReactBar.tsx`) — smiley → emoji row (❤️👍🎉😂🔥) → reanimated floating burst + posts the emoji to the chat; subtle reanimated press-scale on the chat-header group avatar.
- Tested: testing_agent mobile (iteration_132) PASS for all web-observable flows + no regressions; Avatar Reactions self-verified via screenshots.

### Iteration 131 (Jun 2026) — Mobile Group Avatars + Mobile Signup Onboarding
- **Mobile Group Avatars** (Expo parity with web): extended `Avatar.tsx` (photo → preset icon+color → initials), new `groupAvatarPresets.ts` + `GroupAvatarPicker.tsx` (preset color swatches + optional photo upload; photo downscaled to a 256px JPEG data URL via expo-image-manipulator, mirroring web). Wired into group-create (`NewChatSheet.tsx`), chat list + chat header; admins edit via the header avatar → `PATCH /api/chats/{id}/avatar`. Installed `expo-image-manipulator@14.0.8`.
- **Mobile Signup Onboarding** (`app/onboarding.tsx`): mirrors web ("How will you use TeamNest?" → persona → tailored first project/template, Skip supported). Triggers only after redeem/signup; login & demo-login skip it. Humanized redeem submit errors.
- No backend changes (reused `POST /api/chats` avatar fields, `PATCH /api/chats/{id}/avatar`, `PATCH /api/user/onboarding`). testing_agent mobile = PASS (iterations 130 + 131). Refilled seeded code `DEVOS100` for onboarding signup testing.
- **Phase 2 Mobile Calls (LiveKit) still PENDING** — deferred until after user review; needs native modules + platform guards + a Publish build (not previewable).

### Iteration 129 (Jun 2026) — Mobile Chats parity (Phase 1)
- Mobile now has: New Chat sheet (Development project, New group, New contact, Invite via SMS/WhatsApp, Find friends from contacts), chat filters (All/Direct/Groups/AI/Unread), workspace switcher + folder filters, and a Team screen. Plus workspace-shared Model Presets, an Invited→Joined tracker with Mailgun delivery badges, and a P0 mobile picker crash fix. Testing agent = PASS.
- **Phase 2 PENDING**: LiveKit audio/video/screen-share calls on mobile — backend already configured; needs a native/dev build (not previewable) and platform-guarded imports so the Expo web preview keeps bundling.

### Iteration 122 (Jun 2026) — Latest AI models + Combined default view + chat-invite email fix
- **Chat-invite email fix (P0)**: `POST /api/chats/{id}/invite-guest` & `.../invite-member` now email brand-new invitees a Mailgun set-password link (were silently email-less; only returned a one-time password). `_email_new_invitee()` in `routes/chats.py`. Verified live (`email_sent: true` + Mailgun accepted). Reaches production only after **Publish/Deploy**; set prod `PUBLIC_BACKEND_URL=https://teamnest.ai`.
- **Latest models (P1)**: `chatgpt`→`gpt-5.6-sol`, `claude`→`claude-sonnet-5`, NEW `claude-opus`→`claude-opus-4-8` (premium, 45 cr), `gemini`=`gemini-3.1-pro-preview`. Synced web + mobile pickers, Knowledge/Documents pickers, AI-employee dispatcher, billing + premium gating. All verified via live calls + `GET /api/ai/models`.
- **Default chat view = Combined** (web + mobile), honoring saved per-chat preference. Verified both surfaces.
- **Model "best for…" tooltips** (follow-up): shared `hint` per model; web pickers (`AiModelPicker`, `ModelComparePicker`) show a live hover caption + native `title`; mobile pickers (`chat/[id].tsx`, `AiComposeModal.tsx`) show a tap-to-preview caption. Verified web (caption "ChatGPT 5.6 — Strategy & structured thinking").
- **Resend invite** (follow-up): already shipped on web (`MembersTable.jsx` one-tap RESEND for pending members → `POST /workspace/invite/{id}/resend`). Verified via `/team` screenshot + curl (`ok: true`).
- **Deploy readiness**: deployment_agent = PASS, no blockers. Emergent auto-sets prod env vars (incl. `PUBLIC_BACKEND_URL`) on Publish. User publishes via the Emergent Publish button. For custom domain `teamnest.ai`, ensure `PUBLIC_BACKEND_URL` resolves to it so emailed links are correct.
- Test: `tests/test_iteration122_latest_models.py` (5/5).


### Iteration 98 (Jul 2026) — Deployed-employee chat responder + Builder Program hardening
- **Deployed AI employee auto-responds in live chats** (`services/ai_employee_deploy_dispatcher.py`, hooked into `routes/chats.py` send flow): when a message @-mentions a deployed employee's handle, it replies in-chat via its full runtime (profile+style+knowledge+permissions+escalation, Claude Fable 5). Chat-bound deployments only answer in their bound chat; handle deployments answer anywhere mentioned. Posts a "thinking…" placeholder then updates it; no reply-loop (AI messages bypass the send route).
- **Rejection cooldown**: after a rejected Builder application, re-applying is blocked for 30 days (`POST /api/builder-program/apply` → 429). `GET /builder-program/me` now returns `can_reapply` + `reapply_at`.
- **Decision audit trail**: every approve/reject writes an immutable record to `builder_program_audit`; `GET /api/builder-program/applications/{id}/audit` (super admin).
- **UI**: web `/builder-program` + mobile `/builder-program` show a "declined / re-apply after <date>" state (`bp-declined` / `mb-bp-declined`).
- **Mobile fix**: gated builder screens' data fetch on the auth token (via `useAuth().token`) to fix a hydration race that showed the wrong Builder Program state on cold-load.
- Tested: backend pytest (`tests/test_iteration98_*`) + web chat UI + mobile UI verified. Report: `/app/test_reports/iteration_98.json`. No blockers.


- **Builder access gating** (`routes/builder_program.py`): creating AI employees now requires builder access = super admin OR `builder_approved` user OR workspace on the top-level **Team plan ($19.99)**. `POST /api/ai-builder/employees` uses `require_builder` (403 otherwise).
- **Application + approval flow**: `POST /api/builder-program/apply` (signup sheet: name, company, website, motivation, value_prop, agent_ideas → `builder_applications`, pending). `GET /api/builder-program/me` → {builder_access, reason, application}. Super Admin: `GET /api/builder-program/applications?status=`, `POST .../applications/{id}/decide` (approve sets `users.builder_approved`).
- **Credit fix**: super admins now get **unlimited credits in every workspace they belong to** (not just owned) — `_unlimited_workspace_ids()` now includes all super-admin memberships. Team plan perks list "AI Employee Builder access (Beta)".
- **Web UI**: left sidebar link "AI Employee Builder * Beta" (all logged-in users); `/ai-builder` shows a gate (apply / upgrade) for non-builders; `/builder-program` application page; Super Admin panel gained a **Builders** tab (approve/reject queue); marketing Home page gained a "Build AI employees and earn" section. Suppressed the Credit-specials promo auto-open on builder routes (was intercepting clicks).
- **Mobile parity**: You tab link "AI Employee Builder ✦ Beta", `/builder` gate for non-builders, `/builder-program` apply screen.
- Tested: 12/12 backend pytest (`tests/test_iteration97_builder_program.py`) + web + mobile UI verified. Report: `/app/test_reports/iteration_97.json`. No blockers.

### Iteration 96 (Jul 2026) — Mobile parity for AI Employee Builder + multi-turn sandbox memory
- Ported the full AI Employee Builder to Expo/React Native (`mobile/app/builder/*`, `mobile/app/marketplace/*`): dashboard, 7-section employee editor, sandbox chat, permissions, deploy, marketplace browse/install. Added `apiPut` to mobile `src/api.ts`.
- Sandbox now has **multi-turn memory** via `session_id` (web + mobile): each conversation's prior turns are replayed to the model. Verified 96 iteration report.


**Phase 3 — Sandbox, Permissions & Deployment** (`routes/ai_employee_builder.py`, `services/ai_employee_runtime.py`)
- **Sandbox testing chat**: `POST /api/ai-builder/employees/{eid}/sandbox` generates a reply via Claude Fable 5 (fallback claude-sonnet-4-6) using a system prompt assembled from the employee's profile + saved style + knowledge docs + good/bad examples + permission level + escalation rules. Messages that hit an escalation rule return `escalated=true` with a reply starting `ESCALATE:`. Runs stored in `ai_employee_test_runs`; `POST .../test-runs/{id}/rate` (good/bad + optional correction, can save as a training example); `GET`/`DELETE .../test-runs`.
- **Permissions**: 5 levels (Answer only → Autonomous). `GET /ai-builder/permission-options`, `PUT/GET .../permissions`. Tool access rows (`POST/DELETE .../tools`, dup → 400) in `ai_employee_tool_access`. Escalation rules (`POST/DELETE .../escalation-rules`) in `ai_employee_escalation_rules`.
- **Deployment**: `POST .../deploy` (channel handle|chat; normalized @handle; cross-employee active-handle clash → 409; chat channel needs valid chat_id) → sets status Deployed + `deployment_handle`. `GET .../deployment`, `POST .../undeploy`. Records in `ai_employee_deployments`.
- **UI**: employee profile now has 7 tabs (Profile/Training/Examples/Style/Sandbox/Permissions/Deploy). Sandbox chat with thumbs up/down + correction; Permissions tab (level/risk/tools/escalation); Deploy tab (deploy as @handle or into a chat).

**Phase 4 — Marketplace** (`routes/ai_employee_marketplace.py`, `pages/ai_builder/AIEmployeeMarketplace.jsx`)
- **Publish/unpublish** (creator): `POST /api/ai-builder/employees/{eid}/marketplace/publish` freezes a shareable snapshot (profile + saved style + permissions + tools + escalation; docs+examples only if `share_knowledge=true` — central-learning control). Re-publish updates the same listing. `POST .../marketplace/unpublish`.
- **Browse/detail/install**: `GET /api/ai-builder/marketplace` (?category, ?q, installed/is_mine flags), `GET .../categories` (12), `GET .../marketplace/{id}` (preview of what you get). `POST .../marketplace/{id}/install` clones the snapshot into the installer's workspace as a NEW employee + records a license + increments install_count; double-install in same workspace → 400.
- **Creator licensing dashboard**: `GET .../marketplace/mine` (listings + summary: total_listings/published/total_installs/total_revenue_usd). `GET .../marketplace/installs` lists workspace licenses.
- **UI**: `/ai-builder/marketplace` (Browse/My listings/Installed tabs, search, category chips, listing modal with Install). "Marketplace" button on the Builder dashboard; "Share on Marketplace" publish card in the employee Deploy tab.
- New collections: `ai_employee_test_runs`, `ai_employee_permissions`, `ai_employee_tool_access`, `ai_employee_escalation_rules`, `ai_employee_deployments`, `ai_employee_marketplace_listings`, `ai_employee_marketplace_licenses`. Employee delete cascades all of them.
- Tested: 34/34 backend pytest (`tests/test_iteration95_phase3_phase4.py`) + web UI verified (sandbox Fable 5 reply, permissions, deploy, publish, marketplace browse/install). Report: `/app/test_reports/iteration_95.json`. No blockers.

### Iteration 94 (Jul 2026) — AI Employee Builder Phase 2: Style Training Center
- **Style sources (MOCKED connectors)**: Gmail/Slack/WhatsApp demo writing samples (no OAuth — sample data only) + paste-your-own manual samples. Endpoints: `GET /api/ai-builder/style-connectors`, `POST/GET/DELETE /api/ai-builder/employees/{eid}/style-sources`, `POST .../style-sources/manual`. Reconnecting a source replaces the prior row (idempotent per source).
- **Style profile generation via Claude Fable 5** (`services/ai_employee_style.py`): analyses connected samples + good examples → structured JSON profile (tone, formality, avg_sentence_length, vocabulary, greeting, sign_off, emoji_usage, signature_phrases[], avoid_phrases[], summary, generated_by). Uses `anthropic/claude-fable-5` with automatic fallback to `claude-sonnet-4-6`, and a deterministic fallback profile if both fail. `POST .../style-profile/generate` (draft), `POST .../style-profile` (save), `GET`/`DELETE`.
- **Training completeness**: "Style profile added" flips true only after a profile is SAVED (draft doesn't count). Employee delete now cascades `ai_employee_style_sources` + `ai_employee_style_profiles`.
- **Web UI** (`EmployeeProfile.jsx`): new "Style" tab (connect sources, paste samples, generate → editable profile card with phrase chips, save). Training tab gained file upload (`/uploads` → document with file_id). Toast reflects whether Fable 5 or the fallback produced the profile.
- New collections: `ai_employee_style_sources`, `ai_employee_style_profiles`.
- Tested: 19/19 backend pytest (`tests/test_iteration94_style_training.py`) + web UI verified via screenshot (Gmail connect → Fable 5 generation). Report: `/app/test_reports/iteration_94.json`. No blockers.

### Iteration 93 (Jul 2026) — AI Employee Builder Phase 1 (verified)
- Builder dashboard + 16-template gallery + create modal (blank/template/job-description) + employee profile editor (Profile/Training/Examples) with live training-completeness panel. Backend `routes/ai_employee_builder.py` + `services/ai_employee_templates.py`. Verified 12/12 backend pytest + full web UI flow (`tests/test_iteration93_ai_employee_builder.py`).

## Prior Features
### Iteration 87 (Jul 2026) — Invite-only viral launch system + access-gated billing
- **Launch Access Mode** (launch_settings, default invite_only; waitlist/approved_only/open) + 7 admin toggles. `GET /api/launch/config` drives all UI gating (hooks/useLaunchConfig.js).
- **Signup gated**: /auth/signup → 403 invite_required unless open mode. New accounts only via `POST /api/launch/code/redeem` (creates user+workspace, grants access level, badges, N personal invites, sets session).
- **Waitlist** (/waitlist): full form + interest areas + "What would you build?", rank cards (counter starts #1247), referral links (?ref=CODE, +50 spots/referral), milestones 1/3/5/10/25/50 (5 refs auto-grants demo code), dedupe email+ip_hash. Public leaderboard (masked names).
- **Invite codes**: 8-char alnum, case-insensitive, single/multi-use, expiry, allowed domains, 9 access levels (waitlist_only→full_beta) with plan eligibility + credit limits + badges. States: valid/invalid/expired/used/inactive with friendly screens (/invite).
- **Personal invites** (/invites): 4+ per approved user, share via copy/WhatsApp/X/LinkedIn/email/SMS (prewritten viral copy in lib/launchShare.js), team multiplier unlocks at 2/4/6/10 accepted joins.
- **Code drops** (/drop/CODE, seeded DEVOS100 83/100 left, 24h countdown) + admin drop creator.
- **Admin Launch Control** (/launch-admin, owner/admin): waitlist table (search/filter/approve/reject/CSV), code generator (campaigns, prefix, uses, expiry), campaign pause, drops, grant extra invites (1/4/10/custom + in-app notification), leaderboard, analytics (12 metrics incl. checkout_blocked), Mailgun email previews, settings.
- **Billing gating**: checkout/credits/hosting endpoints → 403 launch_gated for launch_access statuses outside {invited, approved, demo, founder_beta, full_beta, paid_member}; pre-launch accounts (no launch_access) grandfathered. Pricing page + /billing show gate screens; hero/nav/login show Request Invite / Enter Invite Code (demo button hidden while invite-only).
- **Emails**: real Mailgun sends (teamnest.ai domain, existing mailgun_service) + every email stored in invite_notifications for admin preview. 9 template kinds.
- CRITICAL FIX: lib/api.js PUBLIC_PATHS now includes /waitlist, /invite, /drop/ (401 interceptor was redirecting direct loads to /).
- Seeded: 12 collections, mock waitlist (Sam T. 42 refs etc.), codes DEVOS100/FOUNDR25/BUILD247.
- Tested: 20/20 backend pytest (tests/test_iteration85_launch_invite.py) + full Playwright pass (iteration_85.json); redeem→/dashboard redirect + /login demo-hide fixes self-verified.
- Also this session: removed all "1 credit = $0.0010 / 40% margin" pricing-math copy (Pricing.jsx, DevOsInfo.jsx, billing_settings note).

### Iteration 86 (Jul 2026) — Next-ideas panel: minimized default + research mode for unhired chats
- **NextIdeasPanel minimized by default**: shows only the small "Suggestions" chip until the user expands (choice persisted per chat via localStorage `chat:next-ideas:hidden:{id}`, "0" = expanded). No API fetching while minimized; re-syncs on chat switch.
- **Hire-aware suggestions**: `GET /chats/{id}/next-ideas` now branches on `chat.dev_team_hired`. Unhired → research-copilot mode: all prompts start with `@ai` (summaries, comparisons, risk analysis, recommendations) grounded in chat history; project context omitted; fallback list is research-only. Hired → existing build-oriented behavior (@devmgr prompts + project context).
- Verified via curl (unhired bakery chat → 4 @ai research chips; hired chat → @devmanager build chips) + Playwright (minimized default, expand shows @ai chips, no runtime errors).

### Iteration 85 (Jun 2026) — First-task-free teaser + Demo-mode anti-abuse guardrails
- **Plan teaser (conversion hook)**: FIRST @devmanager mention in an unhired chat gets a free LLM plan preview (gpt-5.4-mini, markdown: vision/screens/data model/phases, explicitly NO code, deterministic fallback) followed by the $199 hire card. One-time per chat (`chat.devmgr_teaser_used`); later mentions get only the hire card. `_post_plan_teaser` in dev_chat_agents.py; message `metadata.plan_teaser`.
- **Demo guardrails** (public demo workspace = amit@demo.team's, resolved via `deps.demo_workspace_id` 5-min cache):
  - Rate limit: `DEMO_BUILD_LIMIT_PER_HOUR` env (default 10) rolling-hour cap on `dev_build_activities`; `/talk` → 429 `demo_limit_reached`; chat mentions → friendly "Demo limit reached" message (`metadata.demo_limit`, 2-min throttle). `GET /api/demo/quota` → {is_demo, limit, used, remaining}.
  - Demo meter chip in DevStudio toolbar (`ds-demo-meter`, "⚡ Demo · X/10 builds left", refreshes after builds, rose when 0). 429 toast in studio.
  - Watermark: "TeamNest demo preview" badge injected serve-time into all demo-workspace preview + /p/ production HTML (`_inject_demo_watermark` in dev_preview_shim.py).
  - Exports blocked (403 friendly copy via `deps.block_if_demo`): GitHub export, Vercel/Netlify deploys, file PUT edits + snapshot reverts (read-only artifacts).
  - Ephemeral projects: already covered by 1h inactivity demo_reset (dev_projects in wipe list).
- Fix: hire pill/button hidden on already-hired projects (DevStudio toolbar + MockupNotice preview banner).
- Self-tested via curl + Playwright screenshot: teaser+card posted once, quota 429, demo_limit chat msg, watermark in HTML, 403s on export/PUT, meter chip renders.

### Iteration 84 (Jun 2026) — @devmanager monetization gating + Builders expansion
- **Price $599 → $199, configurable**: `HIRE_DEVMANAGER_PRICE_USD` env (backend/.env, default 199) drives checkout amount; `GET /api/hire-devmanager/config` exposes it; all frontend buttons (banner/pill/toolbar) fetch price dynamically — copy is now "Hire @devmanager · $199".
- **Chat gating**: `@devmanager`/`@devmgr` mentions (and implicit devmgr routing) in an unhired chat run NO LLM work — `_post_hire_prompt` posts an in-chat checkout card (`metadata.hire_prompt`, HirePromptCard.jsx, throttled 1/2min). Demo account (amit@demo.team) bypass provisions free on checkout click.
- **Build Room gating**: `GET /dev-projects/{id}` returns `dev_team_hired` (via `deps.project_dev_team_hired`: related chat hired, or any workspace chat for chatless projects). `POST /talk` + builders PUT/generate/suggest → 402 `hire_required` when unhired. UI: lock icon on Builders tab, hire banner in studio chat pane, toolbar hire button hidden once hired.
- **Builders tab additions**: "App Builder" (guided 4-step plain-English Q&A wizard → composes @devmanager instruction; locked until hired) + "Templates" (17-template catalog, browsable FREE; "Use this template" locked until hired). Locked builders show LockedBuildersPanel with hire CTA. Default rail: templates when locked, appbuilder when hired.
- **Slash command popover**: typing `/` in the chat composer opens SlashCommandPopover (7 Dev OS commands: new/template/scan/task/bug/plan/help) with keyboard nav — mirrors the `@` mention popover.
- WelcomeTour + MentionPopover copy updated to single @devmanager entity at $199.
- Tests: `/app/backend/tests/test_iteration84_hire_gates.py` 13/13 + full Playwright pass (see /app/test_reports/iteration_84.json). Known kept-unhired fixtures: project 7d700236… / chat a7024917… ; hired fixture: project 86f09509… / chat db183e41….

### Core (Phase 1)
- Auth: signup / login / demo-login + per-user `preferences.favorite_ai_model`.
- Workspace + invite (owner / admin / member / viewer).
- Chats: group / direct / personal_ai with members, pinned messages, integrations.
- Messages: send / edit / delete / react / pin via REST + WS broadcast.
- AI Research (6 models — ChatGPT, Claude, Gemini, DeepSeek, Perplexity, Grok)
  - Single-tool fast path (no synthesis) when 1 model selected
  - Multi-tool: auto-best (favors user's favorite) → auto-synthesize
- Side-by-side comparison panel with voting + re-synthesize.
- Ask AI Before Posting (10 polish actions).
- Project folders + saved research + linked tasks/chats.
- Tasks: Kanban + AI multi-task breakdown (`/api/ai/suggest-tasks`) with
  SuggestTasksDialog (per-task assignee/priority/due picker).
- Inline `@task` command parsing.
- Reminders posted to assignee's personal AI chat.

### Iteration 73 (Feb 2026) — Chat + Dev OS reliability sprint
- **NextIdeasPanel** above the chat composer — 4 LLM-generated "what to try next" chips that drop their full prompt into the composer on click. Backed by `GET /api/chats/{id}/next-ideas` with 60s server cache + `?refresh=1` force regen + deterministic fallback list. Per-chat hide/show persisted in localStorage.
- **Empty-preview self-heal**: `/api/dev-projects/{id}/preview/index.html` now seeds a deterministic stub SPA on the fly (`seed_stub_files`) when the project has zero generated files — no more bare `404 — index.html` in the chat-side LivePreviewPane. Friendly empty-state fallback if seeding fails.
- **Resilient demo-login shim**: every served preview HTML gets a `/* tn-login-shim */` script injected that hooks `[type=email]` + `[type=password]` inputs and any sign-in button by text/id — so `demo@example.com / demo` always works regardless of which element ids the LLM-generated index.html chose.
- **Spin-up now writes `chat.linked_dev_project_id`** so the active-project pointer is set the moment a chat creates a Dev OS project (and seeds stub files immediately).
- **DevProjectSwitcher iframe-refresh bug fix**: GET `/api/chats` + GET `/api/chats/{id}` both now read `chat.linked_dev_project_id` first (was: arbitrary `related_chat_id` lookup), and `LivePreviewPane` keys its iframe on `${project.id}:${refreshKey}` so React re-mounts on switch. Chat-header pill text + right-rail iframe now follow the active project correctly.
- Tests: `/app/backend/tests/test_iteration72_next_ideas_preview.py` (10 tests) + `test_iteration73_active_project_pointer.py` (6 tests) — 16/16 passing; frontend e2e Playwright verified switcher + chips + composer drop-in.

### Iteration 78 (Jun 2026) — Blank preview everywhere (storage cross-contamination)
- **Root cause**: all generated apps share one browser origin and the same localStorage keys (`app:auth`, `app:entities`). Stale auth/entities from one app leaked into another → app.js auto-entered app-view with foreign-schema data → BOTH views ended display:none → blank page on chat preview, DevStudio preview, share links and /p/ links. Reproduced deterministically.
- **Fix (serve-time, universal)**: login shim wraps `Storage.prototype` get/set/removeItem to prefix `app:*` keys with `tn:{project-or-slug}:` derived from the URL path (covers /dev-projects/{id}/preview, /p/{slug}, /share/preview/{token}, /preview/shared/{token}). Every generated app has isolated storage; stale global keys ignored. Users log into each app once again (fresh namespaced state).
- Verified via Playwright with stale global keys: login view renders (no blank) → login → app-view block, 8 entities, no JS errors, namespaced keys written.

### Iteration 77 (Jun 2026) — "Nothing loads after login" fix (Fun Pizza Kitchen)
- **Root cause 1 (content)**: 04:31 design edit rewrote index.html dropping every id app.js renders into (#entities-list, #create-form, filters, customizer). Repaired via talk_to_build (rebuilt app-view with full ID contract, kept new design); republished v2. Added HTML↔JS ID-CONTRACT rule to talk_to_build prompt (redesigns must preserve ids or return both files).
- **Root cause 2 (shim)**: login shim's `stopPropagation()` blocked the app's own login handler, and shim only toggled `hidden` attr while some generated apps use inline `style.display` — app stayed display:none after login. Shim now: no stopPropagation (app handler runs too), clears inline display + block fallback. Serve-time → fixes all previews/releases instantly.
- Also diagnosed earlier outage: EMERGENT key budget exhausted ($20.02/$20) killed all AI calls; user topped up. Custom domains remain MOCKED (CNAME info only) — real path = Vercel/Netlify deploy tabs.
- Verified via Playwright: login → app-view display:block, 8 entities, 3 KPI cards, customizer + specials render.

### Iteration 76 (Jun 2026) — LLM model upgrades (all providers, Universal Key)
- Ensemble (`ai_service.py` MODEL_CONFIG): ChatGPT → **gpt-5.5**, Claude → **claude-sonnet-4-6**, Gemini → **gemini-3.1-pro-preview**, fast tier → **gpt-5.4-mini** + **gemini-3.5-flash** (claude-haiku-4-5 already latest).
- Worker models across app (dev agents, codegen, github summaries, chat categorize, dashboard, bookkeeper, inline @ai, calls/voice-note summaries, ai_cmo, memory_rag): gpt-4o/gpt-4o-mini → gpt-5.4/gpt-5.4-mini; sonnet-4-5 → 4-6; gemini 2.5 → 3.x. MODEL_CONFIG key names unchanged (e.g. "gpt-4o-mini" key now maps to gpt-5.4-mini) so catalog/fallback references stay valid.
- Verified: direct pings on all 5 new models via EMERGENT_LLM_KEY + e2e `@ai` chat answer (PONG test).

### Iteration 75 (Jun 2026) — Governance + collaboration increment (Phase A of "Emergent competitor" spec)
- **QA/Security publish gates**: `routes/dev_gates.py` — QA content checks (6 named, ≥5 to pass) + static security scan (secrets/eval/document.write block; innerHTML/http warn). `POST /dev-projects/{id}/gates/run`; gates stored on releases; launch-checklist badges in PublishDialog; owner `override_gates` (else 422 `gates_failed`).
- **PM approval flow**: `dev_action_approvals`. Non-PM publish/GitHub-export auto-creates approval + interactive chat card (`metadata.approval_card` → ApprovalActionCard.jsx Approve/Reject). PM = 'product' role-claim else workspace owner/admin. Approve executes (`_do_publish` refactor / `export_or_fallback`); reject posts ⛔; members 403 on decide.
- **Collaborative preview comments**: team mode (LivePreviewPane drawer; resolve / convert-to-task / convert-to-bug) + GUEST mode on public share links (`/preview-share/{token}/comments`, name+comment, no auth/credits) with feedback panel on SharePreviewPage.
- **Snapshot diff viewer**: `GET .../files/{fid}/diff/{snapshot_id}` (difflib) + DiffViewer.jsx modal in FileExplorerPanel history (revert-from-diff).
- **LivePreviewPane upgrades**: quick-action chips (Fix bug/Add feature/Improve design/Mobile friendly → composer via onQuickPrompt), mobile/desktop viewport toggle, comments drawer.
- **Risk labels** on edit summaries (🟢 Safe / 🟡 Needs review when backend/schema/auth touched). **Auto release notes** on publish (phase3b, background task).
- **Preview render guard** (user bug): serve-time style enforces `[hidden]{display:none}` + scrollable body — fixes generated apps showing login+app views simultaneously/overflowing. Codegen prompts hardened (hidden-attr toggling, 420px responsive).
- Tests: iteration_75 — backend 11/11, frontend pass; HIGH item (ApprovalActionCard wiring lost during test run) re-fixed, verified via Playwright (8 cards, live statuses).
- **Phase B backlog (NOT built)**: Build Review Meeting thread after publish; per-project credit budgets/guardrails; Owner Mode plain-English digest; feature voting board + "Ask the team" polls; AI standup; Build Room 5-tab layout; clone-and-customize; company template library; AI preference memory; integration marketplace placeholder cards; voice/meeting-to-project entry points; promo-card overlap with comments drawer (minor UI).

### Iteration 74 (Jun 2026) — Live build feed, publish-to-production, attachments-to-build
- **BuildProgressCard (Emergent-style live activity feed)**: every AI build/edit posts a `build_progress` chat message; the card polls `GET /api/build-activities/{id}` (1.5s) and shows steps ticking live — 🔍 Analyzing → 📐 Planning → ✍️ Wrote frontend/app.js (4/7) → 🧪 Smoke tests 6/6 → 🚀 Deploying preview. Service: `services/dev_build_activity.py` (`start_activity/add_step/complete_activity/fail_activity`); instrumented in `_maybe_auto_start_project._build` and `_route_as_continuation`+`talk_to_build(on_step=...)`.
- **End-of-build recommendations**: after every successful build/edit, an ai-system message with `metadata.idea_chips` (4 LLM-generated product-specific chips, `@devmgr`-prefixed prompts, deterministic fallback) renders as tappable pills; click drops the prompt into the composer (`onPickIdea` threaded Chats → MessageList → MessageBubble).
- **Full-screen preview**: LivePreviewPane header Maximize2 icon + "Open full screen" link in the creds banner (window.open raw preview).
- **Attachments feed the build**: chat images (vision via ImageContent) + small text files (inlined) now flow into `@role` replies, `talk_to_build` edits, and new-project `generate_project_files` (frontend specs only). Loader: `_load_attachment_context` in dev_chat_agents.
- **Publish to production (TeamNest hosting)**: `POST /api/dev-projects/{id}/publish` snapshots all files into `dev_prod_releases` (version increments); public serve at `/api/p/{slug}/...` (login shim injected) wrapped by React route `/p/:slug` (ProductionAppPage). Slug editing + collision auto-suffix + 409 on taken; custom domain PATCH → `pending_dns` + CNAME instructions in UI (DNS verification MOCKED/informational).
- **Real Vercel/Netlify deploys**: `POST /api/dev-projects/{id}/deploy/vercel|netlify` with user tokens (never stored) — Vercel v13 inline-file deployments, Netlify digest deploy w/ site reuse; clean 4xx on bad tokens, httpx errors → 502. UI: PublishDialog (TeamNest/Vercel/Netlify tabs) from LivePreviewPane "Publish".
- **Continuation routing fix**: `_maybe_auto_start_project` now prefers `chat.linked_dev_project_id` (any source) for continuation detection — spin-up-created projects (`source: "chat"`) previously never matched (only `auto_devmgr`).
- **Public-route fix**: `PUBLIC_PREFIXES` in `lib/api.js` now includes `/p/`, `/share/`, `/call/` — unauthenticated visitors were 401-redirected to `/` off public pages.
- **Login-shim race fix (post-iter74 bug report)**: user reported demo login failing on the Engineering project. Root cause candidate verified: login handlers (app.js + shim install) only attach after deferred app.js downloads — on slow connections a Sign-in click during that window did nothing. `_inject_login_shim` now ALSO installs a document-level delegated capture listener at parse time, so `demo@example.com / demo` works even if app.js never loads. Verified via Playwright: normal, app.js-blocked, chat-iframe, and wrong-creds (error shown) scenarios all pass.
- **"Comment → activity" fix (user report: 'nothing happens when I comment')**: three routing gaps closed in `dev_chat_agents.py`: (1) plain messages with NO @mention in a development chat with a linked project now implicitly route to @devmgr when actionable (`_should_implicit_devmgr` + `_looks_actionable`: edit verbs, bug signals like "can't read/broken/unreadable", lead-in stripping for "let's/please/can you"); (2) specialist mentions (e.g. @frontend) with actionable asks now APPLY the edit via `_maybe_specialist_edit` → `_route_as_continuation` instead of just replying in prose (first-mentioned specialist only, devmgr owns multi-mention builds, cascade_depth 0 only); (3) `_is_continuation` gained bug-signal + lead-in handling so complaints route to the existing app instead of dead-ending. Also: idea-chip prompts now forced to "@devmgr add/improve" enhancement phrasing (a chip's "create a library of..." had spawned an unintended NEW project), and codegen styles.css/index.html prompts now mandate explicit input background+text color pairing (the "white font in inputs" bug). Verified E2E: plain unmentioned bug report → devmgr reply → live activity card → real edit (`input{color:black}` + text-black classes landed in the preview).
- Tests: `/app/backend/tests/test_iteration74_publish_build_activity.py` (11 tests) + Playwright e2e — see `/app/test_reports/iteration_74.json` (backend 100%, frontend 8/9 → 9/9 after the PUBLIC_PREFIXES fix, re-verified via fresh-context screenshot).


- File / image uploads via Emergent Object Storage.
- Public AI snapshot shareable link.
- White calendar icon (`filter: brightness(0) invert(1)`) on dark inputs.
- Browser favicon + manifest (yellow `TN` mark on dark).

### Find Your Friends + Referrals (Phase 2a — Feb 2026)
- **Magic invite link**: rotate/copy/revoke with role + expiry + max_uses (`/api/invites/link`).
- **Public join landing** `/join/{token}` — preview workspace + signup-to-join + celebratory boost toast.
- **Bulk email invite**: paste/CSV, dedupe, builds `mailto:` deep link (recipients on BCC).
- **Share buttons**: WhatsApp / SMS / Email deep links with prefilled message.
- **QR code** (yellow on dark) for in-person sharing.
- **Pending invites tracker** with auto-status refresh when invitee joins.
- **People you may know** by email-domain (privacy-safe: masked email, skips
  generic consumer domains).
- **Sidebar nav** "Find Friends" (yellow accent) + **Dashboard banner** for
  small workspaces.
- **Referral incentive**:
  - Inviter earns `referral_count++` and unlocks tiered badge (Bronze 1+, Silver 5+, Gold 15+, Platinum 50+) with progress bar to next tier.
  - Joiner gets `pro_boost_until = now + 14d` (Pro AI Boost — all 6 models unlocked, visible as ⚡ in sidebar).
  - Workspace leaderboard (top 5) with self-highlight.
  - Endpoints: `GET /api/me/referrals`, `GET /api/leaderboard/referrals?scope=workspace|global`.

### Phase 2a — Voice / Approvals / Export / Admin (Feb 2026)
- **Voice notes** (`/api/voice-notes`) — browser MediaRecorder → upload → playback.
  AI actions on each note: **Transcribe** (real Whisper via Emergent LLM Key, ~$0.006/min),
  **Summarize** (Claude markdown: TL;DR + key points + action items), **Create task**.
  Graceful fallback on tiny/silent audio (returns `text=""` instead of 500).
- **Approvals workflow** for AI final answers (`/api/approvals`, `/api/approvals/{id}/decision`).
  Statuses: draft → needs_review → approved | rejected | needs_revision → archived.
  Approve locks the answer (no edits). Decision history tracks every reviewer.
  Notifies creator/reviewers in their personal AI chat.
- **PDF / Word export** via `reportlab` + `python-docx` — research threads, approvals.
  `/api/export/research/{thread_id}?format=pdf|docx`, `/api/export/approval/{id}?format=pdf|docx`.
  Branded with yellow brand bar, page numbers, structured sections.
- **Admin Dashboard** (`/admin`, owner/admin only):
  - 8 stat tiles (users, messages, AI threads, tasks, approvals, files, top AI, due today)
  - Users tab with inline role + status edit (last-owner safeguard)
  - AI Usage bar chart
  - Task analytics (by status, by assignee, due today)
  - Approval analytics (by status)
- **Send for approval** + **Export PDF** buttons on AI Comparison panel synthesized answer.

## P1 Backlog / Coming Next
- **Student plan follow-ups** (P2): auto-apply the plan on paid webhook (already wired via `apply_plan_change`); optional annual Student SKU; re-verify `.edu` on renewal.
- **Credit governance follow-ups** (P2): per-cap email/in-app alerts at 80%/100%; enforce caps on non-chat AI consumption paths (dev_os, calls, voice) — currently enforced on chat inline @ai + research; scheduled cap digests.
- **App Store curation tools** (P2): featured section, category management.
- **Weekly "Your store performance" digest** for sellers (P3, via chat post or Resend email).
- **Stripe go-live**: live keys stashed in backend/.env as STRIPE_LIVE_*; app runs STRIPE_MODE=test — do NOT flip without explicit user instruction.
- **OAuth contact sync** (Google People API + Microsoft Graph contacts) —
  playbook ready; awaiting user OAuth credentials.
- **Sub-second streaming transcription** (Deepgram) — current Whisper-based live
  has ~4-6s latency due to chunk batching. Optional upgrade.
- Tasks: subtasks, comments, multi-assignee, advanced reminder schedule.
- Email reminders (currently in-chat only).
- Settings page (favorite AI palette).
- ~~Refactor `server.py` into routers.~~ ✅ Done Feb 2026 (see below)

### Phase 4 — Stripe Portal, Annual Billing, Guest Revoke, AI Polish, Standup Digest, Deepgram (Feb 2026)

**Billing**
- `POST /api/billing/portal` — Stripe Customer Portal session for owners
  to update card / view invoices / cancel.
- Annual billing toggle in `/billing` page: monthly $20 → annual $200 (17% off),
  monthly $50 → annual $500 (17% off). New env vars `STRIPE_PRO_ANNUAL_PRICE_ID` /
  `STRIPE_TEAM_ANNUAL_PRICE_ID` enable the recurring annual SKU once user
  creates those Prices in their Stripe dashboard.
- Free-plan users see a small "Self-serve portal available after upgrade"
  hint instead of an invisible button.

**Guest collaborator polish**
- `GET /api/chats/{id}/guests` — list active guests in a chat.
- `DELETE /api/chats/{id}/guests/{user_id}` — owner/admin only. Removes from
  chat; if no remaining scope chats, kicks them from the workspace entirely.
  Posts a "X removed" system message.
- `InviteGuestDialog.jsx` now shows current guests with one-click Remove.

**AI answer polish**
- `ai_answer.metadata` now includes `credits_total` + `credits_breakdown`
  ([{model_key, model_name, credits}]) so the UI can show what was charged.
- New `ModelBadge` component on every AI answer: shows model name + credit
  cost in a pill, hover tooltip reveals "fast model" vs "premium model" context.
- New `RerunPremiumButton` — when the answer used a fast model
  (`gpt-4o-mini` / `claude-haiku` / `gemini-flash`), shows a one-click
  "↻ Re-run with Premium" CTA that posts `@ai ask claude <original>` for a
  Claude Sonnet re-pass. Drives upgrade behavior on free tier, ARPU on Pro.

**Daily Standup Digest** (engagement booster)
- `POST /api/standup/generate {chat_id?, project_folder_id?}` — Aggregates
  open tasks, completed-yesterday, overdue, due-today, then calls GPT-4o mini
  to produce a markdown digest with TL;DR, sections, and emoji headers.
  Returns markdown + stats; if `chat_id` provided, also posts as a system
  message into that chat for everyone to see.
- New **"Daily Standup"** button on the Dashboard. Result renders inline
  with stats footer.

**Mobile tab bar polish**
- Active tab gets a top accent bar + 110% icon scale + smooth transition.
- Drop shadow at the top edge separates from content above.
- Active state animates on tap.

**Deepgram Nova-3 transcription** (sub-second live transcript)
- New `services/deepgram_service.py` wrapping Deepgram SDK v7 with `nova-3`
  model, smart formatting, language auto-detect.
- `voice_service.transcribe_audio()` now tries Deepgram FIRST; falls back to
  Whisper if Deepgram returns empty/errors. Same response shape — caller
  doesn't care.
- Affects: live call chunks (`/api/calls/{id}/transcribe-chunk`), voice
  notes, call recording uploads.
- Per-chunk latency: ~4-6s (Whisper) → **~0.5-1s** (Deepgram) — 4-8× faster.
- `DEEPGRAM_API_KEY` in `/app/backend/.env`.

**Tests** — iteration 23: 12/12 backend pytest + 6/6 Playwright frontend
flows pass. Zero issues found.

### Stripe subscription bug fix + AI speed-up (Feb 2026)

**Bug**: `POST /api/billing/checkout` returned 500 — `emergentintegrations`
Stripe wrapper is hard-coded to `mode='payment'` and Stripe rejected the
recurring Price IDs with *"You specified `payment` mode but passed a recurring
price."*

**Fix**: Bypass the wrapper for recurring plans — call native
`stripe.checkout.Session.create(mode='subscription', line_items=[…])`
directly. Status-polling endpoint switched to `stripe.checkout.Session.retrieve()`.
Webhook handler rewritten to use `stripe.Webhook.construct_event()` with our
`STRIPE_WEBHOOK_SECRET` and handle:
  - `checkout.session.completed` → mark txn paid + upgrade plan
  - `customer.subscription.deleted` → downgrade workspace to free
  - `customer.subscription.updated` → mirror cancel-at-period-end flag

**`@ai` speed-up** (10× faster, 35× cheaper):
- Default inline `@ai <question>` was triggering 3 premium models in parallel
  + a 4th synthesis call. Total wait ~8-13s, burning ~70 credits per question.
- Now defaults to a single fast model (**GPT-4o mini**, 2 credits, ~1s). The
  user's `favorite_ai_model` preference applies only to the AI Compose /
  Compare workflow, not casual inline questions.
- Explicit comparison still available via `@ai ask all` (6 models +
  synthesis) or `@ai ask claude, gemini` (custom subset).
- Synthesis step (when comparing) switched from Claude Sonnet → GPT-4o mini —
  saves another ~3-5s on every compare query.
- Added 3 fast model entries to `MODEL_CONFIG`: `gpt-4o-mini`, `claude-haiku`,
  `gemini-flash` (with proper credit costs 2/9/1).

**Verified**: default `@ai` 0.83s / 2 credits (was 8.9s / 70 credits).

### Phase 3 — Profile, Mobile Tab Bar, Guest Collaborators, Stripe Billing + AI Credits (Feb 2026)

**(a) Self-serve Profile (`/profile`)**
- New `routes/profile.py` — PATCH `/me/profile` (name, phone with uniqueness,
  avatar URL), POST `/me/password` (current pw check), POST `/me/email` (pw
  confirmation + collision check).
- New `Profile.jsx` page surfaces all three sections + a `must_change_password`
  banner that nags guest accounts to set a real password on first login.

**(b) Bottom mobile tab bar**
- `MobileTabBar.jsx` — fixed bottom bar shown only `<md`. Five thumb-reachable
  tabs (Chats · Tasks · AI · Friends · Me). Hidden on `/call/*` routes for full
  video real estate.
- `AppShell.jsx` adds `pb-16 md:pb-0` so content scrolls clear of the bar.

**(c) Guest collaborators (single-chat scope)**
- New `workspace_members.chat_scope_ids` field — when set, the user only sees
  the chats they were invited to.
- POST `/api/chats/{chat_id}/invite-guest` — accepts `{user_id}` (existing
  TeamNest user) OR `{email, name?, phone?}` (creates a fresh guest account
  with a one-time password + `must_change_password=true`).
- New `InviteGuestDialog.jsx` — search existing users OR create-new form;
  shows a copyable credentials card after creation.
- `GET /api/chats` respects guest scope (returns only allowed chats).
- "Guest" button surfaces in the chat header (hidden for personal-AI chats).

**(d) Stripe Billing + AI credit metering**
- 3 plans: Free (300 credits/mo), Pro $20/mo (6,000 credits), Team $50/mo
  (18,000 credits). Credit cost per model = vendor cost × 1.4.
- `services/billing.py` — plan defs, `MODEL_CREDIT_COST` map (Claude Sonnet
  =34 credits, GPT-4o=23, Gemini Pro=12, Haiku=9, Flash=1, …), per-month auto-
  reset, free-fallback grace allowance.
- `routes/billing.py` — `GET /billing/plans`, `GET /billing/me`, `GET /billing/usage`,
  `POST /billing/checkout` (owner-only, Stripe Checkout via emergentintegrations),
  `GET /billing/checkout/status/{id}` (idempotent polling), `POST /billing/downgrade`,
  `POST /webhook/stripe`.
- Credit gating integrated into AI orchestration: `filter_models_by_credits` +
  `deduct_credits_for_responses` in `services/ai_runtime.py`; `routes/ai.py`
  `create_research` returns 402 when out of credits with friendly hint to upgrade.
- Free-tier fallback: when out of credits, fast models (GPT-4o-mini, Claude
  Haiku, Gemini Flash) stay available up to a small grace allowance.
- `/billing` page with 3 plan cards, usage graph, owner-only upgrade CTAs.
- `CreditsWidget` in sidebar — live credits-remaining bar + Upgrade nudge.

**(e) Capacitor native scaffold**
- `frontend/capacitor.config.json` + `/app/CAPACITOR.md` with iOS + Android
  build instructions. User runs the commands on a Mac/Android Studio machine.

**(f)** Deepgram — pending Deepgram API key.
**(g)** SSO + E2E — P3 backlog.

**Tests** — iteration 22: 15/15 backend pytest + 8/8 Playwright frontend
flows pass (zero issues found).

### Phone-at-signup + User Search + Direct Add (Feb 2026)
Built on top of the multi-workspace foundation: workspace members can now find
existing TeamNest users by email or phone and add them to their workspace
without going through email-invite at all.

**Data model**
- `users.phone` (string, as provided) + `users.phone_normalized` (digits-only)
  for exact matching. Phone is unique across the platform.
- Migration backfills `phone_normalized` from any legacy `phone` field.

**API additions**
- `GET /api/users/search?q=<email-or-phone>` — auth required (member+),
  returns minimal masked info (`name`, `masked_email`, `masked_phone`,
  `workspace_name`, `already_in_workspace`). Phone matching accepts multiple
  formats: full E.164, dashed, spaces, last-7 or last-10 digits.
- `POST /api/workspace/add-existing-member {user_id, role?}` — workspace
  member-level access; any member can add as `member`, owner/admin can pick
  any role. Idempotent: 400 if the user is already an active member.

**API changes**
- `POST /api/auth/signup` and `POST /api/public/invite/redeem` now accept an
  optional `phone` field. Duplicate phone → 400.
- `public_user` response includes `phone`.

**Frontend additions**
- Landing.jsx signup form: optional `[data-testid='signup-phone']` field
  marketed as "makes you discoverable to teammates".
- JoinWorkspace.jsx: `[data-testid='join-phone']` only shown for brand-new
  accounts.
- TeamAdmin.jsx: new "Find existing user" button next to "Invite by email"
  opens a search dialog. Debounced search, privacy-masked results, one-click
  Add. `invite-btn` is now properly disabled for non-owner/admin roles.

**Tests** — Iteration 21: 14/14 backend pytest + 7/7 Playwright frontend
flows pass.

### Multi-Workspace Membership (Feb 2026)
Customer-reported bug fix: when inviting an email that already had a TeamNest
account in another workspace, the system returned `400 "User already exists"`.
Resolved by promoting users to a true multi-workspace model (Slack/Discord-style).

**Data model**
- New `workspace_members` collection: `{user_id, workspace_id, role, status, joined_at}` — source of truth for "who is in what workspace with what role".
- `users.workspace_id` is now the user's *active* workspace pointer; `users.role` mirrors the active workspace's per-membership role.
- One-time idempotent migration on startup (`services/workspace_membership.migrate_legacy_users`) backfills `workspace_members` rows from existing `users.workspace_id` data.

**API additions**
- `GET /api/me/workspaces` — list all workspaces the current user belongs to.
- `POST /api/workspace/switch` `{workspace_id}` — set active workspace.
- `POST /api/public/invite/check-email` `{token, email}` — pre-flight for the
  join page; reports `existing_user`, `name`, `already_member`.

**API changes**
- `POST /api/workspace/invite` — if email exists, add a membership instead of
  erroring; returns `added_to_existing_user: true`.
- `POST /api/public/invite/redeem` — if email exists, verify the user's
  existing TeamNest password (401 on mismatch) then add a membership. Returns
  `joined_existing_account: true`.
- `/auth/signup`, `/auth/login`, `/auth/demo-login`, `/auth/me` all now return
  the user's `workspaces[]` list.
- `/admin/users`, `/admin/overview`, `/workspace/members`, `/invites`, and
  `/invites/suggestions` now resolve workspace membership via `workspace_members`
  rather than `users.workspace_id`.

**Frontend additions**
- Sidebar `WorkspaceSwitcher` between brand + nav. Single-workspace users see a
  static label; multi-workspace users get a chevron and dropdown.
  `data-testid="workspace-switcher-btn"` / `workspace-switcher-menu`.
- `JoinWorkspace.jsx` detects existing accounts (debounced
  `/public/invite/check-email`) and swaps the form to a "sign in & join" flow
  with a green banner explaining their existing account will be augmented.

**Tests**
- Iteration 20: 22/22 backend pytest tests pass + 17/17 Playwright frontend
  assertions pass. Customer bug verified fixed end-to-end.

### Mobile-responsive Sidebar (Feb 2026)
- **Off-canvas drawer pattern** on viewports `<md` (Tailwind 768px). The sidebar
  is hidden by default; a new mobile top bar (`[data-testid="mobile-topbar"]`)
  carries the hamburger button + brand mark.
- Tapping the hamburger slides the drawer in from the left with a dimmed
  backdrop. Drawer auto-closes on: nav-item click, route change (via
  `useLocation`), backdrop tap, close button, and `Escape` key.
- Desktop behavior (`md+`) is unchanged — sticky in-flow sidebar at 240/56 px,
  manual collapse via `[data-testid="sidebar-toggle"]` and `localStorage` still
  works.
- Tested via testing agent (iter 19): 12/12 mobile + desktop checks pass.

### Backend Refactor — server.py → modular routers (Feb 2026)
- **server.py** trimmed from 3050 → 129 lines; now a pure FastAPI bootstrap
  (mounts routers, CORS, WebSocket, startup/shutdown).
- **`/app/backend/deps.py`** — shared infrastructure: `db`, `require_user`,
  `public_user`, `_post_reminder`, `_broadcast_message`, `_referral_badge`,
  `ensure_personal_ai_chat`, badge thresholds.
- **`/app/backend/services/`** — cross-router background helpers:
  - `ai_runtime.py` — `_finalize_research`, `handle_ai_command`, `handle_inline_task`
  - `calls_runtime.py` — `public_call`, `post_call_card`, `generate_and_store_highlights`
- **`/app/backend/routes/`** — 16 domain routers, one per area:
  `auth · workspace · folders · chats · ai · share · tasks · dashboard ·
   uploads · integrations · invites · voice_notes · approvals · exports ·
   admin · calls · public`
- Tests: 201/207 pytest pass (zero refactor regressions, 6 pre-existing flakes
  cause Grok-429 + cascade ShareSnapshot failures).

### Screen Sharing in Calls — UX upgrade (Feb 2026)
- `CallRoom.jsx` now subscribes to `Track.Source.ScreenShare` in **both** audio
  and video call modes (previously video-only).
- Dedicated `ScreenShareStage` layout: shared screen takes the main canvas with
  a yellow accent border + presenter chip; camera tiles / participant badges
  collapse to a right rail.
- Top bar shows a "**X is presenting**" banner with the screen-share icon
  whenever any participant is sharing.
- `toggleShare` syncs state with `localParticipant.isScreenShareEnabled` so the
  browser's native "Stop sharing" bar correctly updates the UI.
- Screen share is published with `audio: true` so the tab/system audio is
  shared too (where the browser allows).
- Toasts: `Sharing your screen` on start, `Screen share permission denied` /
  `Screen share unavailable on this browser` on failure.

### Phase 2c-Live — Real-Time Transcription + AI Highlights (Feb 2026)
- **Browser-side chunking** — `useLiveTranscription` hook captures each
  participant's mic in 4-second chunks via parallel MediaRecorder.
- **Whisper transcription** — each chunk → `POST /api/calls/{id}/transcribe-chunk`
  → Emergent LLM Key Whisper → text segment.
- **LiveKit data-channel broadcast** — server uses `LiveKitAPI.room.send_data()`
  topic=`transcript` so every participant sees lines appear in real time.
- **Auto-saved transcript** — segments persist on `call.transcript_segments[]`
  AND build up `call.transcript.text` so the post-call AI summary is generated
  from real call content (source='transcript' instead of 'chat_context').
- **AI Highlights** — when a call ends, Claude analyzes the full transcript and
  tags individual segments as `decision`, `action_item`, `risk`, or `question`
  with a one-line note. Runs as background task on call end + manual
  `POST /api/calls/{id}/highlights` for regenerate.
  - **MeetingSummaryDialog**: HIGHLIGHTS chip bar with per-kind counts
    + annotated transcript view with colored left borders & kind icons.
  - **One-click task from segment** — each `action_item` row has a `+ TASK`
    button that opens SuggestTasksDialog pre-filled with the segment text and
    Claude-inferred assignee from workspace members.
  - **Chat call card**: tiny chip preview (e.g. "1 DECISION · 2 ACTIONS · 1 RISK").
- **Pause/Resume per user** — pause stops your local upload only.
- **Live Transcript Panel** opens by default with REC indicator + time-stamps.

### Phase 2c — AI Meeting Summaries / Transcription / Demo Seed (Feb 2026)
- **Post-call AI meeting summary** generated from transcript or chat context
  around the call window. Structured markdown: TL;DR, Participants, Key points,
  Decisions, Open questions, Risks, Action items (with owner+due), Next steps.
- **Transcript upload** — drop any audio file → Whisper transcribes via Emergent
  LLM Key → cached on the call → unlocks sharper AI summaries.
- **MeetingSummaryDialog** — summary/transcript tabs, generate/regenerate/edit,
  upload recording, **create tasks from summary** via SuggestTasksDialog, export
  PDF/Word.
- **Live transcript panel** placeholder in CallRoom for forward-compatibility.
- **Phase-2 demo seed top-up** — idempotent insertion of 2 historical calls (Max
  Brenner video 42m + Jay Bhavani audio 28m) with transcripts & summaries, plus
  1 approved + 1 pending approval + 1 overdue task.
- Endpoints: `POST /api/calls/{id}/upload-recording`, `POST /api/calls/{id}/summary`,
  `PATCH /api/calls/{id}/summary`, `PATCH /api/calls/{id}/transcript`,
  `GET /api/export/call/{id}?format=pdf|docx`.

### Phase 2b — Audio / Video / Screen-share Calls (Feb 2026)
- Real WebRTC via **LiveKit Cloud**. Server issues JWT tokens; LiveKit handles SFU.
- One-on-one + group, audio-only + video, screen sharing, participant grid with
  pinning (via `@livekit/components-react` prebuilt tiles).
- In-chat **call cards**: green LIVE pulse + "Join call" while active; gray ENDED + duration + participants once finished.
- Endpoints: `GET /api/calls/config`, `POST /api/calls/start`, `POST /api/calls/{id}/join`,
  `POST /api/calls/{id}/end`, `GET /api/calls/by-chat/{chat_id}`,
  `GET /api/calls/{id}`, `POST /api/webhooks/livekit`.
- Server-side state in Mongo `calls` collection. Initiator can force-end; others just mark-left.
- LiveKit webhook validates signature (HMAC via API secret) and auto-finalizes
  call state when room finishes.

## P2 Backlog
- Audio/video calling (WebRTC).
- WhatsApp chat import.
- ~~Stripe billing.~~ ✅ DONE (iter 22 — native Stripe SDK)
- ~~Native iOS / Android.~~ ✅ DONE (iter 24 — Capacitor 7 + 9 plugins)
- Enterprise SSO.

## Key Endpoints
- Auth: `POST /api/auth/{signup,login,demo-login}`, `GET /api/auth/me`
- Preferences: `GET/PATCH /api/user/preferences`
- Chats: `GET/POST /api/chats`, `GET/POST /api/chats/{id}/messages`, integrations
- AI: `POST /api/ai/research`, `POST /api/ai/extract-task`,
  `POST /api/ai/suggest-tasks`, `POST /api/ai/improve`, `GET /api/ai/models`
- Tasks: `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/{id}`
- Files: `POST /api/uploads`, `GET /api/files/{id}`
- Public: `GET /api/public/snapshot/{token}`, `GET /api/public/invite/{token}`,
  `POST /api/public/invite/redeem`
- **Invites**: `GET/POST /api/invites/link`, `POST /api/invites/link/rotate`,
  `DELETE /api/invites/link/{token}`, `POST /api/invites/bulk`, `GET /api/invites`,
  `DELETE /api/invites/{id}`, `GET /api/invites/suggestions`
- WS: `/api/ws/{chat_id}?token=...`

## Mongo Collections
- `users` (preferences, role, workspace_id), `workspaces`, `chats`, `messages`,
  `ai_threads`, `ai_responses`, `tasks`, `saved_research`, `folders`,
  `integrations`, `files`
- **New (iter 9)**: `invite_links`, `invites`

## Test Reports
- Backend tests: `/app/backend/tests/test_iteration{8,9}_*.py` — 32/32 pass on
  new features; 106/108 overall regression (2 pre-existing flakes).
- Frontend E2E via testing agent — iterations 1–9 all passing.
- **Iter 24 — Native Devices**: 4/4 backend tests pass for
  `POST/GET/DELETE /api/devices/register` (idempotent upsert verified).

## Iteration History
See `/app/memory/CHANGELOG.md` for the full per-iteration changelog (iterations 24-135).
- iter 135 (2026-06): **Mobile In-App Purchases via RevenueCat** — iOS/Android buy subscriptions + credit packs through native App Store / Play billing (no Stripe redirect on mobile; web keeps Stripe). Store prices set ~20% above web (web stays discounted); Android shows a web-discount note, iOS a neutral fee note (anti-steering safe). Backend webhook + register + sync (`services/iap_revenuecat.py`, `routes/iap.py`), idempotent, entitlements student/pro/team, consumables credits_1000/5000/15000. Mobile `app/paywall.tsx` + guarded `react-native-purchases`. testing_agent = PASS (backend 7/7 + mobile paywall). Native purchase NOT testable in preview — needs Publish build + store products + RevenueCat keys. Phase-2: marketplace/enterprise add-ons not yet on IAP.
- iter 134 (2026-06): Ringtone + Missed Call card + Recap→Task + Resend-from-Timeline (mobile+backend). testing_agent = PASS.
- iter 130 (2026-06): **Marketing homepage rebuild (web)** — broadened positioning to Individuals/Students/Teams/Businesses. New `HomeV2` (13 sections) + reusable `components/web/home/*`, public landing pages `/individuals /students /teams /business /ai-research /multi-model-ai`, new nav/footer, SEO. Fixed the `lib/api.js` 401-interceptor `PUBLIC_PATHS` allowlist (deep-links to new + pre-existing `/v2`,`/legacy` were bouncing to `/`). Enterprise app route preserved. testing_agent web = PASS.
- iter 120 (2026-06): Dual Human/Combined/AI chat views — **Phase 1 (web)**. Header view switch (default Human), Human-view research cards, AI-view dashboard grouped by participant, right-side AI discussion panel, composer "To: Everyone" destination pill. Backend `GET /api/chats/{id}/ai-discussions` (extends `ai_threads`). Phases 2–4 (visibility/publish, notifications/search/analytics, mobile parity) pending.
- iter 119 (2026-06): Inline `@ai` model picker (web + mobile).
