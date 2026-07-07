import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileAudio2 } from "lucide-react";
import { AnnotatedTranscript } from "@/components/meeting/MeetingHighlightsBar";

/** Empty state — no transcript yet, prompt to upload. */
function EmptyTranscriptCard({ busy, onUpload }) {
  return (
    <div className="border border-white/10 bg-[#121214] rounded-sm p-6 text-center" data-testid="mtg-empty-transcript">
      <FileAudio2 className="w-6 h-6 text-zinc-600 mx-auto mb-3" />
      <div className="font-display text-base mb-2">No transcript yet</div>
      <p className="text-xs text-zinc-500 mb-4 max-w-md mx-auto">
        Upload a recording of this call and we&apos;ll transcribe it via Whisper. Once a transcript exists, summaries become much sharper.
      </p>
      <label className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500 text-black hover:bg-yellow-400 rounded-sm font-mono uppercase text-[10px] tracking-widest cursor-pointer">
        {busy === "upload" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {busy === "upload" ? "Transcribing…" : "Upload recording"}
        <input
          data-testid="mtg-upload-recording"
          type="file"
          accept="audio/*,.webm,.mp3,.wav,.m4a,.ogg"
          onChange={onUpload}
          disabled={busy === "upload"}
          className="hidden"
        />
      </label>
    </div>
  );
}

/** Plain transcript view — used when there are no segment-level highlights. */
function PlainTranscriptView({ text }) {
  return (
    <div className="border border-white/10 bg-[#121214] rounded-sm p-4 max-h-[60vh] overflow-y-auto" data-testid="mtg-transcript-view">
      <pre className="whitespace-pre-wrap text-sm text-zinc-200 font-sans leading-relaxed">{text}</pre>
    </div>
  );
}

function TranscriptEditor({ value, onChange, busy, onSave, onCancel }) {
  return (
    <>
      <Textarea
        data-testid="mtg-transcript-edit"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={18}
        className="bg-[#121214] border-white/10 rounded-sm font-mono text-xs"
      />
      <div className="flex gap-2 mt-2">
        <Button onClick={onSave} disabled={busy === "save-transcript"} size="sm" className="bg-white text-black hover:bg-zinc-200 rounded-sm font-mono uppercase text-[10px] tracking-widest h-8">
          {busy === "save-transcript" ? "…" : "Save"}
        </Button>
        <Button onClick={onCancel} variant="outline" size="sm" className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase text-[10px] tracking-widest h-8">
          Cancel
        </Button>
      </div>
    </>
  );
}

function TranscriptActions({ busy, onStartEdit, onUpload }) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      <Button
        onClick={onStartEdit}
        variant="outline"
        size="sm"
        className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase text-[10px] tracking-widest h-8"
      >
        Edit transcript
      </Button>
      <label className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase text-[10px] tracking-widest cursor-pointer h-8">
        {busy === "upload" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
        {busy === "upload" ? "…" : "Replace from audio"}
        <input type="file" accept="audio/*,.webm,.mp3,.wav,.m4a,.ogg" onChange={onUpload} disabled={busy === "upload"} className="hidden" />
      </label>
    </div>
  );
}

/** Transcript tab — empty state, editor, annotated, or plain view + actions. */
export default function MeetingTranscriptTab({
  transcriptText,
  segments,
  hlBySegment,
  editing,
  draft,
  setDraft,
  busy,
  onUpload,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onCreateTaskFromSegment,
}) {
  const hasTranscript = !!transcriptText;

  if (!hasTranscript) {
    return <EmptyTranscriptCard busy={busy} onUpload={onUpload} />;
  }
  if (editing) {
    return <TranscriptEditor value={draft} onChange={setDraft} busy={busy} onSave={onSaveEdit} onCancel={onCancelEdit} />;
  }
  return (
    <>
      {segments.length > 0 ? (
        <AnnotatedTranscript
          segments={segments}
          hlBySegment={hlBySegment}
          onCreateTaskFromSegment={onCreateTaskFromSegment}
        />
      ) : (
        <PlainTranscriptView text={transcriptText} />
      )}
      <TranscriptActions busy={busy} onStartEdit={onStartEdit} onUpload={onUpload} />
    </>
  );
}
