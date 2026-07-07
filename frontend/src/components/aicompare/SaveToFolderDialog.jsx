import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

/** Modal: save an AI response/synthesis to a project folder. */
export default function SaveToFolderDialog({ open, onOpenChange, response, threadId, question }) {
  const [folders, setFolders] = useState([]);
  const [folderId, setFolderId] = useState("");
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (open) {
      api.get("/folders").then(({ data }) => setFolders(data));
      setTitle(question?.slice(0, 80) || "Saved research");
    }
  }, [open, question]);

  const save = async () => {
    if (!folderId) return toast.error("Pick a folder");
    try {
      await api.post(`/folders/${folderId}/save-research`, {
        research_thread_id: threadId,
        title,
        final_answer: response?.answer || "",
      });
      toast.success("Saved to project folder");
      onOpenChange(false);
    } catch {
      toast.error("Save failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0a0a] border-white/10 rounded-sm max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display tracking-tight">Save to Project Folder</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="label-mono mb-2">FOLDER</div>
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger data-testid="save-folder-select" className="bg-[#121214] border-white/10 rounded-sm">
                <SelectValue placeholder="Pick a folder…" />
              </SelectTrigger>
              <SelectContent className="bg-[#121214] border-white/10">
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="label-mono mb-2">TITLE</div>
            <input
              data-testid="save-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#121214] border border-white/10 rounded-sm px-3 py-2 text-sm"
            />
          </div>
          <Button data-testid="save-confirm" onClick={save} className="w-full bg-white text-black hover:bg-zinc-200 rounded-sm font-mono uppercase text-xs tracking-widest">
            Save Research
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
