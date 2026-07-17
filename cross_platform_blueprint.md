# Cross-Platform Port Blueprint: Enterprise Module & Connectors (Iterations 104-106)

## 1. Detection
- **Source Platform**: Web (`/app/frontend/`). The React SPA contains recently built "Enterprise Module" (Role Intelligence Phase B, C, D) and "Connectors Polish" (Knowledge Capture, Risk Dashboard, Review-before-save). Evidence: `EnterprisePage.jsx`, `EnterpriseProfile.jsx`, `ConnectorsPage.jsx` exist and are heavily updated.
- **Target Platform**: Mobile (`/app/mobile/`). Expo React Native app. Evidence: Lacks any `enterprise` or `connectors` routes in `app/`.
- **Assumption**: The task is to port the Enterprise Intelligence suite (Role Continuity, Knowledge Capture, Risk Dashboard, Handoffs, Storage Billing) and Connectors UI from Web to Mobile.

## 2. Existing App Map (Web)
**Screens / Routes**
- **Enterprise Dashboard** (`/enterprise`): 6-tab layout
  - *Overview*: licensed employee counts, role counts, knowledge risk preview.
  - *People*: list of employees with continuity scores, risk badges, and "Add employee" modal.
  - *Roles*: mapped roles with responsibilities and scores.
  - *Risk*: Risk distribution visualizer, expandable expertise-map cards showing 10-point breakdowns and dependency flags.
  - *Review*: Queue for approving/rejecting proposed knowledge memories.
  - *Billing*: Seat licenses and storage metering with add-on pack purchases.
- **Enterprise Profile** (`/enterprise/:id`): Profile-specific tabs
  - *Overview*: Employee basic stats.
  - *Knowledge*: Captures approved memories, includes a "Capture Knowledge" modal (paste text or pick chat).
  - *Handoff*: Successor assignment flow, 30/60/90 checklist, Markdown brief, and "Ask Previous Role" chat.
  - *Settings*: Profile configuration.
- **Connectors Hub** (`/connectors`):
  - Integrations list (Gmail, etc.).
  - *Train Employee Modal*: 2-step process (Date range -> Preview redacted samples -> Save to employee).

**Components & User Flows**
- *Visual Indicators*: `ContinuityBar` (progress bar), `RiskBadge` (Critical/High/Medium/Low colored chips), `Stat` cards.
- *Capture & Review Flow*: User proposes a memory from text/chat -> enters "Review" queue (pending badge) -> Admin approves/rejects -> becomes Grounded Knowledge.
- *Handoff Flow*: Assign successor -> generate 30/60/90 checklist -> chat with "Previous Role".

## 3. Shared Backend API Surface
The new platform must reuse these endpoints under `EXPO_PUBLIC_BACKEND_URL`:

**Enterprise Overview & People**
- `GET /api/enterprise/overview` - Stats and risk preview.
- `GET /api/enterprise/people` - Employee list.
- `POST /api/enterprise/people` - Add employee.
- `GET /api/enterprise/people/{eid}` - Fetch specific employee profile.
- `GET /api/enterprise/roles` - Mapped enterprise roles.
- `GET /api/enterprise/roles/{role_id}/profile` - Detailed role breakdown.

**Risk & Billing (Phase C/D)**
- `GET /api/enterprise/risk-dashboard` - Expertise map, risk distribution, 10-pt breakdowns.
- `GET /api/enterprise/storage` - Bytes metered by collection.
- `POST /api/enterprise/storage/packs/purchase {pack_id}` - Buy storage allowance.
- `GET /api/enterprise/billing` - Seat licenses + storage estimate.

**Knowledge Capture & Review (Iteration 106)**
- `POST /api/enterprise/roles/{role_id}/capture {text, chat_id}` - Propose memory.
- `GET /api/enterprise/memories/review` - Pending memory queue.
- `POST /api/enterprise/memories/{mid}/decide {decision, title, content}` - Approve/reject.
- `GET /api/enterprise/roles/{role_id}/memories` - Approved knowledge.

**Successor Handoff (Phase B)**
- `GET /api/enterprise/people/{eid}/candidates` - Successor list.
- `POST /api/enterprise/people/{eid}/successor {successor_user_id}` - Assign successor.
- `GET /api/enterprise/people/{eid}/handoff` - Checklist and brief.
- `POST /api/enterprise/people/{eid}/handoff/checklist {item_id, done}` - Toggle items.
- `GET /api/enterprise/roles/{role_id}/ask/history` - Chat history.
- `POST /api/enterprise/roles/{role_id}/ask {message}` - Talk to "Previous Role".

**Connectors (Iteration 106)**
- `GET /api/connectors` - Connected accounts.
- `POST /api/connectors/gmail/train-employee {preview_only}` - Fetch redacted samples.
- `POST /api/connectors/gmail/save-training {preview_id}` - Confirm save.

## 4. Data Models & Integrations
- **MongoDB Collections**: `enterprise_people`, `enterprise_roles`, `enterprise_handoffs`, `enterprise_storage_packs`, `connector_style_previews` (temporary training preview state).
- **Integrations**: `services/enterprise_intelligence.py` uses Claude Fable 5 for capturing knowledge, handoff generation, and answering "Ask Previous Role". This is purely server-side. Connectors use OAuth via backend routes.

## 5. Port Requirements (Target Platform: Mobile / Expo)
**Navigation & Routing**
- Add entry points to Enterprise & Connectors in the mobile shell (potentially off `You` or `(tabs)`).
- `app/enterprise/index.tsx` (Enterprise Dashboard & 6 tabs)
- `app/enterprise/[id].tsx` (Employee Profile, Handoff & Knowledge)
- `app/connectors/index.tsx` (Connectors hub)

**Screen-by-Screen Porting**
1. **Enterprise Dashboard**:
   - The 6 horizontal tabs (Overview, People, Roles, Risk, Review, Billing) are too dense for standard top tabs. Suggest a scrollable horizontal chip list (`ScrollView horizontal={true}`) or grouped segments.
   - *Risk Tab*: Implement the `ContinuityBar` via a React Native `<View>` with dynamic width. Use expandable `<TouchableOpacity>` cards for the expertise map.
   - *Review Tab*: Build editable memory cards. Use `TextInput` for title/content edits before Approve/Reject.
2. **Enterprise Profile**:
   - Use horizontal swiping (`react-native-tab-view` or similar) to separate Overview, Knowledge, and Handoff.
   - *Handoff Tab*: Requires a robust chat interface (`KeyboardAvoidingView`, `FlatList` reversed) for "Ask Previous Role", combined with a checklist component for the 30/60/90 items.
3. **Connectors**:
   - Replace standard modals with Native Modal (`react-native-modal` or standard `<Modal>`).
   - The Gmail 2-step flow requires maintaining a `preview_id` in React Native component state after the first API call, then displaying the redacted emails in a scrollable list before firing `save-training`.

**Platform Specifics**
- Replace Web Shadcn primitives with React Native primitives (e.g., `<View className="bg-surface rounded-2xl p-4 border border-line">`).
- Use Safe Area handling (`useSafeAreaInsets()`) especially for bottom sheets/modals like the "Capture Knowledge" prompt.
- Mobile has no physical "hover" state; rely on visual active opacities (`activeOpacity={0.7}`) for the risk dashboard rows.

## 6. Open Questions / Risks
- **Connectors OAuth Flow on Mobile**: Web redirects to `/api/oauth/gmail/login` which manages the session. On Mobile, does this need an `expo-web-browser` / `expo-auth-session` flow to capture the callback, or do we omit the initial connection flow on mobile and assume read-only usage of already-connected accounts?
- **UI Density of 6 Enterprise Tabs**: Cramming Overview, People, Roles, Risk, Review, and Billing into one mobile screen may result in sluggish `ScrollView` performance or confusing navigation. Main agent should consider moving "Billing" to a separate settings page.
- **Chat vs Checklist overlap**: In the Handoff tab, how should the UI structure the checklist and the chat interface simultaneously? (A split-screen isn't possible on a phone). Suggest pushing the "Ask Previous Role" chat to its own sub-route (`app/enterprise/[id]/ask.tsx`).