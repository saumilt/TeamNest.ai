import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BellOff, Bell, Moon, ArrowLeft, VolumeX } from "lucide-react";
import { toast } from "sonner";

const DND_DURATIONS = [
  { value: "off", label: "Off" },
  { value: "1h", label: "1 hour" },
  { value: "8h", label: "8 hours" },
  { value: "24h", label: "1 day" },
  { value: "1week", label: "1 week" },
];

export default function NotificationsPrefs() {
  const nav = useNavigate();
  const [prefs, setPrefs] = useState(null);
  const [dndDuration, setDndDuration] = useState("off");

  useEffect(() => {
    api.get("/notifications/prefs").then(({ data }) => {
      setPrefs(data);
      // Derive currently-selected DND duration from remaining time
      if (data.dnd_until) {
        const remainingMs = new Date(data.dnd_until).getTime() - Date.now();
        const remainingH = remainingMs / 3_600_000;
        if (remainingH <= 0) setDndDuration("off");
        else if (remainingH <= 1) setDndDuration("1h");
        else if (remainingH <= 8) setDndDuration("8h");
        else if (remainingH <= 24) setDndDuration("24h");
        else setDndDuration("1week");
      } else {
        setDndDuration("off");
      }
    });
  }, []);

  const patch = async (partial) => {
    try {
      const { data } = await api.patch("/notifications/prefs", partial);
      setPrefs(data);
      toast.success("Saved");
    } catch {
      toast.error("Save failed");
    }
  };

  const setDnd = async (duration) => {
    setDndDuration(duration);
    try {
      const { data } = await api.post(`/notifications/dnd?duration=${duration}`);
      setPrefs((p) => ({ ...p, dnd_until: data.dnd_until }));
      toast.success(duration === "off" ? "DND disabled" : `Muted everything for ${duration}`);
    } catch {
      toast.error("DND toggle failed");
    }
  };

  if (!prefs) {
    return <div className="p-6 text-zinc-500">Loading…</div>;
  }

  const dndActive = !!prefs.dnd_until;
  const mutedChatCount = Object.keys(prefs.mute_chats || {}).length;

  return (
    <div className="min-h-[100dvh] bg-bg text-zinc-100 px-4 sm:px-8 py-6 max-w-2xl mx-auto" data-testid="notif-prefs-page">
      <button onClick={() => nav(-1)} className="text-zinc-400 hover:text-white text-sm mb-4 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2 mb-1">
        <Bell className="w-7 h-7 text-yellow-400" />
        Notifications
      </h1>
      <p className="text-sm text-zinc-400 mb-8">Control when and how TeamNest pings you.</p>

      {/* Do Not Disturb */}
      <Section title="Do Not Disturb" icon={Moon}>
        <Row label="Mute all notifications">
          <Select value={dndDuration} onValueChange={setDnd}>
            <SelectTrigger className="bg-[#0a0a0a] border-white/10 rounded-sm h-9 w-32" data-testid="dnd-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a0a] border-white/10">
              {DND_DURATIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        {dndActive && (
          <div className="text-xs text-zinc-500 mt-2" data-testid="dnd-status">
            Currently muted until {new Date(prefs.dnd_until).toLocaleString()}
          </div>
        )}
      </Section>

      {/* Mute scopes */}
      <Section title="Mute by type" icon={VolumeX}>
        <ToggleRow
          label="Mute all group chats"
          checked={!!prefs.mute_groups}
          onChange={(v) => patch({ mute_groups: v })}
          testid="mute-groups"
        />
        <ToggleRow
          label="Mute all direct messages"
          checked={!!prefs.mute_dms}
          onChange={(v) => patch({ mute_dms: v })}
          testid="mute-dms"
        />
        <ToggleRow
          label="Mute AI answers"
          checked={!!prefs.mute_ai_answers}
          onChange={(v) => patch({ mute_ai_answers: v })}
          testid="mute-ai"
        />
      </Section>

      {/* Email digest */}
      <Section title="Email digest" icon={Bell}>
        <Row label="Frequency">
          <Select value={prefs.email_digest || "daily"} onValueChange={(v) => patch({ email_digest: v })}>
            <SelectTrigger className="bg-[#0a0a0a] border-white/10 rounded-sm h-9 w-32" data-testid="email-digest">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a0a] border-white/10">
              <SelectItem value="off">Off</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Section>

      {/* Muted chats list */}
      <Section title={`Muted chats${mutedChatCount > 0 ? ` (${mutedChatCount})` : ""}`} icon={BellOff}>
        {mutedChatCount === 0 ? (
          <div className="text-sm text-zinc-500">
            No chats muted. Open any chat → its header menu → &quot;Mute&quot; to silence it.
          </div>
        ) : (
          <div className="space-y-2" data-testid="muted-chats-list">
            {Object.entries(prefs.mute_chats).map(([chatId, until]) => (
              <MutedChatRow key={chatId} chatId={chatId} until={until} onUnmute={async () => {
                await api.post(`/notifications/unmute-chat/${chatId}`);
                const { data } = await api.get("/notifications/prefs");
                setPrefs(data);
                toast.success("Unmuted");
              }} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <section className="mb-6 border border-white/10 rounded-sm p-4 bg-white/[0.02]">
      <h2 className="text-sm font-mono uppercase tracking-widest text-zinc-300 mb-3 flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-yellow-400" />{title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="text-sm text-zinc-200">{label}</div>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange, testid }) {
  return (
    <Row label={label}>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testid} />
    </Row>
  );
}

function MutedChatRow({ chatId, until, onUnmute }) {
  const display = until === "forever" ? "forever" : `until ${new Date(until).toLocaleString()}`;
  return (
    <div className="flex items-center justify-between border border-white/10 rounded-sm px-3 py-2">
      <div className="text-xs text-zinc-300 truncate">{chatId.slice(0, 12)}… <span className="text-zinc-500">muted {display}</span></div>
      <Button size="sm" variant="outline" onClick={onUnmute} className="border-white/10 hover:bg-white/5 rounded-sm h-7 text-xs" data-testid={`unmute-${chatId}`}>
        Unmute
      </Button>
    </div>
  );
}
