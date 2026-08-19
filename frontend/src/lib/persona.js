// Persona-tailored "top actions" for the Home looks. Persona is captured at
// onboarding (personal | student | team | business | enterprise | other) and
// exposed on the user object. Unknown/other → null (generic defaults).

const CONFIGS = {
  personal: {
    cardOrder: ["docs", "memory", "project", "task", "chat", "knowledge", "employee", "meeting"],
    featureOrder: ["documents", "memory", "tasks", "chat", "knowledge", "employees", "meeting", "invite"],
    chips: [
      "Research a topic in depth",
      "Summarize my uploaded documents",
      "Plan my week",
      "Compare Claude and ChatGPT",
    ],
  },
  student: {
    cardOrder: ["project", "docs", "task", "chat", "memory", "knowledge", "employee", "meeting"],
    featureOrder: ["chat", "invite", "tasks", "documents", "knowledge", "memory", "employees", "meeting"],
    chips: [
      "Research a topic for my assignment",
      "Summarize this reading",
      "Draft a group project plan",
      "Compare answers from two AIs",
    ],
  },
  team: {
    cardOrder: ["chat", "project", "task", "meeting", "memory", "knowledge", "docs", "employee"],
    featureOrder: ["chat", "meeting", "tasks", "knowledge", "documents", "employees", "memory", "invite"],
    chips: [
      "Turn our meeting into tasks",
      "Draft a project plan",
      "Summarize this thread",
      "Research a competitor",
    ],
  },
  business: {
    cardOrder: ["chat", "meeting", "project", "knowledge", "docs", "task", "employee", "memory"],
    featureOrder: ["chat", "meeting", "knowledge", "tasks", "documents", "employees", "memory", "invite"],
    chips: [
      "Compare three competitors",
      "Host a meeting and summarize it",
      "Draft a client proposal",
      "Summarize our documents",
    ],
  },
  enterprise: {
    cardOrder: ["chat", "meeting", "knowledge", "project", "docs", "task", "employee", "memory"],
    featureOrder: ["chat", "meeting", "knowledge", "role", "people", "documents", "employees", "memory"],
    chips: [
      "Compare vendors for procurement",
      "What did we decide last quarter?",
      "Summarize our policy documents",
      "Draft an approval summary",
    ],
  },
};

export function personaConfig(persona) {
  return CONFIGS[persona] || null;
}
