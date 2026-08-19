import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Dashboard from "@/pages/Dashboard";
import StartCenterHome from "@/pages/StartCenterHome";
import AskHome from "@/pages/AskHome";
import FocusHome from "@/pages/FocusHome";
import { getHomeVariant, setHomeVariant } from "@/lib/homeVariant";

/** /dashboard — renders one of four Home looks (classic dashboard, Start
 *  Center, ChatGPT-style Ask, or Claude-style Focus) with a live look switcher. */
export default function Home() {
  const { user } = useAuth();
  const [variant, setVariant] = useState(() => getHomeVariant(user));

  const onChangeLook = (v) => {
    setHomeVariant(v);
    setVariant(v);
  };

  const props = { variant, onChangeLook };
  if (variant === "ask") return <AskHome {...props} />;
  if (variant === "focus") return <FocusHome {...props} />;
  if (variant === "start") return <StartCenterHome {...props} />;
  return <Dashboard {...props} />;
}
