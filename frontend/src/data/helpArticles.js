/**
 * Help Center content. Each article is searchable by title, category, keywords
 * and body. Keep entries concise and task-oriented.
 */
export const HELP_CATEGORIES = [
  "Getting Started",
  "Chats & Messaging",
  "AI & Intelligence",
  "Workspaces & Teams",
  "Plans & Billing",
  "Credit Limits",
  "Calls & Transcription",
  "Dev OS",
  "AI Employees",
  "Memory & Role Intelligence",
  "Connectors",
  "Admin & Security",
];

export const HELP_ARTICLES = [
  {
    id: "what-is-teamnest",
    category: "Getting Started",
    title: "What is TeamNest?",
    keywords: ["overview", "intro", "about", "start"],
    body: [
      "TeamNest is an AI-native, WhatsApp-style team communication and research platform. You chat with teammates and with AI in the same threads.",
      "Beyond messaging, it includes an AI Employee Builder + Marketplace, a Dev OS for building software with AI, auto-learning memory, and Role Intelligence that captures approved company knowledge.",
    ],
  },
  {
    id: "first-steps",
    category: "Getting Started",
    title: "Your first 5 minutes",
    keywords: ["setup", "begin", "onboarding", "new"],
    body: [
      "1. Open Chats and start a direct message or a group.",
      "2. Type @ai in any chat to ask a question — the AI answers inline for everyone to see.",
      "3. Invite teammates from the workspace members screen.",
      "4. Visit Billing to pick a plan that matches your AI usage.",
    ],
  },
  {
    id: "start-a-chat",
    category: "Chats & Messaging",
    title: "Starting chats & groups",
    keywords: ["direct message", "dm", "group", "new chat", "conversation"],
    body: [
      "Use the New Chat button to start a direct message or create a group. Groups can have many members.",
      "Use the filter chips (All, Direct, Groups, AI, Unread) at the top of the chat list to quickly narrow what you see. Search finds people and conversations by name.",
    ],
  },
  {
    id: "ask-ai-inline",
    category: "AI & Intelligence",
    title: "Asking AI in a chat (@ai)",
    keywords: ["@ai", "ask ai", "inline ai", "assistant"],
    body: [
      "Type @ai followed by your question in any chat. The AI reply appears inline so the whole group sees it.",
      "AI usage draws from your workspace's monthly credit pool. Heavier / premium models cost more credits per answer.",
    ],
  },
  {
    id: "ai-conversation-mode",
    category: "AI & Intelligence",
    title: "AI Conversation Mode",
    keywords: ["continuous", "thread", "follow up", "no @ai", "back and forth"],
    body: [
      "Conversation Mode lets you have a natural back-and-forth with AI without typing @ai every time. Once a thread is active, follow-up messages are routed to the AI automatically.",
      "You (and admins) can tune sensitivity in AI settings, including a live threshold preview. The mode also extends to deployed AI Employees.",
    ],
  },
  {
    id: "multi-model-comparison",
    category: "AI & Intelligence",
    title: "Comparing AI models side-by-side",
    keywords: ["compare", "models", "gpt", "claude", "gemini", "side by side"],
    body: [
      "Multi-model comparison asks the same question to several AI models at once and shows the answers side-by-side so you can pick the best one.",
      "This feature is available on the Student, Pro, and Team plans (paid). Free plan users are prompted to upgrade.",
    ],
  },
  {
    id: "save-to-role-intelligence",
    category: "Memory & Role Intelligence",
    title: "Save to Role Intelligence",
    keywords: ["role", "capture", "knowledge", "save insight"],
    body: [
      "From a chat you can push an important answer or decision into Role Intelligence — the workspace's captured, approved knowledge tied to roles and successors.",
      "This keeps institutional knowledge inside the workspace and available to the right people, without leaking across workspaces.",
    ],
  },
  {
    id: "auto-learning-memory",
    category: "Memory & Role Intelligence",
    title: "Auto-learning memory",
    keywords: ["memory", "learns", "context", "remembers"],
    body: [
      "TeamNest builds a memory of relevant context so the AI gives more tailored answers over time. You can peek at what memory is being used from the composer.",
      "Memory is scoped per workspace, so different teams/clients never share memory.",
    ],
  },
  {
    id: "workspaces-explained",
    category: "Workspaces & Teams",
    title: "What is a workspace?",
    keywords: ["workspace", "team", "organization", "org", "separate"],
    body: [
      "A workspace is the container for one team or organization. Its members, chats, billing/plan, AI credits, memory, connectors and projects are all scoped to it.",
      "You can belong to multiple workspaces (e.g. your company + a personal one) and switch between them. Data never bleeds across workspaces.",
    ],
  },
  {
    id: "create-workspace",
    category: "Workspaces & Teams",
    title: "Creating your own workspace",
    keywords: ["new workspace", "add workspace", "create", "multiple"],
    body: [
      "Open the Workspace selector at the top of the chat list (between search and the filters) and choose 'New workspace'.",
      "Creating a workspace is free — it starts on the Free plan. During creation you pick a plan; if you choose a paid plan you'll be taken to checkout for that new workspace. You become the owner of any workspace you create.",
      "Only the creator (owner) of a workspace can rename it.",
    ],
  },
  {
    id: "switch-workspace",
    category: "Workspaces & Teams",
    title: "Switching workspaces",
    keywords: ["switch", "change workspace", "selector"],
    body: [
      "Use the Workspace selector to jump between workspaces you own or have been invited to. The chat list, AI, memory and billing all instantly reflect the active workspace.",
    ],
  },
  {
    id: "invite-teammates",
    category: "Workspaces & Teams",
    title: "Inviting teammates",
    keywords: ["invite", "add member", "collaborator", "team"],
    body: [
      "Owners/admins can invite people to a workspace by email. Invited users join as members and can also have their own separate personal workspace.",
      "On the Student plan, invited classmates can chat and collaborate but only the account owner can use AI (a single, solo AI seat).",
    ],
  },
  {
    id: "plans-overview",
    category: "Plans & Billing",
    title: "Plans overview",
    keywords: ["pricing", "plan", "free", "pro", "team", "enterprise", "student"],
    body: [
      "Free: for trying it out (limited monthly credits).",
      "Student ($6.99/mo): 2,500 credits, all AI models + comparison, solo AI seat, requires .edu verification.",
      "Pro ($9.99/seat/mo): per-seat, calls with transcription, 3,000 credits/seat.",
      "Team ($19.99/seat/mo): live transcription free, unlimited recordings, 9,000 credits/seat.",
      "Enterprise: SSO, bring-your-own-keys, unlimited credits, custom pricing.",
    ],
  },
  {
    id: "student-plan",
    category: "Plans & Billing",
    title: "Student plan & .edu verification",
    keywords: ["student", "edu", "verify", "6.99", "discount"],
    body: [
      "The Student plan is $6.99/mo (or $69/yr) and is built for collaborating with classmates and comparing AI models on a student budget.",
      "To subscribe, verify a valid .edu email: you receive a 6-digit code by email and enter it. Your AI seat is solo — classmates you invite can chat but can't use AI.",
    ],
  },
  {
    id: "billing-checkout",
    category: "Plans & Billing",
    title: "Upgrading & checkout",
    keywords: ["upgrade", "checkout", "pay", "subscribe", "stripe"],
    body: [
      "Go to Billing, pick a plan, and complete secure checkout. Monthly and annual billing are supported (annual saves ~17%).",
      "Each workspace has its own plan and credit pool, so you can run one workspace on Free and another on a paid plan.",
    ],
  },
  {
    id: "credits-explained",
    category: "Credit Limits",
    title: "How AI credits work",
    keywords: ["credits", "usage", "cost", "consumption"],
    body: [
      "Every AI action (inline @ai, research, comparison, Dev OS builds, call transcription) consumes credits from your workspace's monthly pool. Premium models cost more.",
      "Credits reset at the start of each billing period. Unlimited (Enterprise) workspaces don't decrement.",
    ],
  },
  {
    id: "credit-governance",
    category: "Credit Limits",
    title: "Credit limits & governance",
    keywords: ["cap", "limit", "governance", "budget", "control", "quota"],
    body: [
      "Workspace admins can set hard AI credit caps at four scopes: per user, per chat, per workspace, and enterprise-wide.",
      "Enforcement is most-restrictive-wins: a request is blocked if it would exceed ANY applicable cap. Caps reset each billing month.",
      "When a cap is hit, the user sees a clear 'AI credit limit reached' message with a link to manage limits. Admins get alerts at 80% and 100% usage.",
      "Manage caps on the Billing page under 'AI credit limits'.",
    ],
  },
  {
    id: "calls-transcription",
    category: "Calls & Transcription",
    title: "Calls & transcription",
    keywords: ["call", "video", "audio", "transcribe", "recording", "summary"],
    body: [
      "Start audio or video calls from a chat. Recordings can be transcribed, and you get AI post-call summaries.",
      "Live transcription is included free on Team; Pro includes post-call transcription. Transcription consumes credits and is subject to credit limits.",
    ],
  },
  {
    id: "dev-os",
    category: "Dev OS",
    title: "Dev OS — build software with AI",
    keywords: ["dev os", "build", "app", "code", "project", "developer"],
    body: [
      "Dev OS lets you describe a product and have AI generate a plan and build it. Use 'Talk to build' to iterate with natural instructions.",
      "Builds and plans consume credits and respect your workspace's credit caps. Some builds require hiring @devmanager first.",
    ],
  },
  {
    id: "ai-employees",
    category: "AI Employees",
    title: "AI Employee Builder & Marketplace",
    keywords: ["ai employee", "agent", "builder", "marketplace", "install"],
    body: [
      "Build custom AI Employees with specific skills and personas, or install ready-made ones from the Marketplace.",
      "Deployed AI Employees can participate in conversations and even auto-continue threads in Conversation Mode.",
    ],
  },
  {
    id: "connectors",
    category: "Connectors",
    title: "Connectors (Gmail, Microsoft 365)",
    keywords: ["connector", "gmail", "m365", "microsoft", "integration", "email"],
    body: [
      "Connect Gmail or Microsoft 365 so AI can work with your live data. Connecting requires authorizing access with your account.",
      "Some connectors (e.g. Slack, CRM) may be in preview. Connectors are configured per workspace.",
    ],
  },
  {
    id: "password-reset",
    category: "Admin & Security",
    title: "Resetting your password",
    keywords: ["password", "forgot", "reset", "login", "sign in"],
    body: [
      "On the login screen use 'Forgot password' to receive a secure, 1-hour reset link by email. If it doesn't arrive, check spam.",
      "When typing a password anywhere in the app, use the eye icon to reveal what you've typed.",
      "Admins can also reset a user's password from Super Admin → Users → (select user) → Reset password, and email the new credentials.",
    ],
  },
  {
    id: "admin-user-management",
    category: "Admin & Security",
    title: "Managing users (Super Admin)",
    keywords: ["admin", "users", "edit", "suspend", "role", "super admin", "email"],
    body: [
      "Super Admins can open any user to view full details and edit their name, email (login ID), role, and status.",
      "You can suspend/reactivate accounts, grant/revoke super-admin, delete users, reset passwords, and generate a reset link — all from the Users tab.",
    ],
  },
  {
    id: "roles-permissions",
    category: "Admin & Security",
    title: "Roles & permissions",
    keywords: ["role", "owner", "admin", "member", "permission"],
    body: [
      "Owner: full control, created the workspace, can rename it. Admin: manage members and settings. Member: participate in chats and AI.",
      "Only the workspace creator (owner) can rename the workspace.",
    ],
  },
];
