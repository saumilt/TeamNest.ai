import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { uploadFileChunked } from "@/lib/chunkedUpload";
import DoThisForMe from "@/components/DoThisForMe";
import { toast } from "sonner";
import {
  FolderArchive, UploadCloud, Loader2, FileText, Trash2, Sparkles,
  Send, CheckCircle2, AlertTriangle,
} from "lucide-react";

const ASK_MODELS = [
  { key: "claude", label: "Claude Sonnet 5" },
  { key: "chatgpt", label: "ChatGPT 5.6" },
];

const STATUS_STYLES = {
  processing: "text-amber-400",
  ready: "text-emerald-400",
  failed: "text-red-400",
};

export default function Knowledge() {
  const [sources, setSources] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const fileRef = useRef(null);

  const loadSources = useCallback(async () => {
    try {
      const { data } = await api.get("/knowledge/sources");
      setSources(data.sources || []);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  const loadDetail = useCallback(async (id) => {
    try {
      const { data } = await api.get(`/knowledge/sources/${id}`);
      setDetail(data);
    } catch {
      setDetail(null);
    }
  }, []);

  // Poll while anything is still processing.
  useEffect(() => {
    const anyProcessing = sources.some((s) => s.status === "processing");
    if (!anyProcessing) return;
    const t = setInterval(() => {
      loadSources();
      if (selectedId) loadDetail(selectedId);
    }, 3000);
    return () => clearInterval(t);
  }, [sources, selectedId, loadSources, loadDetail]);

  const selectSource = (id) => {
    setSelectedId(id);
    setDetail(null);
    loadDetail(id);
  };

  const onUpload = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast.error("Please upload a .zip archive");
      return;
    }
    setUploading(true);
    setUploadPct(0);
    try {
      const uploaded = await uploadFileChunked(file, { onProgress: setUploadPct });
      const { data: src } = await api.post("/knowledge/sources", {
        file_id: uploaded.id,
        name: file.name,
      });
      toast.success("Upload complete — indexing started");
      await loadSources();
      selectSource(src.id);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      setUploadPct(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const deleteSource = async (id) => {
    if (!window.confirm("Delete this document source and its index?")) return;
    try {
      await api.delete(`/knowledge/sources/${id}`);
      if (selectedId === id) { setSelectedId(null); setDetail(null); }
      loadSources();
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-1">
          <FolderArchive className="w-6 h-6 text-yellow-400" />
          <h1 className="text-2xl font-display font-bold">Documents</h1>
        </div>
        <p className="text-sm text-zinc-400 mb-6">
          Upload a ZIP of files — TeamNest parses PDFs, Word, Excel/CSV, text, code
          and images (OCR), then lets you ask questions with citations.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
          {/* Left — sources + upload */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              data-testid="knowledge-file-input"
              onChange={(e) => onUpload(e.target.files?.[0])}
            />
            <button
              data-testid="knowledge-upload-btn"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 bg-yellow-400 text-black font-semibold rounded-xl py-3 mb-4 hover:bg-yellow-300 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Uploading {uploadPct}%</>
              ) : (
                <><UploadCloud className="w-4 h-4" /> Upload ZIP</>
              )}
            </button>

            <div className="space-y-2" data-testid="knowledge-sources-list">
              {sources.length === 0 && (
                <div className="text-sm text-zinc-500 border border-white/10 rounded-xl p-6 text-center" data-testid="knowledge-empty">
                  No documents yet. Upload a ZIP to get started.
                </div>
              )}
              {sources.map((s) => (
                <div
                  key={s.id}
                  data-testid={`knowledge-source-${s.id}`}
                  onClick={() => selectSource(s.id)}
                  className={`group border rounded-xl p-3 cursor-pointer transition-colors ${
                    selectedId === s.id ? "border-yellow-400/60 bg-yellow-400/5" : "border-white/10 hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{s.name}</div>
                      <div className={`text-xs mt-1 flex items-center gap-1.5 ${STATUS_STYLES[s.status] || "text-zinc-400"}`}>
                        {s.status === "processing" && <Loader2 className="w-3 h-3 animate-spin" />}
                        {s.status === "ready" && <CheckCircle2 className="w-3 h-3" />}
                        {s.status === "failed" && <AlertTriangle className="w-3 h-3" />}
                        {s.status === "processing" ? `Indexing ${s.progress || 0}%` : s.status}
                        {s.status === "ready" && ` · ${s.file_count} files · ${s.chunk_count} chunks`}
                      </div>
                    </div>
                    <button
                      data-testid={`knowledge-delete-${s.id}`}
                      onClick={(e) => { e.stopPropagation(); deleteSource(s.id); }}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — detail + ask */}
          <div className="border border-white/10 rounded-xl bg-[#121214] min-h-[400px]">
            {!selectedId || !detail ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 py-20">
                <Sparkles className="w-8 h-8 mb-3 text-zinc-600" />
                <div className="text-sm">Select a document source to ask questions</div>
              </div>
            ) : (
              <SourceDetail detail={detail} onDeleted={() => { setSelectedId(null); setDetail(null); loadSources(); }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceDetail({ detail }) {
  const src = detail.source;
  const files = detail.files || [];
  const [question, setQuestion] = useState("");
  const [model, setModel] = useState("claude");
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState(null);

  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    setResult(null);
    try {
      const { data } = await api.post(`/knowledge/sources/${src.id}/ask`, { question: q, model });
      setResult(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Ask failed");
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="p-5" data-testid="knowledge-detail">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-lg font-display font-bold truncate">{src.name}</div>
          <div className="text-xs text-zinc-400 mt-0.5">
            {src.status === "ready"
              ? `${src.file_count} files · ${src.indexed_file_count} indexed · ${src.chunk_count} chunks`
              : src.status === "failed"
              ? `Failed: ${src.error || "unknown error"}`
              : `Indexing ${src.progress || 0}%…`}
          </div>
        </div>
        {src.status === "ready" && <DoThisForMe entityType="document" entityId={src.id} />}
      </div>

      {/* Ask box */}
      <div className="border border-white/10 rounded-xl p-3 mb-4 bg-[#0a0a0a]">
        <textarea
          data-testid="knowledge-ask-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(); }}
          placeholder={src.status === "ready" ? "Ask a question about these documents…" : "Available once indexing completes"}
          disabled={src.status !== "ready"}
          rows={2}
          className="w-full bg-transparent text-sm resize-none outline-none placeholder:text-zinc-600 disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-2 mt-2">
          <select
            data-testid="knowledge-model-select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="bg-[#121214] border border-white/10 rounded-lg text-xs px-2 py-1.5 outline-none"
          >
            {ASK_MODELS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <button
            data-testid="knowledge-ask-btn"
            disabled={src.status !== "ready" || asking || !question.trim()}
            onClick={ask}
            className="flex items-center gap-1.5 bg-yellow-400 text-black text-sm font-semibold rounded-lg px-4 py-1.5 hover:bg-yellow-300 transition-colors disabled:opacity-40"
          >
            {asking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {asking ? "Thinking…" : "Ask"}
          </button>
        </div>
      </div>

      {/* Answer */}
      {result && (
        <div className="border border-yellow-400/30 rounded-xl p-4 mb-4 bg-yellow-400/[0.03]" data-testid="knowledge-answer">
          <div className="flex items-center gap-1.5 text-xs text-yellow-400 mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Answer · {ASK_MODELS.find((m) => m.key === result.model)?.label || result.model}
          </div>
          <div className="text-sm text-zinc-100 whitespace-pre-wrap leading-relaxed">{result.answer}</div>
          {result.citations?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="text-[11px] uppercase tracking-widest text-zinc-500 mb-1.5">Sources</div>
              <div className="flex flex-wrap gap-1.5" data-testid="knowledge-citations">
                {[...new Set(result.citations.map((c) => c.file_path))].map((fp) => (
                  <span key={fp} className="text-xs bg-white/5 border border-white/10 rounded-full px-2.5 py-1 text-zinc-300">
                    {fp}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* File list */}
      <div>
        <div className="text-[11px] uppercase tracking-widest text-zinc-500 mb-2">Files ({files.length})</div>
        <div className="max-h-[280px] overflow-y-auto space-y-1" data-testid="knowledge-files">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 text-sm text-zinc-300 py-1">
              <FileText className={`w-3.5 h-3.5 shrink-0 ${f.indexed ? "text-emerald-400" : "text-zinc-600"}`} />
              <span className="truncate flex-1">{f.path}</span>
              <span className="text-xs text-zinc-500">
                {f.indexed ? `${f.text_len} chars` : (f.skipped_reason || "skipped")}
              </span>
            </div>
          ))}
          {files.length === 0 && <div className="text-sm text-zinc-500">No files parsed yet.</div>}
        </div>
      </div>
    </div>
  );
}
