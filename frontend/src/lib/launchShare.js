// Prewritten viral share copy + platform share URL builders.
const APP_URL = "https://teamnest.ai";

export const abs = (path) => (path?.startsWith("http") ? path : `${window.location.origin}${path}`);

export function shareMessages(link) {
  return {
    linkedin: `I joined the private beta for TeamNest.ai — an AI workspace where teams can chat, hire AI employees, and build software with @devmanager. Join the waitlist here: ${link}`,
    x: `Just joined TeamNest.ai private beta. Build software inside team chat with @devmanager. Invite-only access: ${link}`,
    whatsapp: `I got access to TeamNest.ai private beta. It lets teams chat, use AI employees, and build apps with @devmanager. Use my invite: ${link}`,
    emailSubject: "Invite to TeamNest.ai Private Beta",
    emailBody: `I wanted to invite you to TeamNest.ai private beta. It is an AI workspace where teams can collaborate, use AI employees, and build software directly inside chat.\n\n${link}`,
  };
}

export function shareLinks(link, buildAnswer) {
  const m = shareMessages(link);
  const text = buildAnswer ? `I joined TeamNest.ai to build: ${buildAnswer}. ${link}` : null;
  return [
    { key: "whatsapp", label: "WhatsApp", url: `https://wa.me/?text=${encodeURIComponent(text || m.whatsapp)}` },
    { key: "x", label: "X / Twitter", url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text || m.x)}` },
    { key: "linkedin", label: "LinkedIn", url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}` },
    { key: "email", label: "Email", url: `mailto:?subject=${encodeURIComponent(m.emailSubject)}&body=${encodeURIComponent(m.emailBody)}` },
    { key: "sms", label: "SMS", url: `sms:?&body=${encodeURIComponent(text || m.whatsapp)}` },
  ];
}

export const INTEREST_AREAS = [
  { key: "devos", label: "Dev OS / build software with @devmanager" },
  { key: "ai_employees", label: "AI employees" },
  { key: "team_collab", label: "Team collaboration" },
  { key: "restaurant", label: "Restaurant operations" },
  { key: "agency", label: "Agency / client collaboration" },
  { key: "healthcare", label: "Healthcare workflows" },
  { key: "real_estate", label: "Real estate / investor workflows" },
  { key: "general", label: "General business workspace" },
];

export const BUILD_IDEAS = [
  "Restaurant operations dashboard", "Investor portal", "Franchise CRM",
  "AI employee marketplace", "Healthcare admin portal", "Real estate project tracker",
  "Media sales CRM", "QuickBooks reconciliation dashboard",
];

export const COMPANY_SIZES = ["Just me", "2-10", "11-50", "51-200", "200+"];
export { APP_URL };
