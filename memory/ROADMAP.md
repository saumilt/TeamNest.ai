# TeamNest.ai — Roadmap

## P1 — Upcoming
- (DONE iter 80) Real headless-browser smoke gate (playwright) per build/QA run.
- (DONE iter 81) Builders Hub — 7 visual plain-English builders as 6th DevStudio tab, spec persistence + auto-feed to @devmanager.
- (DONE iter 87) AI-powered Builders: plain-English → AI-generated structured spec → editable cards → auto-apply Save & Apply.

## P2
- (DONE iter 79) Site importer — URL/domain detection + content/color extraction into codegen context.
- (DONE iter 82) Expand Template gallery — booking + real_estate_crm one-click code templates (3 total incl. ap_ledger).

## Future / Backlog
- (DONE iter 80) Custom domain routing (p-resolve + frontend bootstrap + Release tab UI).
- (DONE iter 82) DNS-proof verification (TXT/CNAME probe) before marking a custom domain connected.
- (DONE iter 82) CSP for served preview/production/demo HTML (connect-src 'none', frame-ancestors 'self').
- DELETE /api/dev-projects/{id} endpoint (project deletion is currently DB-only — testing agent nit).
- DNS proof: A/AAAA fallback + multi-hop CNAME chains for apex domains.
- (DONE iter 89) Preview isolation: full storage namespacing + hardened headers (nosniff, referrer, permissions-policy, CORP). True subdomain isolation deferred — needs DNS/ingress.
- Optional one-off migration rewriting historical `ai-agent-frontend`/`ai-agent-qa` sender_ids to `ai-agent-devmgr` for a clean single-agent timeline (cosmetic).

## Refactoring (production hygiene)
- (DONE iter 80) Split dev_os.py into dev_os_tasks/dev_os_files/dev_os_preview (1244 lines remain; optional further split of projects/talk/templates).
- (DONE iter 82) Split `services/dev_chat_agents.py` (1039 → 848 lines): heuristics + idea chips moved to `dev_chat_ideas.py`.

## Role Intelligence (enterprise module)
- (DONE iter 103) Phase A — Foundation: seed, overview/people/roles, profile shell.
- (DONE iter 104) Phase B — Successor Assignment & Knowledge Transfer (30/60/90 handoff + checklist) + "Ask Previous Role" grounded/anonymized chat.
- (DONE iter 105) Phase C — Expertise Map + Knowledge Risk dashboard (visual per-role continuity, dependency flags, at-risk ranking + drill-down).
- (DONE iter 105) Phase D — Storage metering + packs + billing dashboard (Cloudflare R2 base + 40% markup; displayed, not charged).
- (DONE iter 106) P2 — Knowledge capture from chats/tasks/notes → Proposed Memory Review queue (approve before it enters role knowledge; feeds Ask Role + handoffs).
- P2 — Office 365 connector (Microsoft Graph read-only style training) — playbook ready, awaiting user Azure credentials.
- P3 — Mobile parity for the enterprise Role Intelligence module (currently web-only): overview/people/profile/risk/billing/ask-role/review.

## Marketplace backlog (post iter 84)
- (DONE iter 89) Stripe Connect payouts: Express onboarding + dual-mode transfers (real key → live; emergent key → simulated, flagged).
- Real Stripe subscription objects for monthly template renewals (currently internal period_end +31d; first month charged via real checkout).
- More user-template curation tools (featured section, categories management).
