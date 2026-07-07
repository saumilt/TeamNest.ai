# Cross-Platform Port Blueprint: TeamNest.ai

## 1. Detection
- **Source Platform**: Web (`/app/frontend/src/`). A mature React 19 SPA using Shadcn, Tailwind, and React Router.
- **Target Platform**: Mobile (`/app/mobile/`). An empty Expo SDK scaffold using `expo-router`.
- **Goal**: Add a native iOS/Android client via Expo that connects to the existing shared backend, porting the web functionality into mobile-native patterns.

## 2. Existing App Map
**Screens / Routes (Web)**
- **Auth & Launch**: `/login`, `/signup`, `/waitlist`, `/invite` (Invite-only viral launch system).
- **App Shell (Tabs)**: `Chats`, `Research` (AI), `Tasks`, `Calls`, `You` (Profile/Billing/Admin).
- **Core Detail Views**: 
  - `/chats/:chatId`: Real-time chat with AI agents (@devmanager) and WebSockets.
  - `/call/:callId`: LiveKit WebRTC video/audio call room.
- **Dev OS**: `/dev-os/projects/:projectId/studio` (IDE, code viewer, UI builder, build console).

**Components & State**
- Global `AuthContext` managing user, JWT tokens, and workspace state.
- Shadcn/Radix UI components (dark theme, "Swiss Brutalism").
- WebSocket client for real-time messaging.

**Primary User Flows**
1. **Viral Onboarding**: User enters invite code -> registers -> joins workspace.
2. **Team & AI Chat**: Users message each other or @mention AIs (`@ai`, `@devmanager`) in real-time.
3. **Task Management**: AI suggests tasks, users manage kanban tasks.
4. **Dev OS App Generation**: User requests an app -> `@devmanager` writes code -> Preview renders in an iframe.
5. **Real-time Calls**: Video/Voice calls via LiveKit with live AI transcription.

## 3. Shared Backend API Surface
The mobile app must reuse these existing FastAPI endpoints (Prefix: `REACT_APP_BACKEND_URL` -> `EXPO_PUBLIC_BACKEND_URL`):

**Auth & Launch**
- `GET /api/launch/config` - Fetches gating rules.
- `POST /api/launch/code/redeem` - {code, email, password, name} -> Redeems code & registers.
- `POST /api/auth/login` - {email, password} -> Returns JWT.
- `GET /api/auth/me` - Returns active user and workspaces.

**Chats & Messages**
- `GET /api/chats` - Lists user's chats.
- `GET /api/chats/{chat_id}/messages` - Fetches history.
- `POST /api/chats/{chat_id}/messages` - {text, ...} -> Sends a REST message.
- `WS /api/ws/{chat_id}?token={jwt}` - Real-time WebSocket connection for live messages/typing.

**Tasks & AI**
- `GET /api/tasks` - Lists tasks.
- `POST /api/ai/research` - Submits a multi-model AI query.

**Calls & Dev OS**
- `GET /api/calls/by-chat/{chat_id}` - Fetches call history.
- `POST /api/calls/start` - Initiates LiveKit room.
- `GET /api/dev-projects` - Lists generated software projects.

## 4. Data Models & Integrations
- **MongoDB Models**: `users`, `workspaces`, `chats`, `messages`, `tasks`, `dev_projects`, `calls`.
- **Integrations to adapt**:
  - **LiveKit (WebRTC)**: The web uses `@livekit/components-react`. Mobile must use `@livekit/react-native` and requires specific iOS/Android camera/microphone permissions.
  - **Stripe Connect**: Web uses Stripe Checkout redirection. Mobile may need a `react-native-webview` or native In-App Purchases (IAP) depending on App Store policies for digital goods.
  - **Emergent LLMs / Object Storage**: Handled server-side, no direct mobile change needed.

## 5. Port Requirements (Target Platform: Mobile / Expo)
The Expo mobile app will use `expo-router` and React Native primitives (`View`, `Text`, `StyleSheet`, `TouchableOpacity`).

**Navigation Structure (`mobile/app/`)**
- `(auth)/login.tsx`, `(auth)/signup.tsx`, `(auth)/invite.tsx` -> Native stack for gated entry.
- `(tabs)/_layout.tsx` -> Bottom tab bar mirroring `MobileTabBar.jsx` (Chats, AI, Tasks, Calls, You).

**Screen-by-Screen Porting Requirements:**
1. **Chats List (`(tabs)/chats/index.tsx`)**:
   - Native `FlatList` of conversations.
   - Fetch via `GET /api/chats`.
2. **Chat Room (`(tabs)/chats/[id].tsx`)**:
   - `KeyboardAvoidingView` + `ScrollView` for message bubbles.
   - Standard `WebSocket` API connection to `/api/ws/{chat_id}`.
   - AI mentions (@devmanager) must render correctly natively.
3. **Tasks (`(tabs)/tasks/index.tsx`)**:
   - Native list rendering for active tasks.
4. **Call Room (`(tabs)/calls/[id].tsx`)**:
   - Must migrate to `livekit-react-native`.
   - Requires updating `app.json` with `ios.infoPlist` for `NSCameraUsageDescription` and `NSMicrophoneUsageDescription`.
5. **Dev OS / Live Previews (`(tabs)/chats/dev-preview.tsx`)**:
   - Instead of a complex Monaco IDE, mobile should use `react-native-webview` to render the published `/p/:slug` or `/dev-projects/:id/preview` endpoints so users can *view* their AI-generated apps natively.

**Styling & Platform Notes**:
- Translate Tailwind `bg-[#0a0a0a]` and Shadcn tokens to React Native styles. Use `SafeAreaView` extensively.
- No `div` or `span` — strictly `View` and `Text`.

## 6. Open Questions / Risks
- **Dev OS Scope**: Should the mobile app attempt to port the entire `DevStudio` (File Explorer, Code Editor) or just provide the Chat interface where the AI does the building + a WebView for the result? (Recommendation: WebView for preview, chat for building).
- **Stripe vs App Store**: The web uses Stripe Checkout for the $199 `@devmanager` hire fee. Apple/Google strict guidelines usually require In-App Purchases for digital services consumed in the app. Will we use WebViews and risk rejection, or build native IAPs?
- **LiveKit React Native**: Setting up native WebRTC can be tricky with Expo Go. We may need to configure a custom dev client (`expo prebuild`) for testing camera/audio.