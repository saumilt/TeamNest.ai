import { Sparkles, Video, Brain, Bot } from "lucide-react";

/** Short, replayable in-app walkthroughs. 3–6 steps each, plus a deep link. */
export const WALKTHROUGHS = [
  {
    id: "research",
    title: "How to start AI Research",
    blurb: "Ask one AI or compare several — and keep every answer.",
    icon: Sparkles,
    cta: { label: "Open AI Research", to: "/research" },
    steps: [
      { title: "Open AI Research", body: "AI Research lives in the left nav (and on your Home). It's where you ask AI and keep every answer saved." },
      { title: "Ask one model — or many", body: "Type your question, then pick a single model for a fast answer or select several to compare them side-by-side." },
      { title: "Compare & synthesize", body: "See each model's answer next to the others, then let TeamNest merge them into one best answer." },
      { title: "Save & continue later", body: "Every research thread is saved to your project, so you and your team can pick it back up anytime." },
    ],
  },
  {
    id: "meetings",
    title: "How to host a meeting",
    blurb: "Meet, transcribe, summarize, and turn talk into tasks.",
    icon: Video,
    cta: { label: "Go to Meetings", to: "/calls" },
    steps: [
      { title: "Start or schedule", body: "Open Meetings to start an instant call or schedule one for later — everyone joins from web or mobile." },
      { title: "Audio, video & screen-share", body: "Run the call with camera, mic, and screen sharing built in. No extra app to install." },
      { title: "Automatic transcript & summary", body: "TeamNest transcribes the conversation and writes a summary with the key decisions and highlights." },
      { title: "Turn talk into tasks", body: "Action items are extracted automatically — assign them to teammates in one tap." },
    ],
  },
  {
    id: "memory",
    title: "How TeamNest memory works",
    blurb: "Your work is remembered — and stays when people move on.",
    icon: Brain,
    cta: { label: "Open Memory", to: "/ai-memory" },
    steps: [
      { title: "TeamNest remembers", body: "As you chat, research, and decide, TeamNest quietly saves the important facts and decisions." },
      { title: "Ask your memory", body: "Open Memory and ask things like 'what did we decide about pricing?' — answers come with their sources." },
      { title: "Personal vs. team", body: "Keep private notes just for you, or share knowledge with your whole workspace." },
      { title: "It stays when people leave", body: "Role Intelligence preserves a team's know-how even as members change roles or move on." },
    ],
  },
  {
    id: "employees",
    title: "How to build an AI employee",
    blurb: "Reusable AI teammates that work inside your chats.",
    icon: Bot,
    cta: { label: "Hire an AI Employee", to: "/employees" },
    steps: [
      { title: "What's an AI employee?", body: "A reusable AI teammate with a role, instructions, and its own knowledge — it works right inside your chats." },
      { title: "Hire or build one", body: "Pick a ready-made employee from the marketplace, or build your own in a few minutes." },
      { title: "Put it to work", body: "@mention your AI employee in any chat to get specialized help on demand." },
      { title: "Pay per role, not per seat", body: "Add real capability to your team without adding headcount." },
    ],
  },
];

export function getWalkthrough(id) {
  return WALKTHROUGHS.find((w) => w.id === id) || null;
}
