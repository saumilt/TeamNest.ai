import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FolderPlus, Plus, Check, X, Search, UserPlus, RefreshCw } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import GroupAvatarPicker from "@/components/web/GroupAvatarPicker";

const MODELS = [
  { key: "chatgpt", name: "ChatGPT" },
  { key: "claude", name: "Claude" },
  { key: "gemini", name: "Gemini" },
  { key: "deepseek", name: "DeepSeek" },
  { key: "perplexity", name: "Perplexity" },
  { key: "grok", name: "Grok" },
];

// Split a pasted blob into unique, plausible emails (commas / spaces / newlines / semicolons).
const parseEmails = (raw) =>
  Array.from(
    new Set(
      (raw || "")
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.includes("@") && s.includes(".")),
    ),
  );

export default function NewChatDialog({ open, onOpenChange, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [folders, setFolders] = useState([]);
  const [folderId, setFolderId] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);
  const [defaultModels, setDefaultModels] = useState(["chatgpt", "claude", "gemini"]);
  const [type, setType] = useState("group");
  const [postingPolicy, setPostingPolicy] = useState("all");
  const [avatar, setAvatar] = useState({});
  const [memberQuery, setMemberQuery] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [contactIds, setContactIds] = useState([]);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  const { user } = useAuth();
  const canInvite = ["owner", "admin"].includes(user?.role);

  useEffect(() => {
    if (open) {
      api.get("/workspace/members").then(({ data }) => setMembers(data));
      api.get("/folders").then(({ data }) => setFolders(data));
      api.get("/workspace/contacts/frequent")
        .then(({ data }) => setContactIds(data.contact_ids || []))
        .catch(() => setContactIds([]));
      setName(""); setDescription(""); setSelected([]); setFolderId(""); setType("group");
      setPostingPolicy("all");
      setAvatar({});
      setMemberQuery(""); setInviteEmail(""); setInviteRole("member");
      setPendingOnly(false);
      setCreatingFolder(false); setNewFolderName("");
    }
  }, [open]);

  const createFolderInline = async () => {
    const name = newFolderName.trim();
    if (!name) return toast.error("Folder name required");
    setSavingFolder(true);
    try {
      const { data } = await api.post("/folders", { name, member_ids: [] });
      // Refresh list, auto-select the new one, exit create mode.
      setFolders((prev) => [...prev, data]);
      setFolderId(data.id);
      setCreatingFolder(false);
      setNewFolderName("");
      toast.success(`Project folder "${data.name}" created`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create folder");
    } finally {
      setSavingFolder(false);
    }
  };

  const toggleMember = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const inviteByEmail = async () => {
    const emails = parseEmails(inviteEmail);
    if (emails.length === 0) return toast.error("Enter one or more valid emails");
    if (emails.length > 20) return toast.error("Please invite at most 20 people at a time");
    setInviting(true);
    try {
      const results = await Promise.allSettled(
        emails.map((email) => {
          const derivedName = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          return api.post("/workspace/invite", { name: derivedName, email, role: inviteRole });
        }),
      );
      const added = [];
      let failed = 0;
      results.forEach((r) => {
        if (r.status === "fulfilled") {
          const d = r.value.data;
          added.push({ id: d.id, name: d.name, email: d.email });
        } else {
          failed += 1;
        }
      });
      if (added.length) {
        setMembers((prev) => {
          const byId = new Map(prev.map((m) => [m.id, m]));
          added.forEach((a) => { if (!byId.has(a.id)) byId.set(a.id, a); });
          return Array.from(byId.values());
        });
        setSelected((prev) => Array.from(new Set([...prev, ...added.map((a) => a.id)])));
        // Float freshly-invited people to the top of the picker.
        setContactIds((prev) => Array.from(new Set([...added.map((a) => a.id), ...prev])));
        setInviteEmail("");
        setMemberQuery("");
        toast.success(
          `Added ${added.length} ${added.length === 1 ? "person" : "people"} to this group${failed ? ` · ${failed} failed` : ""}`,
        );
      } else {
        toast.error(`Could not invite${failed ? ` (${failed} failed)` : ""}`);
      }
    } finally {
      setInviting(false);
    }
  };

  const resendInvite = async (m) => {
    setResendingId(m.id);
    try {
      const { data } = await api.post(`/workspace/invite/${m.id}/resend`);
      toast.success(`Invite re-sent to ${data.email || m.email}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not resend invite");
    } finally {
      setResendingId(null);
    }
  };

  // Order teammates: most-frequent contacts first, then the rest.
  const q = memberQuery.trim().toLowerCase();
  const flat = !!q || pendingOnly;
  const rank = new Map(contactIds.map((id, i) => [id, i]));
  const ordered = [...members].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
  let filtered = q
    ? ordered.filter((m) => (m.name || "").toLowerCase().includes(q) || (m.email || "").toLowerCase().includes(q))
    : ordered;
  if (pendingOnly) filtered = filtered.filter((m) => m.status === "invited");
  const frequentList = flat ? [] : filtered.filter((m) => rank.has(m.id)).slice(0, 6);
  const frequentIds = new Set(frequentList.map((m) => m.id));
  const othersList = flat ? filtered : filtered.filter((m) => !frequentIds.has(m.id));

  const renderMemberRow = (m) => (
    <label key={m.id} className="flex items-center gap-3 p-2 hover:bg-white/5 cursor-pointer rounded-sm">
      <Checkbox data-testid={`add-member-${m.id}`} checked={selected.includes(m.id)} onCheckedChange={() => toggleMember(m.id)} />
      <div className="text-sm flex-1 min-w-0 truncate">{m.name} <span className="text-zinc-500 text-xs">· {m.email}</span></div>
      {m.status === "invited" && (
        canInvite ? (
          <button
            type="button"
            data-testid={`member-invited-${m.id}`}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); resendInvite(m); }}
            disabled={resendingId === m.id}
            title="Invited — click to re-send the invite email"
            className="shrink-0 inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 disabled:opacity-60"
          >
            <RefreshCw className={`w-2.5 h-2.5 ${resendingId === m.id ? "animate-spin" : ""}`} /> invited
          </button>
        ) : (
          <span data-testid={`member-invited-${m.id}`} className="shrink-0 text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30" title="Invited — hasn't accepted yet">
            invited
          </span>
        )
      )}
    </label>
  );

  const toggleModel = (k) => {
    setDefaultModels((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };

  const submit = async () => {
    if (type === "group" && !name) return toast.error("Group name required");
    try {
      const { data } = await api.post("/chats", {
        type,
        name,
        description,
        member_ids: selected,
        project_folder_id: folderId || null,
        default_models: defaultModels,
        posting_policy: type === "group" ? postingPolicy : undefined,
        avatar_icon: type === "group" ? avatar.avatar_icon || null : null,
        avatar_color: type === "group" ? avatar.avatar_color || null : null,
        avatar_url: type === "group" ? avatar.avatar_url || null : null,
      });
      toast.success("Chat created");
      onCreated?.(data);
      onOpenChange(false);
    } catch (e) {
      toast.error("Create failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0a0a] border-white/10 rounded-sm max-w-lg max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0" data-testid="new-chat-dialog">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/10 shrink-0 text-left">
          <DialogTitle className="font-display tracking-tight">New Chat</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" data-testid="new-chat-scroll">
          <div className="flex gap-2">
            <button onClick={() => setType("group")} className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest rounded-sm border ${type === "group" ? "bg-white text-black border-white" : "border-white/10 text-zinc-400"}`}>
              Group
            </button>
            <button onClick={() => setType("direct")} className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest rounded-sm border ${type === "direct" ? "bg-white text-black border-white" : "border-white/10 text-zinc-400"}`}>
              Direct
            </button>
          </div>
          {type === "group" && (
            <>
              <div>
                <div className="label-mono mb-2">GROUP NAME</div>
                <Input data-testid="new-chat-name" value={name} onChange={(e) => setName(e.target.value)} className="bg-[#121214] border-white/10 rounded-sm" placeholder="Q2 product launch" />
              </div>
              <div>
                <div className="label-mono mb-2">GROUP PHOTO (OPTIONAL)</div>
                <GroupAvatarPicker value={avatar} name={name || "Group"} onChange={setAvatar} />
              </div>
              <div>
                <div className="label-mono mb-2">DESCRIPTION</div>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="bg-[#121214] border-white/10 rounded-sm min-h-[60px]" />
              </div>
              <div>
                <div className="label-mono mb-2 flex items-center justify-between">
                  <span>PROJECT FOLDER (OPTIONAL)</span>
                  {!creatingFolder && (
                    <button
                      type="button"
                      onClick={() => setCreatingFolder(true)}
                      data-testid="new-chat-create-folder"
                      className="text-[10px] font-mono uppercase tracking-widest text-brand hover:text-yellow-300 inline-flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> New folder
                    </button>
                  )}
                </div>
                {!creatingFolder ? (
                  <>
                    <Select value={folderId || "__none__"} onValueChange={(v) => setFolderId(v === "__none__" ? "" : v)}>
                      <SelectTrigger
                        data-testid="new-chat-folder-trigger"
                        className="bg-[#121214] border-white/10 rounded-sm"
                      >
                        <SelectValue placeholder="Don't link a folder" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#121214] border-white/10">
                        <SelectItem value="__none__">Don&apos;t link a folder</SelectItem>
                        {folders.map((f) => (
                          <SelectItem key={f.id} value={f.id} data-testid={`folder-option-${f.id}`}>
                            <span className="inline-flex items-center gap-1.5">
                              <FolderPlus className="w-3 h-3 opacity-60" /> {f.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {folderId && (
                      <div className="text-[11px] text-zinc-500 mt-1.5 flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-emerald-400" />
                        Documents uploaded in this chat will auto-save to{" "}
                        <span className="text-zinc-300">
                          {folders.find((f) => f.id === folderId)?.name}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2" data-testid="new-chat-folder-create-row">
                    <Input
                      autoFocus
                      data-testid="new-chat-folder-name"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createFolderInline(); } }}
                      placeholder="e.g. Q4 product launch"
                      className="bg-[#121214] border-white/10 rounded-sm flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={createFolderInline}
                      disabled={savingFolder || !newFolderName.trim()}
                      data-testid="new-chat-folder-save"
                      className="bg-brand text-black hover:bg-yellow-300 rounded-sm h-9"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}
                      className="rounded-sm h-9"
                      data-testid="new-chat-folder-cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              <div>
                <div className="label-mono mb-2">DEFAULT AI MODELS</div>
                <div className="flex flex-wrap gap-2">
                  {MODELS.map((m) => (
                    <button key={m.key} onClick={() => toggleModel(m.key)} className={`px-2 py-1 text-[10px] font-mono uppercase tracking-widest rounded-sm border ${defaultModels.includes(m.key) ? "bg-yellow-500 text-black border-yellow-500" : "border-white/10 text-zinc-400"}`}>
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="label-mono mb-2">WHO CAN POST</div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    data-testid="create-policy-all"
                    onClick={() => setPostingPolicy("all")}
                    className={`px-2 py-2 text-[10px] font-mono uppercase tracking-widest rounded-sm border text-left ${postingPolicy === "all" ? "bg-brand text-black border-brand" : "border-white/10 text-zinc-400"}`}
                  >
                    Everyone
                    <span className="block text-[9px] normal-case tracking-normal mt-0.5 opacity-80">Default</span>
                  </button>
                  <button
                    type="button"
                    data-testid="create-policy-admin-only"
                    onClick={() => setPostingPolicy("admin_only")}
                    className={`px-2 py-2 text-[10px] font-mono uppercase tracking-widest rounded-sm border text-left ${postingPolicy === "admin_only" ? "bg-brand text-black border-brand" : "border-white/10 text-zinc-400"}`}
                  >
                    Only me
                    <span className="block text-[9px] normal-case tracking-normal mt-0.5 opacity-80">Announcement</span>
                  </button>
                  <button
                    type="button"
                    data-testid="create-policy-selected"
                    onClick={() => setPostingPolicy("selected")}
                    className={`px-2 py-2 text-[10px] font-mono uppercase tracking-widest rounded-sm border text-left ${postingPolicy === "selected" ? "bg-brand text-black border-brand" : "border-white/10 text-zinc-400"}`}
                  >
                    Pick later
                    <span className="block text-[9px] normal-case tracking-normal mt-0.5 opacity-80">Configure in group info</span>
                  </button>
                </div>
              </div>
            </>
          )}
          <div>
            <div className="label-mono mb-2 flex items-center justify-between">
              <span>MEMBERS</span>
              <div className="flex items-center gap-2">
                {members.some((m) => m.status === "invited") && (
                  <button
                    type="button"
                    data-testid="members-pending-filter"
                    onClick={() => setPendingOnly((v) => !v)}
                    className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${pendingOnly ? "bg-amber-400 text-black border-amber-400" : "border-amber-500/40 text-amber-300 hover:bg-amber-500/10"}`}
                    title="Show only people who haven't accepted yet"
                  >
                    Pending
                  </button>
                )}
                <span className="text-[10px] text-zinc-500 normal-case tracking-normal">{selected.length} selected</span>
              </div>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
              <Input
                data-testid="new-chat-member-search"
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                placeholder="Search teammates by name or email"
                className="bg-[#121214] border-white/10 rounded-sm pl-9 h-9"
              />
            </div>
            <div className="space-y-1">
              {filtered.length === 0 ? (
                <div className="text-xs text-zinc-500 px-2 py-3" data-testid="new-chat-members-empty">
                  {memberQuery ? `No teammates match “${memberQuery}”.` : "No teammates yet — invite someone below."}
                </div>
              ) : (
                <>
                  {frequentList.length > 0 && (
                    <>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-yellow-500/80 px-1 pt-0.5 pb-1" data-testid="members-frequent-label">
                        Frequently contacted
                      </div>
                      {frequentList.map(renderMemberRow)}
                      {othersList.length > 0 && (
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 px-1 pt-2 pb-1">
                          All teammates
                        </div>
                      )}
                    </>
                  )}
                  {othersList.map(renderMemberRow)}
                </>
              )}
            </div>
            {canInvite && (
              <div className="mt-3 pt-3 border-t border-white/5" data-testid="new-chat-invite-row">
                <div className="label-mono mb-2">INVITE SOMEONE NEW</div>
                <Textarea
                  data-testid="new-chat-invite-email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); inviteByEmail(); } }}
                  placeholder="Paste one or more emails — separate with commas, spaces, or new lines"
                  className="bg-[#121214] border-white/10 rounded-sm min-h-[40px] text-sm"
                />
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center gap-1" data-testid="new-chat-invite-role">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mr-1">Role</span>
                    {["member", "viewer"].map((r) => (
                      <button
                        key={r}
                        type="button"
                        data-testid={`invite-role-${r}`}
                        onClick={() => setInviteRole(r)}
                        className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest rounded-sm border ${inviteRole === r ? "bg-white text-black border-white" : "border-white/10 text-zinc-400"}`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <Button
                    type="button"
                    onClick={inviteByEmail}
                    disabled={inviting || parseEmails(inviteEmail).length === 0}
                    data-testid="new-chat-invite-btn"
                    className="ml-auto bg-yellow-500 text-black hover:bg-yellow-400 rounded-sm font-mono uppercase text-[10px] tracking-widest h-8 px-3 shrink-0"
                  >
                    {inviting ? "…" : (
                      <><UserPlus className="w-3.5 h-3.5 mr-1" /> Invite{parseEmails(inviteEmail).length > 1 ? ` ${parseEmails(inviteEmail).length}` : ""}</>
                    )}
                  </Button>
                </div>
                <div className="text-[10px] text-zinc-600 mt-1.5">They&apos;ll be emailed an invite and added to this group as <span className="text-zinc-400">{inviteRole}s</span>. Tip: ⌘/Ctrl + Enter to send.</div>
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 px-5 py-4 border-t border-white/10 flex items-center gap-2 bg-[#0a0a0a]">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="create-chat-cancel"
            className="rounded-sm font-mono uppercase text-xs tracking-widest h-10 border border-white/10 text-zinc-300 hover:bg-white/5 hover:text-white px-4"
          >
            Cancel
          </Button>
          <Button data-testid="create-chat-confirm" onClick={submit} className="flex-1 bg-white text-black hover:bg-zinc-200 rounded-sm font-mono uppercase text-xs tracking-widest h-10">
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
