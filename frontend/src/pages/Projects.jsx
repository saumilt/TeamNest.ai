import { useEffect, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FolderKanban,
  Plus,
  ArrowRight,
  Sparkles,
  ListTodo,
  Users,
} from "lucide-react";

const PROJECT_EXAMPLES = [
  { name: "Product launch plan", description: "Everything for shipping our next launch — research, tasks, and decisions." },
  { name: "Market research", description: "Competitor analysis, trends, and findings for a new opportunity." },
  { name: "Client project", description: "Deliverables, meetings, and notes for a specific client engagement." },
  { name: "Team knowledge base", description: "Shared docs, decisions, and reference material for the team." },
];

export function ProjectsList() {
  const [folders, setFolders] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [params] = useSearchParams();

  useEffect(() => {
    api.get("/folders").then(({ data }) => setFolders(data));
    if (params.get("new")) setShowNew(true);
  }, [params]);

  const create = async () => {
    if (!name) return toast.error("Name required");
    const { data } = await api.post("/folders", { name, description });
    setFolders([...folders, data]);
    setShowNew(false);
    setName("");
    setDescription("");
    toast.success("Folder created");
  };

  const openNewWith = (n, d) => {
    setName(n);
    setDescription(d);
    setShowNew(true);
  };

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-end justify-between mb-10">
        <div>
          <div className="label-mono mb-3">WORKSPACE / PROJECTS</div>
          <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-tighter">
            Project Folders
          </h1>
        </div>
        <Button
          data-testid="new-folder-btn"
          onClick={() => setShowNew(true)}
          className="bg-white text-black hover:bg-zinc-200 rounded-sm font-mono uppercase tracking-widest text-xs h-10"
        >
          <Plus className="w-4 h-4 mr-2" /> New folder
        </Button>
      </div>

      {folders.length === 0 ? (
        <div className="border border-white/5 p-8 sm:p-12">
          <div className="max-w-lg">
            <FolderKanban className="w-6 h-6 text-blue-400 mb-4" />
            <h3 className="font-display text-2xl font-bold tracking-tight mb-2">No projects yet</h3>
            <p className="text-zinc-500 mb-6">
              Project folders group your research, tasks, and chats in one place.
              Start from an example:
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {PROJECT_EXAMPLES.map((ex) => (
                <button
                  key={ex.name}
                  type="button"
                  data-testid={`project-example-${ex.name.replace(/\s+/g, "-").toLowerCase()}`}
                  onClick={() => openNewWith(ex.name, ex.description)}
                  className="group text-left rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] hover:border-blue-400/40 px-4 py-3 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FolderKanban className="w-4 h-4 text-zinc-500 group-hover:text-blue-400 shrink-0" strokeWidth={1.8} />
                    <span className="text-sm font-medium text-zinc-100">{ex.name}</span>
                  </div>
                  <div className="text-xs text-zinc-500 line-clamp-2">{ex.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/5 border border-white/5">
          {folders.map((f) => (
            <Link
              key={f.id}
              to={`/projects/${f.id}`}
              data-testid={`project-${f.id}`}
              className="bg-[#0a0a0a] p-6 hover:bg-white/[0.03] transition-colors group"
            >
              <FolderKanban className="w-5 h-5 text-blue-400 mb-4" />
              <div className="font-display text-xl font-bold tracking-tight mb-1">{f.name}</div>
              <div className="text-sm text-zinc-500 line-clamp-2">{f.description || "—"}</div>
              <div className="mt-4 label-mono group-hover:text-yellow-400">
                OPEN <ArrowRight className="inline w-3 h-3" />
              </div>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="bg-[#0a0a0a] border-white/10 rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">New project folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="label-mono mb-2">NAME</div>
              <Input data-testid="folder-name" value={name} onChange={(e) => setName(e.target.value)} className="bg-[#121214] border-white/10 rounded-sm" />
            </div>
            <div>
              <div className="label-mono mb-2">DESCRIPTION</div>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="bg-[#121214] border-white/10 rounded-sm min-h-[80px]" />
            </div>
            <Button data-testid="create-folder-confirm" onClick={create} className="w-full bg-white text-black hover:bg-zinc-200 rounded-sm font-mono uppercase text-xs tracking-widest h-10">
              Create folder
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProjectDetail() {
  const { folderId } = useParams();
  const [data, setData] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    api.get(`/folders/${folderId}`).then(({ data }) => setData(data));
  }, [folderId]);

  if (!data) return <div className="p-6 label-mono">Loading…</div>;
  const { folder, saved_research, tasks, chats } = data;

  return (
    <div className="p-6 lg:p-10">
      <button onClick={() => nav("/projects")} className="label-mono text-zinc-500 hover:text-white mb-4">
        ← BACK TO PROJECTS
      </button>
      <div className="mb-10">
        <div className="label-mono mb-3">PROJECT FOLDER</div>
        <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-tighter mb-3">{folder.name}</h1>
        <p className="text-zinc-400 max-w-2xl">{folder.description || "—"}</p>
        <button
          onClick={() => nav(`/projects/${folderId}/memory`)}
          data-testid="folder-timeline-btn"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-purple-300 hover:text-purple-200 border border-purple-400/40 px-3 py-1.5 rounded-sm hover:bg-purple-500/10"
        >
          View memory timeline →
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-px bg-white/5 border border-white/5">
        <div className="bg-[#0a0a0a] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow-400" /> Saved research
            </h3>
            <span className="label-mono">{saved_research.length}</span>
          </div>
          <div className="space-y-px">
            {saved_research.length === 0 && <div className="text-sm text-zinc-500">No saved research yet.</div>}
            {saved_research.map((s) => (
              <div key={s.id} data-testid={`saved-research-${s.id}`} className="p-3 border-b border-white/5">
                <div className="text-sm font-medium mb-1">{s.title}</div>
                <div className="text-xs text-zinc-500 line-clamp-3 whitespace-pre-wrap">{s.final_answer}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0a0a0a] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-bold tracking-tight flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-blue-400" /> Tasks
            </h3>
            <span className="label-mono">{tasks.length}</span>
          </div>
          <div className="space-y-px">
            {tasks.length === 0 && <div className="text-sm text-zinc-500">No tasks.</div>}
            {tasks.map((t) => (
              <div key={t.id} className="p-3 border-b border-white/5" data-testid={`folder-task-${t.id}`}>
                <div className="text-sm">{t.title}</div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mt-1">
                  {t.status.replace("_", " ")} · {t.priority}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0a0a0a] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-bold tracking-tight flex items-center gap-2">
              <Users className="w-4 h-4 text-zinc-400" /> Related chats
            </h3>
            <span className="label-mono">{chats.length}</span>
          </div>
          <div className="space-y-px">
            {chats.map((c) => (
              <Link key={c.id} to={`/chats/${c.id}`} className="block p-3 border-b border-white/5 hover:bg-white/[0.03]" data-testid={`folder-chat-${c.id}`}>
                <div className="text-sm">{c.name || "Direct"}</div>
                <div className="text-xs text-zinc-500">{c.description}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
