import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import safeStorage from "@/lib/safeStorage";
import { openSetupChecklist } from "@/lib/showMeHow";

const NUDGED_KEY = "tn:checklist:nudged";
const DISMISS_KEY = "tn:checklist:dismissed";
const DAY = 24 * 60 * 60 * 1000;

/** A day or so after signup, gently remind users with unfinished setup steps
 *  about their checklist — once, non-blocking, only while they're still new. */
export default function ChecklistNudge() {
  const { user } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!user?.created_at) return;
    if (safeStorage.get(NUDGED_KEY) === "1") return;
    if (safeStorage.get(DISMISS_KEY) === "1") return;
    const age = Date.now() - new Date(user.created_at).getTime();
    if (!(age >= DAY && age <= 14 * DAY)) return;

    let cancelled = false;
    api
      .get("/home/checklist")
      .then(({ data }) => {
        if (cancelled || !data || data.complete >= data.total) return;
        safeStorage.set(NUDGED_KEY, "1");
        const remaining = data.total - data.complete;
        toast("Pick up where you left off", {
          description: `You're ${data.complete} of ${data.total} through setting up TeamNest — ${remaining} to go.`,
          duration: 9000,
          action: {
            label: "View",
            onClick: () => {
              openSetupChecklist();
              nav("/dashboard");
            },
          },
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, nav]);

  return null;
}
