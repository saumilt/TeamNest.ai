import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";

/**
 * MyAI: redirects to the user's personal_ai chat. If opened with ?ask=<text>,
 * it prefills that chat's composer with an @ai prompt (?ask&mode=compare asks
 * all models) — used by the prompt-first Home looks.
 */
export default function MyAI() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [err, setErr] = useState(null);

  useEffect(() => {
    api
      .get("/chats")
      .then(({ data }) => {
        const personal = data.find((c) => c.type === "personal_ai");
        if (!personal) {
          setErr("Personal AI chat not found.");
          return;
        }
        const ask = params.get("ask");
        if (ask) {
          const prefix = params.get("mode") === "compare" ? "@ai ask all " : "@ai ";
          nav(`/chats/${personal.id}?compose=${encodeURIComponent(prefix + ask)}`, { replace: true });
        } else {
          nav(`/chats/${personal.id}`, { replace: true });
        }
      })
      .catch(() => setErr("Couldn't open your AI assistant. Please try again."));
  }, [nav, params]);

  return (
    <div className="p-10">
      <div className="label-mono">{err || "Opening your personal AI assistant…"}</div>
    </div>
  );
}
