import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Link2, Copy, RefreshCw, Share2, QrCode, Search, Mail, Phone, UserPlus,
  Copy as CopyIcon, CheckCircle2, AlertCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Avatar from "@/components/ui-v2/Avatar";

const SEARCH_DEBOUNCE_MS = 350;

/**
 * AddMemberDialog — add people to a chat as full workspace MEMBERS (not
 * chat-scoped guests). Mirrors InviteGuestDialog UX: share a link, quick-add
 * existing workspace members, find any TeamNest user by email/phone, or invite
 * a brand-new email (creates a member account with a one-time password).
 */
export default function AddMemberDialog({ open, onOpenChange, chatId, chatName, existingMemberIds, onAdded }) {
  const memberSet = existingMemberIds instanceof Set ? existingMemberIds : new Set(existingMemberIds || []);

  const [wsMembers, setWsMembers] = useState([]);
  const [addingId, setAddingId] = useState(null);
  const [resendingId, setResendingId] = useState(null);
  const { user } = useAuth();
  const canInvite = ["owner", "admin"].includes(user?.role);

  const resendInvite = async (u) => {
    setResendingId(u.id);
    try {
      const { data } = await api.post(`/workspace/invite/${u.id}/resend`);
      toast.success(`Invite re-sent to ${data.email || u.email}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not resend invite");
    } finally {
      setResendingId(null);
    }
  };

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchHint, setSearchHint] = useState(null);
  const searchTimer = useRef(null);

  const [newForm, setNewForm] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [createdMember, setCreatedMember] = useState(null);

  const [link, setLink] = useState(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const loadWsMembers = async () => {
    try {
      const { data } = await api.get("/workspace/members");
      setWsMembers(data || []);
    } catch {/* no-op */}
  };

  const loadLink = async () => {
    if (!chatId) return;
    try {
      const { data } = await api.get(`/chats/${chatId}/invite-link`);
      setLink(data.link);
    } catch {/* no-op */}
  };

  const rotateLink = async () => {
    if (!chatId) return;
    if (!confirm("Generate a new link? The current link will stop working immediately.")) return;
    setLinkBusy(true);
    try {
      const { data } = await api.post(`/chats/${chatId}/invite-link/rotate`);
      setLink(data.link);
      toast.success("New link generated. Old link is now invalid.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not rotate link");
    } finally { setLinkBusy(false); }
  };

  const shareUrl = link ? `${window.location.origin}${link.join_path}` : "";

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Invite link copied to clipboard");
    } catch { toast.error("Clipboard write failed"); }
  };

  const nativeShare = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join "${chatName || "a chat"}" on TeamNest`,
          text: `You're invited to "${chatName || "a chat"}" on TeamNest.`,
          url: shareUrl,
        });
      } catch {/* dismissed */}
    } else { copyLink(); }
  };

  useEffect(() => { if (open) { loadWsMembers(); loadLink(); } }, [open, chatId]);

  useEffect(() => {
    if (!open) {
      setQuery(""); setResults([]); setSearchHint(null);
      setNewForm({ name: "", email: "", phone: "" }); setCreatedMember(null);
    }
  }, [open]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 3) { setResults([]); setSearchHint(null); return; }
    setSearchBusy(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get("/users/search", { params: { q } });
        setResults(data.results || []);
        setSearchHint(
          (data.results || []).length === 0
            ? "No registered TeamNest user matches that email or phone — use the form below to invite by email."
            : null
        );
      } catch (e) {
        setResults([]);
        setSearchHint(e?.response?.data?.detail || "Search failed");
      } finally { setSearchBusy(false); }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(searchTimer.current);
  }, [query]);

  const addMember = async (payload, name, id) => {
    setAddingId(id || "new");
    try {
      const { data } = await api.post(`/chats/${chatId}/invite-member`, payload);
      if (data.created_new_account) {
        setCreatedMember(data);
      } else {
        toast.success(`Added ${data.name} to the chat.`);
        onAdded?.();
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not add member");
    } finally { setAddingId(null); }
  };

  const inviteByEmail = async (e) => {
    e.preventDefault();
    if (!newForm.email.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/chats/${chatId}/invite-member`, {
        email: newForm.email.trim().toLowerCase(),
        name: newForm.name.trim() || undefined,
        phone: newForm.phone.trim() || undefined,
      });
      if (data.created_new_account) {
        setCreatedMember(data);
      } else {
        toast.success(`Added ${data.name} to the chat.`);
        onAdded?.();
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not invite member");
    } finally { setBusy(false); }
  };

  const copyCreds = async () => {
    if (!createdMember) return;
    const text = `TeamNest.ai login for "${chatName || "chat"}"\nEmail: ${createdMember.email}\nPassword: ${createdMember.one_time_password}\n\nSign in at: ${window.location.origin}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Login details copied — paste in an email or chat to your teammate");
    } catch { toast.error("Clipboard write failed"); }
  };

  const wsCandidates = wsMembers.filter((u) => !memberSet.has(u.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0a0a] border-white/10 rounded-sm max-w-lg max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0" data-testid="add-member-dialog">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/10 shrink-0 text-left">
          <DialogTitle className="font-display tracking-tight">Add members to this chat</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="text-xs text-zinc-500 leading-relaxed mb-3">
          Members are full teammates — they can see this workspace and participate in <span className="text-zinc-200">{chatName || "this chat"}</span>.
        </div>

        {createdMember ? (
          <div
            className="space-y-4 p-4 border border-emerald-500/30 bg-emerald-500/5 rounded-sm"
            data-testid="add-member-credentials"
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <div className="text-sm">
                Member account created for <span className="font-mono text-zinc-100">{createdMember.email}</span>.
                Send them these one-time credentials so they can sign in.
              </div>
            </div>
            <div className="bg-[#121214] border border-white/10 rounded-sm p-3 font-mono text-xs">
              <div>email: <span className="text-yellow-300">{createdMember.email}</span></div>
              <div className="mt-1">password: <span className="text-yellow-300">{createdMember.one_time_password}</span></div>
            </div>
            <div className="flex gap-2">
              <Button
                data-testid="add-member-copy-creds"
                onClick={copyCreds}
                variant="outline"
                className="flex-1 border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase tracking-widest text-[10px] h-9"
              >
                <CopyIcon className="w-3 h-3 mr-1.5" /> Copy login details
              </Button>
              <Button
                data-testid="add-member-done"
                onClick={() => { setCreatedMember(null); onAdded?.(); onOpenChange(false); }}
                className="flex-1 bg-emerald-500 text-black hover:bg-emerald-400 rounded-sm font-mono uppercase tracking-widest text-[10px] h-9"
              >
                Done
              </Button>
            </div>
            <div className="flex items-start gap-2 text-[10px] text-zinc-500">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>We only show this password once. They can change it from their Profile page after signing in.</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Shareable chat-invite link */}
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/[0.06] p-3 space-y-2" data-testid="add-member-link-card">
              <div className="flex items-center gap-2">
                <Link2 className="w-3.5 h-3.5 text-yellow-300" />
                <div className="text-[11px] font-mono uppercase tracking-widest text-yellow-300">Share a link</div>
                <button
                  type="button"
                  onClick={rotateLink}
                  disabled={linkBusy || !link}
                  className="ml-auto text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-yellow-300 disabled:opacity-40 inline-flex items-center gap-1"
                  data-testid="add-member-link-rotate"
                >
                  <RefreshCw className={`w-3 h-3 ${linkBusy ? "animate-spin" : ""}`} /> New link
                </button>
              </div>
              <div className="text-[11px] text-zinc-400 leading-relaxed">
                Anyone with this link can join <span className="text-zinc-200">{chatName || "this chat"}</span> directly. They&apos;ll be added as a chat member when they sign up.
              </div>
              {link ? (
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={shareUrl}
                    onClick={(e) => e.target.select()}
                    data-testid="add-member-link-input"
                    className="bg-[#0a0a0a] border-white/10 rounded-sm text-[12px] font-mono h-9"
                  />
                  <Button type="button" size="sm" onClick={copyLink} data-testid="add-member-link-copy" className="bg-yellow-400 text-black hover:bg-yellow-300 rounded-sm h-9">
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={nativeShare} data-testid="add-member-link-share" className="border-white/10 rounded-sm h-9">
                    <Share2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button" size="sm" variant="outline"
                    onClick={() => setShowQr((v) => !v)}
                    data-testid="add-member-link-qr-toggle"
                    className={`border-white/10 rounded-sm h-9 ${showQr ? "bg-yellow-400/10 border-yellow-400/40 text-yellow-200" : ""}`}
                    aria-label="Show QR code"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="text-[11px] text-zinc-500">Generating link…</div>
              )}
              {link && showQr && (
                <div className="mt-2 flex flex-col items-center gap-2 p-3 rounded-md bg-white" data-testid="add-member-qr-block">
                  <QRCodeSVG value={shareUrl} size={184} bgColor="#ffffff" fgColor="#0a0a0a" level="M" marginSize={2} imageSettings={{ src: "/icons/icon-192.png", height: 36, width: 36, excavate: true }} />
                  <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-700">scan to join {chatName ? `“${chatName}”` : "this chat"}</div>
                </div>
              )}
            </div>

            {/* Quick-add existing workspace members */}
            {wsCandidates.length > 0 && (
              <div data-testid="add-member-ws-list">
                <div className="label-mono mb-2">WORKSPACE MEMBERS</div>
                <div className="max-h-40 overflow-y-auto -mx-1">
                  {wsCandidates.map((u) => (
                    <button
                      key={u.id}
                      data-testid={`add-member-ws-${u.id}`}
                      disabled={addingId === u.id}
                      onClick={() => addMember({ user_id: u.id }, u.name, u.id)}
                      className="w-full flex items-center gap-2.5 px-2 h-11 rounded-md hover:bg-white/5 text-left"
                    >
                      <Avatar name={u.name} src={u.avatar} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] truncate flex items-center gap-1.5">
                          {u.name}
                          {u.status === "invited" && (
                            canInvite ? (
                              <button
                                type="button"
                                data-testid={`ws-member-invited-${u.id}`}
                                onClick={() => resendInvite(u)}
                                disabled={resendingId === u.id}
                                title="Invited — click to re-send the invite email"
                                className="shrink-0 inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 disabled:opacity-60"
                              >
                                <RefreshCw className={`w-2.5 h-2.5 ${resendingId === u.id ? "animate-spin" : ""}`} /> invited
                              </button>
                            ) : (
                              <span data-testid={`ws-member-invited-${u.id}`} className="shrink-0 text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30" title="Invited — hasn't accepted yet">
                                invited
                              </span>
                            )
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate">{u.email}</div>
                      </div>
                      <span className="text-emerald-400 text-[11px] font-mono uppercase tracking-widest inline-flex items-center gap-1">
                        {addingId === u.id ? "…" : (<><UserPlus className="w-3.5 h-3.5" /> Add</>)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Find any TeamNest user by email/phone */}
            <div>
              <div className="label-mono mb-2">FIND BY EMAIL OR PHONE</div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                <Input
                  data-testid="add-member-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="bg-[#121214] border-white/10 rounded-sm pl-9"
                  placeholder="teammate@company.co  •  +1 555 0100"
                />
              </div>
              <div className="max-h-56 overflow-y-auto -mx-2 mt-2" data-testid="add-member-results">
                {searchBusy && <div className="px-2 py-3 text-xs font-mono uppercase tracking-widest text-zinc-500">Searching…</div>}
                {!searchBusy && searchHint && <div className="px-2 py-2 text-xs text-zinc-500">{searchHint}</div>}
                {!searchBusy && results.filter((r) => !memberSet.has(r.id)).map((r) => (
                  <div key={r.id} data-testid={`add-member-result-${r.id}`} className="flex items-center gap-3 px-2 py-2.5 border-b border-white/5 last:border-0">
                    <div className="w-9 h-9 bg-zinc-800 rounded-sm flex items-center justify-center text-xs font-bold shrink-0">{r.name?.charAt(0) || "?"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-100 truncate">{r.name}</div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-zinc-500">
                        {r.masked_email && <span className="inline-flex items-center gap-1 truncate"><Mail className="w-3 h-3 shrink-0" />{r.masked_email}</span>}
                        {r.masked_phone && <span className="inline-flex items-center gap-1 truncate"><Phone className="w-3 h-3 shrink-0" />{r.masked_phone}</span>}
                      </div>
                    </div>
                    <Button
                      data-testid={`add-member-add-${r.id}`}
                      onClick={() => addMember({ user_id: r.id }, r.name, r.id)}
                      disabled={addingId === r.id}
                      size="sm"
                      className="bg-emerald-500 hover:bg-emerald-400 text-black rounded-sm font-mono uppercase tracking-widest text-[10px] h-8 px-3"
                    >
                      {addingId === r.id ? "Adding…" : (<><UserPlus className="w-3 h-3 mr-1" /> Add</>)}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Invite a brand-new email */}
            <div className="pt-3 border-t border-white/5">
              <div className="label-mono mb-2">OR INVITE A NEW EMAIL</div>
              <form onSubmit={inviteByEmail} className="space-y-2.5">
                <Input data-testid="add-member-new-email" type="email" value={newForm.email} onChange={(e) => setNewForm({ ...newForm, email: e.target.value })} className="bg-[#121214] border-white/10 rounded-sm" placeholder="email address" />
                <Input data-testid="add-member-new-name" value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} className="bg-[#121214] border-white/10 rounded-sm" placeholder="name (optional)" />
                <Input data-testid="add-member-new-phone" type="tel" value={newForm.phone} onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })} className="bg-[#121214] border-white/10 rounded-sm" placeholder="phone (optional)" />
                <Button type="submit" data-testid="add-member-submit-new" disabled={busy || !newForm.email} className="w-full bg-yellow-500 hover:bg-yellow-400 text-black rounded-sm font-mono uppercase tracking-widest text-[10px] h-9">
                  {busy ? "Creating member…" : "Create member account"}
                </Button>
              </form>
              <div className="text-[10px] text-zinc-600 mt-2">We&apos;ll create a member account with a one-time password you can share with them.</div>
            </div>
          </div>
        )}
        </div>
        {!createdMember && (
          <div className="shrink-0 px-5 py-4 border-t border-white/10 bg-[#0a0a0a]">
            <Button
              data-testid="add-member-done-footer"
              onClick={() => onOpenChange(false)}
              className="w-full bg-white text-black hover:bg-zinc-200 rounded-sm font-mono uppercase text-xs tracking-widest h-10"
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
