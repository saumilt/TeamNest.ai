import safeStorage from "@/lib/safeStorage";

// Tiny helpers so any button (sidebar, checklist, home) can launch the
// Show Me How walkthroughs or re-open the setup checklist from anywhere.

export function openShowMeHow() {
  window.dispatchEvent(new CustomEvent("tn:show-me-how"));
}

export function openWalkthrough(id) {
  window.dispatchEvent(new CustomEvent("tn:walkthrough", { detail: { id } }));
}

// Persist a flag (survives navigation to a home page where the checklist
// lives) AND fire an event for the same-page case.
export function openSetupChecklist() {
  safeStorage.set("tn:checklist:force", "1");
  window.dispatchEvent(new CustomEvent("tn:open-checklist"));
}
