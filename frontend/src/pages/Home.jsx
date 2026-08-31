import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Dashboard from "@/pages/Dashboard";
import StartCenterHome from "@/pages/StartCenterHome";
import AskHome from "@/pages/AskHome";
import FocusHome from "@/pages/FocusHome";
import HomeLayoutOnboarding from "@/components/HomeLayoutOnboarding";
import { getHomeVariant } from "@/lib/homeVariant";

/** /dashboard — renders one of four Home looks (classic dashboard, Start
 *  Center, ChatGPT-style Ask, or Claude-style Focus). The layout switcher now
 *  lives globally in the top bar (see AppShell), so pages take no layout props. */
export default function Home() {
  const { user } = useAuth();
  const [variant, setVariant] = useState(() => getHomeVariant(user));

  // Live-update when the layout is changed anywhere (switcher / first-run picker).
  useEffect(() => {
    const onChange = (e) => { if (e?.detail) setVariant(e.detail); };
    window.addEventListener("tn:home-variant", onChange);
    return () => window.removeEventListener("tn:home-variant", onChange);
  }, []);

  let page;
  if (variant === "ask") page = <AskHome />;
  else if (variant === "focus") page = <FocusHome />;
  else if (variant === "start") page = <StartCenterHome />;
  else page = <Dashboard />;

  return (
    <>
      {page}
      <HomeLayoutOnboarding />
    </>
  );
}
