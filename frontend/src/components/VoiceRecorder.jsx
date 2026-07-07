import { useEffect, useRef, useState } from "react";
import { api, API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Mic, Square, Trash2, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export default function VoiceRecorder({ chatId, onSent }) {
  const [state, setState] = useState("idle"); // idle | recording | preview | sending
  const [elapsed, setElapsed] = useState(0);
  const [blobUrl, setBlobUrl] = useState(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startRef = useRef(0);
  const tickRef = useRef(null);
  const blobRef = useRef(null);

  const cleanup = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch (err) { console.warn(err); }
    }
    recorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    chunksRef.current = [];
  };

  useEffect(() => cleanup, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Prefer webm/opus which Whisper supports directly.
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        blobRef.current = blob;
        setBlobUrl(URL.createObjectURL(blob));
        setState("preview");
      };
      recorderRef.current = rec;
      rec.start(250);
      startRef.current = Date.now();
      setElapsed(0);
      setState("recording");
      tickRef.current = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 200);
    } catch (e) {
      console.warn("[voice]", e);
      toast.error("Microphone access denied — check your browser permissions.");
    }
  };

  const stop = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const discard = () => {
    cleanup();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    blobRef.current = null;
    setElapsed(0);
    setState("idle");
  };

  const send = async () => {
    if (!blobRef.current) return;
    setState("sending");
    try {
      const form = new FormData();
      form.append("chat_id", chatId);
      form.append("duration", String(elapsed.toFixed(2)));
      const ext = (blobRef.current.type.includes("webm") ? "webm" : "ogg");
      form.append("file", blobRef.current, `voice-note.${ext}`);
      await api.post("/voice-notes", form, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Voice note sent");
      onSent?.();
      discard();
    } catch (e) {
      console.warn("[voice]", e);
      toast.error(e?.response?.data?.detail || "Failed to send voice note");
      setState("preview");
    }
  };

  if (state === "idle") {
    return (
      <button
        data-testid="voice-record-btn"
        type="button"
        onClick={start}
        className="h-8 w-8 rounded-full bg-surface-2 hover:bg-surface-3 text-ink-dim hover:text-ink flex items-center justify-center active:scale-95"
        title="Record voice note"
        aria-label="Voice"
      >
        <Mic className="w-4 h-4" />
      </button>
    );
  }

  if (state === "recording") {
    return (
      <div className="flex items-center gap-1.5" data-testid="voice-recording">
        <span className="inline-block w-2 h-2 rounded-full bg-tn-red animate-pulse" />
        <span className="text-[12px] text-tn-red tabular-nums w-10">{fmtTime(elapsed)}</span>
        <button
          data-testid="voice-stop-btn"
          type="button"
          onClick={stop}
          className="h-8 px-3 rounded-full bg-tn-red/15 hover:bg-tn-red/25 text-tn-red text-[12px] font-medium inline-flex items-center gap-1"
        >
          <Square className="w-3 h-3" /> Stop
        </button>
      </div>
    );
  }

  // preview + sending
  return (
    <div className="flex items-center gap-1.5" data-testid="voice-preview">
      <audio src={blobUrl} controls className="h-8 max-w-[180px]" />
      <span className="text-[12px] text-ink-dim tabular-nums">{fmtTime(elapsed)}</span>
      <button
        data-testid="voice-discard-btn"
        type="button"
        onClick={discard}
        disabled={state === "sending"}
        className="h-8 w-8 rounded-full bg-surface-2 hover:bg-surface-3 text-ink-dim hover:text-ink flex items-center justify-center disabled:opacity-50"
        aria-label="Discard"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      <button
        data-testid="voice-send-btn"
        type="button"
        onClick={send}
        disabled={state === "sending"}
        className="h-8 px-3 rounded-full bg-brand hover:bg-brand-deep text-black text-[12px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
      >
        {state === "sending" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3" />}
        {state === "sending" ? "Sending" : "Send"}
      </button>
    </div>
  );
}

// VoiceNoteBubble renders inside MessageBubble.
export function VoiceNoteBubble({ message, currentUserId, onTask, onSave }) {
  const fileId = message?.metadata?.file_id;
  const duration = message?.metadata?.duration;
  const [transcript, setTranscript] = useState(message?.metadata?.transcript);
  const [summary, setSummary] = useState(message?.metadata?.summary);
  const [busy, setBusy] = useState(null);

  const audioSrc = fileId ? `${API}/files/${fileId}` : null;

  const transcribe = async () => {
    setBusy("transcribe");
    try {
      const { data } = await api.post(`/voice-notes/${fileId}/transcribe`);
      setTranscript(data.transcript);
      toast.success(data.cached ? "Loaded cached transcript" : "Transcribed");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Transcription failed");
    } finally { setBusy(null); }
  };

  const summarize = async () => {
    setBusy("summarize");
    try {
      const { data } = await api.post(`/voice-notes/${fileId}/summarize`);
      setTranscript(data.transcript);
      setSummary(data.summary);
      toast.success("Summary ready");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Summary failed");
    } finally { setBusy(null); }
  };

  const text = typeof transcript === "string" ? transcript : transcript?.text;

  return (
    <div className="rounded-2xl bg-brand-tint/30 border border-brand/20 p-3 max-w-md" data-testid="voice-note-bubble">
      <div className="flex items-center gap-2 mb-2">
        <Mic className="w-3.5 h-3.5 text-brand" />
        <span className="text-[12px] font-semibold text-brand">Voice note</span>
        {duration && <span className="text-[11px] text-ink-mute">· {fmtTime(duration)}</span>}
      </div>
      {audioSrc && (
        <audio
          data-testid="voice-note-audio"
          src={audioSrc}
          controls
          preload="none"
          className="w-full h-9 mb-2"
        />
      )}
      <div className="flex flex-wrap gap-1.5 mb-2">
        <button
          data-testid="voice-transcribe-btn"
          onClick={transcribe}
          disabled={busy === "transcribe"}
          className="h-7 px-2.5 text-[11px] font-medium rounded-full bg-brand-tint text-brand hover:bg-brand/30 disabled:opacity-50"
        >
          {busy === "transcribe" ? "…" : (text ? "Re-transcribe" : "Transcribe")}
        </button>
        <button
          data-testid="voice-summarize-btn"
          onClick={summarize}
          disabled={busy === "summarize"}
          className="h-7 px-2.5 text-[11px] font-medium rounded-full bg-brand-tint text-brand hover:bg-brand/30 disabled:opacity-50"
        >
          {busy === "summarize" ? "…" : "Summarize"}
        </button>
        <button
          data-testid="voice-task-btn"
          onClick={() => onTask?.({ ...message, body: text || "" })}
          disabled={!text}
          className="h-7 px-2.5 text-[11px] font-medium rounded-full bg-surface-2 text-ink-dim hover:bg-surface-3 disabled:opacity-30"
        >
          Create task
        </button>
      </div>
      {text && (
        <div className="text-[13px] text-ink leading-relaxed border-l-2 border-brand/30 pl-2 mt-2 whitespace-pre-wrap">
          {text}
        </div>
      )}
      {summary && (
        <div className="mt-2 border-t border-hairline pt-2">
          <div className="text-[12px] font-semibold text-ink-dim mb-1">Summary</div>
          <div className="text-[13px] text-ink-dim leading-relaxed whitespace-pre-wrap">{summary}</div>
        </div>
      )}
    </div>
  );
}
