import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/**
 * MyAI page: redirects user to their personal_ai chat.
 */
export default function MyAI() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get("/chats").then(({ data }) => {
      const personal = data.find((c) => c.type === "personal_ai");
      if (personal) nav(`/chats/${personal.id}`, { replace: true });
      else setErr("Personal AI chat not found.");
    });
  }, [nav]);

  return (
    <div className="p-10">
      <div className="label-mono">{err || "Opening your personal AI assistant…"}</div>
    </div>
  );
}
