import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Link2, Copy, RefreshCw, Share2, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import ExistingGuestsList from "@/components/guest/ExistingGuestsList";
import GuestCredentialsCard from "@/components/guest/GuestCredentialsCard";
import SearchExistingUsers from "@/components/guest/SearchExistingUsers";
import InviteByEmailForm from "@/components/guest/InviteByEmailForm";

const SEARCH_DEBOUNCE_MS = 350;

export default function InviteGuestDialog({ open, onOpenChange, chatId, chatName }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchHint, setSearchHint] = useState(null);
  const [addingId, setAddingId] = useState(null);
  const searchTimer = useRef(null);

  const [newForm, setNewForm] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [createdGuest, setCreatedGuest] = useState(null);

  const [existingGuests, setExistingGuests] = useState([]);
  const [removingId, setRemovingId] = useState(null);

  // Chat-scoped invite link state.
  const [link, setLink] = useState(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const loadGuests = async () => {
    if (!chatId) return;
    try {
      const { data } = await api.get(`/chats/${chatId}/guests`);
      setExistingGuests(data || []);
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
    } catch {
      toast.error("Clipboard write failed");
    }
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
      } catch {/* user dismissed */}
    } else {
      copyLink();
    }
  };

  useEffect(() => { if (open) { loadGuests(); loadLink(); } }, [open, chatId]);
  // ^ helpers are defined inline above; intentionally not in deps.

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSearchHint(null);
      setNewForm({ name: "", email: "", phone: "" });
      setCreatedGuest(null);
    }
  }, [open]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 3) {
      setResults([]); setSearchHint(null); return;
    }
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

  const addExisting = async (target) => {
    setAddingId(target.id);
    try {
      const { data } = await api.post(`/chats/${chatId}/invite-guest`, { user_id: target.id });
      toast.success(`Added ${data.name} as a guest collaborator.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not add guest");
    } finally { setAddingId(null); }
  };

  const inviteByEmail = async (e) => {
    e.preventDefault();
    if (!newForm.email.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/chats/${chatId}/invite-guest`, {
        email: newForm.email.trim().toLowerCase(),
        name: newForm.name.trim() || undefined,
        phone: newForm.phone.trim() || undefined,
      });
      if (data.created_new_account) {
        setCreatedGuest(data);
      } else {
        toast.success(`Added ${data.name} as a guest.`);
        loadGuests();
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not invite guest");
    } finally { setBusy(false); }
  };

  const removeGuest = async (guest) => {
    if (!confirm(`Remove ${guest.name} from this chat?`)) return;
    setRemovingId(guest.id);
    try {
      const { data } = await api.delete(`/chats/${chatId}/guests/${guest.id}`);
      toast.success(
        data.still_in_workspace
          ? `Removed ${guest.name} from this chat.`
          : `Removed ${guest.name} from your workspace.`
      );
      setExistingGuests((prev) => prev.filter((g) => g.id !== guest.id));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not remove guest");
    } finally { setRemovingId(null); }
  };

  const copyCreds = async () => {
    if (!createdGuest) return;
    const text = `TeamNest.ai login for "${chatName || "chat"}"\nEmail: ${createdGuest.email}\nPassword: ${createdGuest.one_time_password}\n\nSign in at: ${window.location.origin}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Login details copied — paste in an email or chat to your guest");
    } catch {
      toast.error("Clipboard write failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0a0a] border-white/10 rounded-sm max-w-lg" data-testid="invite-guest-dialog">
        <DialogHeader>
          <DialogTitle className="font-display tracking-tight">Invite a guest to this chat</DialogTitle>
        </DialogHeader>

        <div className="text-xs text-zinc-500 leading-relaxed -mt-1 mb-1">
          Guests can only see <span className="text-zinc-200">{chatName || "this chat"}</span> — not your other workspaces, chats, or team members. Perfect for clients, freelancers, or external contractors.
        </div>

        {createdGuest ? (
          <GuestCredentialsCard
            guest={createdGuest}
            onCopy={copyCreds}
            onDone={() => { setCreatedGuest(null); loadGuests(); onOpenChange(false); }}
          />
        ) : (
          <div className="space-y-4">
            {/* Shareable chat-invite link */}
            <div
              className="rounded-md border border-yellow-500/30 bg-yellow-500/[0.06] p-3 space-y-2"
              data-testid="chat-invite-link-card"
            >
              <div className="flex items-center gap-2">
                <Link2 className="w-3.5 h-3.5 text-yellow-300" />
                <div className="text-[11px] font-mono uppercase tracking-widest text-yellow-300">
                  Share a link
                </div>
                <button
                  type="button"
                  onClick={rotateLink}
                  disabled={linkBusy || !link}
                  className="ml-auto text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-yellow-300 disabled:opacity-40 inline-flex items-center gap-1"
                  data-testid="chat-invite-link-rotate"
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
                    data-testid="chat-invite-link-input"
                    className="bg-[#0a0a0a] border-white/10 rounded-sm text-[12px] font-mono h-9"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={copyLink}
                    data-testid="chat-invite-link-copy"
                    className="bg-yellow-400 text-black hover:bg-yellow-300 rounded-sm h-9"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={nativeShare}
                    data-testid="chat-invite-link-share"
                    className="border-white/10 rounded-sm h-9"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowQr((v) => !v)}
                    data-testid="chat-invite-link-qr-toggle"
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
                <div
                  className="mt-2 flex flex-col items-center gap-2 p-3 rounded-md bg-white"
                  data-testid="chat-invite-qr-block"
                >
                  <QRCodeSVG
                    value={shareUrl}
                    size={184}
                    bgColor="#ffffff"
                    fgColor="#0a0a0a"
                    level="M"
                    marginSize={2}
                    imageSettings={{
                      src: "/icons/icon-192.png",
                      height: 36,
                      width: 36,
                      excavate: true,
                    }}
                  />
                  <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-700">
                    scan to join {chatName ? `“${chatName}”` : "this chat"}
                  </div>
                </div>
              )}
              {link && (
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                  {link.use_count || 0} joins so far · never expires
                </div>
              )}
            </div>

            <ExistingGuestsList
              guests={existingGuests}
              removingId={removingId}
              onRemove={removeGuest}
            />
            <SearchExistingUsers
              query={query}
              setQuery={setQuery}
              results={results}
              searchBusy={searchBusy}
              searchHint={searchHint}
              addingId={addingId}
              onAdd={addExisting}
            />
            <InviteByEmailForm
              form={newForm}
              setForm={setNewForm}
              busy={busy}
              onSubmit={inviteByEmail}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
