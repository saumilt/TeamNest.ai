import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MessageSquareText, Upload, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/**
 * 3-step WhatsApp import wizard:
 *   1) Upload .txt → server parses → preview
 *   2) Map participants (WhatsApp name → TeamNest user) + pick destination chat
 *   3) Commit + show summary
 */
export default function ImportWhatsApp() {
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [members, setMembers] = useState([]);
  const [chats, setChats] = useState([]);
  const [participantMap, setParticipantMap] = useState({});
  const [destinationChatId, setDestinationChatId] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get("/workspace/members").then(({ data }) => setMembers(data.members || data || [])).catch(() => setMembers([]));
    api.get("/chats").then(({ data }) => setChats(data || [])).catch(() => setChats([]));
  }, []);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith(".txt")) {
      toast.error("Please upload the .txt export from WhatsApp");
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const { data } = await api.post("/imports/whatsapp/preview", fd);
      setPreview(data);
      // Auto-init participant map
      const map = {};
      for (const p of data.participants) map[p.name] = "";
      setParticipantMap(map);
      setStep(2);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Parse failed");
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!destinationChatId) return toast.error("Pick a destination chat");
    setBusy(true);
    try {
      const { data } = await api.post("/imports/whatsapp/commit", {
        chat_id: destinationChatId,
        participant_map: participantMap,
        raw_text: preview.raw_text,
        skip_media_placeholders: true,
      });
      setResult(data);
      setStep(3);
      toast.success(`Imported ${data.imported} messages`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-bg text-zinc-100 px-4 sm:px-8 py-6 max-w-3xl mx-auto" data-testid="import-whatsapp-page">
      <button onClick={() => nav(-1)} className="text-zinc-400 hover:text-white text-sm mb-4 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2 mb-1">
        <MessageSquareText className="w-7 h-7 text-emerald-400" />
        Import from WhatsApp
      </h1>
      <p className="text-sm text-zinc-400 mb-6">
        Settings → Chat → Export chat → <strong>Without media</strong> on your phone. Upload the resulting <code className="text-emerald-300">.txt</code> here.
      </p>

      <div className="flex items-center gap-2 mb-6 text-[11px] font-mono uppercase tracking-widest">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`px-2.5 py-1 rounded-sm border ${step === s ? "border-emerald-400 bg-emerald-500/15 text-emerald-200" : step > s ? "border-emerald-400/40 text-emerald-300" : "border-white/10 text-zinc-500"}`}>
            {s}. {s === 1 ? "Upload" : s === 2 ? "Map" : "Done"}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="border border-dashed border-white/10 rounded-sm p-8 text-center bg-white/[0.02]" data-testid="import-upload-zone">
          <Upload className="w-10 h-10 mx-auto text-zinc-500 mb-4" />
          <input ref={fileRef} type="file" accept=".txt" onChange={onFile} className="hidden" data-testid="import-file-input" />
          <Button onClick={() => fileRef.current?.click()} disabled={busy} data-testid="import-pick-file" className="bg-emerald-500 text-black hover:bg-emerald-400 rounded-sm">
            {busy ? "Parsing…" : "Pick .txt file"}
          </Button>
          <div className="text-xs text-zinc-500 mt-4">Max 5MB. Only the .txt export is needed — media is referenced as placeholders.</div>
        </div>
      )}

      {step === 2 && preview && (
        <div className="space-y-5" data-testid="import-map-step">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <Stat label="Messages" value={preview.message_count} />
            <Stat label="Participants" value={preview.participants.length} />
            <Stat label="Media" value={preview.media_placeholders} />
            <Stat label="Date range" value={preview.date_range ? `${preview.date_range.from.slice(5)} → ${preview.date_range.to.slice(5)}` : "—"} small />
          </div>

          <div>
            <div className="label-mono mb-2">DESTINATION CHAT</div>
            <Select value={destinationChatId} onValueChange={setDestinationChatId}>
              <SelectTrigger className="bg-[#0a0a0a] border-white/10 rounded-sm h-10" data-testid="import-destination-chat">
                <SelectValue placeholder="Pick a chat to import into" />
              </SelectTrigger>
              <SelectContent className="bg-[#0a0a0a] border-white/10 max-h-[300px]">
                {chats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.type === "group" ? "👥 " : "💬 "}{c.name || c.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="label-mono mb-2">MAP PARTICIPANTS (LEAVE BLANK FOR SYSTEM)</div>
            <div className="space-y-2">
              {preview.participants.map((p) => (
                <div key={p.name} className="flex items-center gap-3" data-testid={`import-map-row-${p.name}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{p.name}</div>
                    <div className="text-[10px] font-mono text-zinc-500">{p.message_count} messages</div>
                  </div>
                  <Select value={participantMap[p.name] || ""} onValueChange={(v) => setParticipantMap((m) => ({ ...m, [p.name]: v }))}>
                    <SelectTrigger className="bg-[#0a0a0a] border-white/10 rounded-sm h-9 w-56">
                      <SelectValue placeholder="System / unmapped" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0a0a0a] border-white/10">
                      <SelectItem value="">— System / unmapped —</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name} ({m.email})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {preview.preview?.length > 0 && (
            <div>
              <div className="label-mono mb-2">PREVIEW (FIRST 5)</div>
              <div className="space-y-1.5 bg-[#0a0a0a] border border-white/10 rounded-sm p-3">
                {preview.preview.slice(0, 5).map((m, i) => (
                  <div key={`${m.timestamp}-${i}`} className="text-xs">
                    <span className="text-zinc-500">{m.timestamp.slice(5, 16)} </span>
                    <span className="text-white font-medium">{m.sender}:</span>{" "}
                    <span className="text-zinc-300">{m.text.slice(0, 200)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStep(1)} className="border-white/10 hover:bg-white/5 rounded-sm">Back</Button>
            <Button data-testid="import-commit-btn" onClick={commit} disabled={busy || !destinationChatId} className="bg-emerald-500 hover:bg-emerald-400 text-black rounded-sm">
              {busy ? "Importing…" : `Import ${preview.message_count - preview.media_placeholders} messages`}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="border border-emerald-400/30 bg-emerald-500/10 rounded-sm p-6 text-center" data-testid="import-success">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <div className="text-xl font-semibold text-white mb-1">Imported {result.imported} messages</div>
          <div className="text-sm text-zinc-300">
            into <span className="text-emerald-300 font-medium">{result.destination_chat_name || "chat"}</span>
            {result.skipped_media > 0 && (
              <span className="text-zinc-400"> · {result.skipped_media} media placeholders skipped</span>
            )}
          </div>
          <div className="flex justify-center gap-2 mt-5">
            <Button onClick={() => nav(`/chats/${result.destination_chat_id}`)} className="bg-emerald-500 text-black hover:bg-emerald-400 rounded-sm">
              Open chat
            </Button>
            <Button variant="outline" onClick={() => { setStep(1); setPreview(null); setResult(null); }} className="border-white/10 hover:bg-white/5 rounded-sm">
              Import another
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8 text-xs text-zinc-500 flex items-start gap-2">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div>
          Imported messages preserve original timestamps and sender names. Unmapped senders show as system notes with the original WhatsApp name. Imported text auto-feeds Phase 4 memory on the next search.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, small }) {
  return (
    <div className="border border-white/10 rounded-sm p-3">
      <div className={`font-semibold text-white ${small ? "text-sm" : "text-xl"}`}>{value}</div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}
