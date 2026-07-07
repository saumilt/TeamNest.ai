import { useCallback, useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { api, API } from "@/lib/api";
import MeetingExportButtons from "@/components/meeting/MeetingExportButtons";
import MeetingMetadataBar from "@/components/meeting/MeetingMetadataBar";
import MeetingHighlightsBar from "@/components/meeting/MeetingHighlightsBar";
import MeetingSummaryTab from "@/components/meeting/MeetingSummaryTab";
import MeetingTranscriptTab from "@/components/meeting/MeetingTranscriptTab";
import SuggestTasksDialog from "@/components/SuggestTasksDialog";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

/** Strip every HTML tag/attr — defence-in-depth even though our renderer is
 *  JSX-only. LLM-generated summaries may contain HTML-shaped text. */
function sanitizeForDisplay(text) {
  if (!text) return text;
  return DOMPurify.sanitize(String(text), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

export default function MeetingSummaryDialog({ open, onOpenChange, callId }) {
  const [call, setCall] = useState(null);
  const [busy, setBusy] = useState(null);
  const [tab, setTab] = useState("summary");
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [taskSourceText, setTaskSourceText] = useState("");
  const [highlights, setHighlights] = useState([]);
  const [generatingHighlights, setGeneratingHighlights] = useState(false);

  const load = useCallback(async () => {
    try {
      const [callRes, hlRes] = await Promise.all([
        api.get(`/calls/${callId}`),
        api.get(`/calls/${callId}/highlights`).catch(() => ({ data: { highlights: [] } })),
      ]);
      setCall(callRes.data);
      setTranscriptDraft(callRes.data?.transcript?.text || "");
      setSummaryDraft(callRes.data?.summary?.markdown || "");
      setHighlights(hlRes.data?.highlights || []);
    } catch (e) {
      console.warn("[meeting-summary] load", e);
    }
  }, [callId]);

  useEffect(() => { if (open && callId) load(); }, [open, callId, load]);

  // Derived values memoised BEFORE the early-return so React Hook order stays
  // stable across renders.
  const summaryMd = useMemo(
    () => sanitizeForDisplay(call?.summary?.markdown || ""),
    [call?.summary?.markdown],
  );
  const transcriptText = useMemo(
    () => sanitizeForDisplay(call?.transcript?.text || ""),
    [call?.transcript?.text],
  );
  const taskSourceMessage = useMemo(
    () => ({
      id: callId,
      body:
        taskSourceText ||
        summaryMd ||
        transcriptText ||
        `Meeting on ${call ? new Date(call.started_at).toLocaleString() : ""}`,
    }),
    [callId, taskSourceText, summaryMd, transcriptText, call],
  );

  if (!call) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-[#0a0a0a] border-white/10 rounded-sm max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">Meeting Notes</DialogTitle>
            <DialogDescription className="sr-only">Loading meeting details…</DialogDescription>
          </DialogHeader>
          <div className="h-48 shimmer rounded-sm" />
        </DialogContent>
      </Dialog>
    );
  }

  const generate = async (regenerate = false) => {
    setBusy(regenerate ? "regen" : "gen");
    try {
      const { data } = await api.post(`/calls/${callId}/summary`, { regenerate });
      toast.success(data.cached ? "Loaded cached summary" : "Summary generated");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Generate failed");
    } finally { setBusy(null); }
  };

  const saveSummary = async () => {
    setBusy("save-summary");
    try {
      await api.patch(`/calls/${callId}/summary`, { markdown: summaryDraft });
      toast.success("Summary saved");
      setEditingSummary(false);
      await load();
    } catch (e) {
      toast.error("Save failed");
    } finally { setBusy(null); }
  };

  const saveTranscript = async () => {
    setBusy("save-transcript");
    try {
      await api.patch(`/calls/${callId}/transcript`, { transcript_text: transcriptDraft });
      toast.success("Transcript saved");
      setEditingTranscript(false);
      await load();
    } catch (e) {
      toast.error("Save failed");
    } finally { setBusy(null); }
  };

  const uploadRecording = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post(`/calls/${callId}/upload-recording`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const len = (data?.transcript?.text || "").length;
      toast.success(`Recording uploaded & transcribed (${len} chars)`);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally { setBusy(null); }
  };

  const exportTo = (fmt) => {
    fetch(`${API}/export/call/${callId}?format=${fmt}`, { credentials: "include" })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `call-${callId.slice(0, 8)}.${fmt}`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => toast.error("Export failed"));
  };

  const generateHighlights = async (regenerate = false) => {
    setGeneratingHighlights(true);
    try {
      const { data } = await api.post(`/calls/${callId}/highlights`, { regenerate });
      setHighlights(data.highlights || []);
      if (!data.cached) toast.success(`Found ${data.highlights.length} notable moment${data.highlights.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error("Could not generate highlights");
    } finally { setGeneratingHighlights(false); }
  };

  const segments = call?.transcript_segments || [];
  const hlBySegment = highlights.reduce((acc, h) => {
    if (h.segment_id) acc[h.segment_id] = h;
    return acc;
  }, {});

  const onCreateTaskFromSegment = (seg) => {
    const taskBody = seg.speaker_name ? `${seg.speaker_name}: ${seg.text}` : seg.text;
    setTaskSourceText(taskBody);
    setShowTaskDialog(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="bg-[#0a0a0a] border-white/10 rounded-sm max-w-3xl max-h-[90vh] overflow-y-auto"
          data-testid="meeting-summary-dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-400" />
              Meeting Notes
              <span className="text-[9px] font-mono uppercase tracking-widest text-yellow-300 border border-yellow-500/30 px-1.5 py-0.5 rounded-sm">
                {call.mode?.toUpperCase()}
              </span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              AI-generated meeting summary, transcript, and export tools for this call.
            </DialogDescription>
          </DialogHeader>

          <MeetingMetadataBar call={call} />

          <MeetingHighlightsBar
            highlights={highlights}
            segmentsCount={segments.length}
            generating={generatingHighlights}
            onGenerate={() => generateHighlights(false)}
            onRegenerate={() => generateHighlights(true)}
          />

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-[#121214] border border-white/10 rounded-sm p-1">
              <TabsTrigger value="summary" data-testid="mtg-tab-summary" className="font-mono uppercase text-[10px] tracking-widest data-[state=active]:bg-yellow-500 data-[state=active]:text-black rounded-sm">
                Summary
              </TabsTrigger>
              <TabsTrigger value="transcript" data-testid="mtg-tab-transcript" className="font-mono uppercase text-[10px] tracking-widest data-[state=active]:bg-yellow-500 data-[state=active]:text-black rounded-sm">
                Transcript
              </TabsTrigger>
            </TabsList>

            <TabsContent value="summary">
              <MeetingSummaryTab
                summaryMd={summaryMd}
                hasTranscript={!!transcriptText}
                editing={editingSummary}
                draft={summaryDraft}
                setDraft={setSummaryDraft}
                busy={busy}
                onGenerate={() => generate(false)}
                onRegenerate={() => generate(true)}
                onStartEdit={() => setEditingSummary(true)}
                onSaveEdit={saveSummary}
                onCancelEdit={() => { setEditingSummary(false); setSummaryDraft(summaryMd); }}
                onCreateTasks={() => { setTaskSourceText(summaryMd); setShowTaskDialog(true); }}
              />
            </TabsContent>

            <TabsContent value="transcript">
              <MeetingTranscriptTab
                transcriptText={transcriptText}
                segments={segments}
                hlBySegment={hlBySegment}
                editing={editingTranscript}
                draft={transcriptDraft}
                setDraft={setTranscriptDraft}
                busy={busy}
                onUpload={uploadRecording}
                onStartEdit={() => setEditingTranscript(true)}
                onSaveEdit={saveTranscript}
                onCancelEdit={() => { setEditingTranscript(false); setTranscriptDraft(transcriptText); }}
                onCreateTaskFromSegment={onCreateTaskFromSegment}
              />
            </TabsContent>
          </Tabs>

          <MeetingExportButtons onExport={exportTo} />
        </DialogContent>
      </Dialog>

      <SuggestTasksDialog
        open={showTaskDialog}
        onOpenChange={(v) => { setShowTaskDialog(v); if (!v) setTaskSourceText(""); }}
        sourceChatId={call?.chat_id}
        sourceMessage={taskSourceMessage}
      />
    </>
  );
}
