import { useAuth } from "@/context/AuthContext";
import HomeLookSwitcher from "@/components/HomeLookSwitcher";
import IntelligenceBanner from "@/components/IntelligenceBanner";
import PersonaNudge from "@/components/PersonaNudge";
import SetupChecklist from "@/components/SetupChecklist";
import HomeComposer from "@/components/HomeComposer";
import FeatureShortcuts from "@/components/FeatureShortcuts";
import { personaConfig } from "@/lib/persona";

const CHIPS = [
  "Compare three competitors",
  "Research a topic in depth",
  "Summarize my uploaded documents",
  "Draft a project plan",
];

/** "Ask AI" Home — ChatGPT-style prompt-first landing. One big composer, a
 *  few example prompts, then every feature one tap away. */
export default function AskHome({ variant, onChangeLook }) {
  const { user } = useAuth();
  const first = user?.name?.split(" ")[0];
  const cfg = personaConfig(user?.persona);

  return (
    <div className="p-6 lg:p-10 max-w-[1000px] mx-auto w-full" data-testid="home-ask">
      <div className="flex justify-end mb-5">
        <HomeLookSwitcher current={variant} onChange={onChangeLook} />
      </div>

      <IntelligenceBanner />
      <PersonaNudge />
      <SetupChecklist />

      <div className="pt-8 pb-10 text-center">
        <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight mb-6">
          What can I help with{first ? `, ${first}` : ""}?
        </h1>
        <div className="max-w-2xl mx-auto text-left">
          <HomeComposer chips={cfg?.chips || CHIPS} />
        </div>
      </div>

      <div className="mt-4">
        <div className="label-mono mb-3">OR JUMP INTO</div>
        <FeatureShortcuts order={cfg?.featureOrder} />
      </div>
    </div>
  );
}
