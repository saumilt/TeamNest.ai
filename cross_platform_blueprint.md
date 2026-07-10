# Cross-Platform Port Blueprint: AI Employee Builder

## 1. Detection
- **Source Platform**: Web (`/app/frontend/`). Mature React 19 SPA. Contains the recently completed "AI Employee Builder" (Phase 1-4) under `src/pages/ai_builder/`.
- **Target Platform**: Mobile (`/app/mobile/`). Expo SDK scaffold using `expo-router`. Currently has a basic 4-tab shell (`Chats`, `Research`, `Tasks`, `You`), but entirely lacks the AI Employee Builder and Marketplace functionality.
- **Assumption**: The cross-platform task is to port the comprehensive **AI Employee Builder** ecosystem (Iterations 93-95) from Web to Mobile.

## 2. Existing App Map (Web)
**Screens / Routes**
- **AI Employee Builder** (`/ai-builder`): Builder dashboard, template gallery (16 templates), and "Create" modal (blank/template/job description).
- **Employee Profile** (`/ai-builder/:id`): Dense configuration hub with 7 tabs:
  - *Profile*: Basic info, role, avatar.
  - *Training*: File uploads (knowledge docs).
  - *Examples*: Few-shot Q&A pairs.
  - *Style*: Faux connector integrations (Gmail/Slack/WhatsApp) + text samples -> Claude Fable 5 style profile generation.
  - *Sandbox*: Test chat with the employee (includes rate/correction thumbs up/down).
  - *Permissions*: Autonomy level, tool access, escalation rules.
  - *Deploy*: Assign a `@handle` or deploy into a specific chat, plus "Publish to Marketplace".
- **Marketplace** (`/ai-builder/marketplace`): Browse (12 categories), My Listings, Installed. Includes a Listing Detail Modal with an "Install" button.

**Components & User Flows**
- *Completeness Panel*: Live progress bar evaluating if the employee has enough training data.
- *Sandbox Testing Flow*: `POST` message -> hit escalation rules -> rate good/bad.
- *Marketplace Flow*: Creator "Publishes" snapshot -> User "Installs" clone into workspace -> records license.

## 3. Shared Backend API Surface
The mobile app must reuse these endpoints (Base: `EXPO_PUBLIC_BACKEND_URL`).

**Builder & Profile Core**
- `GET /api/ai-builder/dashboard` - Dashboard stats.
- `GET /api/ai-builder/templates` - Catalog of 16 starter templates.
- `POST /api/ai-builder/employees` - Create (Blank, Template, JobDesc).
- `GET /api/ai-builder/employees/{eid}` - Fetch full employee state.
- `DELETE /api/ai-builder/employees/{eid}` - Cascade delete.
- `POST /api/ai-builder/employees/{eid}/documents` & `DELETE .../documents/{doc_id}` - Knowledge base.
- `POST /api/ai-builder/employees/{eid}/examples` & `DELETE .../examples/{ex_id}` - Q&A pairs.

**Style Training (Phase 2)**
- `GET /api/ai-builder/style-connectors`
- `POST /api/ai-builder/employees/{eid}/style-sources` (and `/manual`)
- `POST /api/ai-builder/employees/{eid}/style-profile/generate` (Calls Fable 5)
- `POST /api/ai-builder/employees/{eid}/style-profile` (Save generated profile)

**Sandbox & Deploy (Phase 3)**
- `GET /api/ai-builder/permission-options`
- `PUT /api/ai-builder/employees/{eid}/permissions`
- `POST /api/ai-builder/employees/{eid}/tools` & `DELETE .../tools/{tool_id}`
- `POST /api/ai-builder/employees/{eid}/escalation-rules` & `DELETE .../escalation-rules/{rule_id}`
- `POST /api/ai-builder/employees/{eid}/sandbox` - Test chat.
- `POST /api/ai-builder/employees/{eid}/test-runs/{run_id}/rate`
- `POST /api/ai-builder/employees/{eid}/deploy` & `POST .../undeploy`

**Marketplace (Phase 4)**
- `POST /api/ai-builder/employees/{eid}/marketplace/publish` & `unpublish`
- `GET /api/ai-builder/marketplace` (categories, search, installed)
- `GET /api/ai-builder/marketplace/{id}`
- `POST /api/ai-builder/marketplace/{id}/install`

## 4. Data Models & Integrations
- **MongoDB Collections**: `ai_employees`, `ai_employee_style_sources`, `ai_employee_style_profiles`, `ai_employee_test_runs`, `ai_employee_permissions`, `ai_employee_tool_access`, `ai_employee_escalation_rules`, `ai_employee_deployments`, `ai_employee_marketplace_listings`, `ai_employee_marketplace_licenses`.
- **Integrations**: 
  - **Claude Fable 5**: Used server-side for Sandbox replies and Style Profile generation. No mobile changes needed.
  - **File Storage**: Web uploads files to `/api/uploads` (Emergent Object Storage). Mobile will need to adapt `FormData` uploads.

## 5. Port Requirements (Target Platform: Mobile / Expo)

**Navigation additions (`mobile/app/`)**
- Add entry points to the AI Builder and Marketplace. Given the complexity, this might live under a new `(tabs)/builder/` structure, or be linked from the existing `You` tab.
- `app/builder/index.tsx` (Builder Dashboard & Templates)
- `app/builder/[id].tsx` (Employee Profile Editor)
- `app/marketplace/index.tsx` (Marketplace Hub)

**Screen-by-Screen Porting**
1. **Builder Dashboard**:
   - `ScrollView` containing stat cards and the template catalog `FlatList`.
   - Native Modals (`react-native-modal` or Expo router modals) for the "Create" wizard.
2. **Employee Profile Editor**:
   - **UI Density Adaptation**: The 7-tab Web interface is too dense for a phone screen. Recommend using a `react-native-tab-view` (swipeable top tabs) or converting the tabs into a Stack Navigator where each "tab" is a distinct screen pushed onto the stack (e.g. `app/builder/[id]/style.tsx`).
   - **Training Tab (File Uploads)**: Swap web `<input type="file">` for `expo-document-picker`.
   - **Style Tab**: Mock connectors can just be buttons. The generated profile cards will use `ScrollView` and standard `Text`/`View` chips.
   - **Sandbox Tab**: Must implement a `KeyboardAvoidingView` Chat UI specifically for the Sandbox, complete with the inline Thumbs Up/Down and Correction inputs.
   - **Completeness Panel**: A sticky bottom `SafeAreaView` or a progress bar in the header.
3. **Marketplace**:
   - `FlatList` with horizontal categories (chips) and vertical listing cards.
   - Install confirmation must use native `Alert.alert`.

**Platform Specifics**:
- Replace Shadcn elements with React Native primitive equivalents (`TouchableOpacity` for buttons, `TextInput` for inputs).
- `StyleSheet` translation of "Swiss Brutalism" (dark backgrounds, sharp borders, yellow accents).
- Keyboard handling is critical for Sandbox and Example creation.

## 6. Open Questions / Risks
- **Tab vs Stack Navigation for Profile**: The Web's 7-tab editor will likely break mobile UI conventions if forced into a single screen with horizontal scroll tabs. The main agent should confirm if we convert these 7 sections into a list of menus (Stack Navigation) instead.
- **Expo Document Picker**: File uploads for the Knowledge tab require ensuring `expo-document-picker` works seamlessly and `FormData` is properly constructed for the React Native `fetch`/`axios` environment.
- **OAuth Mock Connectors**: The Web uses fake mock connectors for Gmail/Slack style imports. Does Mobile need a `WebView` fake OAuth flow, or just an immediate API call?