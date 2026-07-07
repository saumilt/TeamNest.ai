import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookUser,
  MessageSquare,
  Phone,
  Rocket,
  Search,
  Send,
  UserPlus,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import ContactBookImporter from "@/components/ContactBookImporter";

/**
 * WhatsApp-style "New chat" bottom sheet.
 *
 * Three top actions:
 *   • New group           → opens the existing NewChatDialog
 *   • New contact         → free-form name + phone form, persisted to
 *                            external_contacts (also creates the chat with them)
 *   • Invite via SMS/WA   → free-form phone, sends Twilio SMS or opens wa.me link
 *
 * Below the actions: search box + list of workspace members + invited contacts,
 * one tap to start a 1:1 chat.
 */
export default function WhatsAppStyleNewChatSheet({ open, onOpenChange, onOpenGroupDialog, onChatCreated }) {
  const [view, setView] = useState("home"); // "home" | "invite"
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState([]);
  const [phoneInvites, setPhoneInvites] = useState([]);
  const [inviting, setInviting] = useState(false);
  // Invite form
  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("+");

  useEffect(() => {
    if (!open) return;
    setView("home");
    setQuery("");
    setInviteName("");
    setInvitePhone("+");
    Promise.all([
      api.get("/workspace/members").then((r) => r.data.members || []),
      api.get("/invites/phone").then((r) => r.data.invites || []).catch(() => []),
    ]).then(([m, inv]) => {
      setMembers(m);
      setPhoneInvites(inv);
    });
  }, [open]);

  const filteredMembers = useMemo(() => {
    if (!query.trim()) return members;
    const q = query.toLowerCase();
    return members.filter(
      (m) =>
        (m.name || "").toLowerCase().includes(q) ||
        (m.email || "").toLowerCase().includes(q) ||
        (m.phone || "").includes(q),
    );
  }, [members, query]);

  const startChat = async (member) => {
    try {
      const { data } = await api.post("/chats", {
        name: member.name,
        type: "dm",
        member_ids: [member.id],
        default_models: [],
      });
      onChatCreated?.(data);
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start chat");
    }
  };

  const sendInvite = async (method) => {
    if (!invitePhone || invitePhone.length < 5) {
      return toast.error("Enter a phone number with country code (e.g. +1…)");
    }
    setInviting(true);
    try {
      const shareBase = typeof window !== "undefined" ? window.location.origin : "";
      const { data } = await api.post("/invites/phone", {
        phone: invitePhone.trim(),
        name: inviteName.trim() || null,
        method,
        share_url_base: shareBase,
      });
      if (data.method === "whatsapp") {
        window.open(data.open_url, "_blank");
        toast.success("Opening WhatsApp…");
      } else if (data.method === "local_sms") {
        // Twilio not configured / missing FROM number → opened user's local
        // SMS composer instead of sending server-side. Surface that clearly so
        // admins know to fix the Twilio settings.
        window.open(data.open_url, "_blank");
        toast.warning("Opening your SMS app — server-side SMS not configured yet.", {
          description: "Ask the workspace owner to add a Twilio number in admin settings.",
        });
      } else if (data.method === "sms") {
        if (data.twilio_mode === "test") {
          toast.warning("Test mode — Twilio accepted the request but did NOT deliver a real SMS.", {
            description: "Switch TWILIO_MODE to live and set TWILIO_FROM_NUMBER to deliver for real.",
          });
        } else {
          toast.success(`SMS sent · status: ${data.twilio_status}`);
        }
      }
      // Refresh invite list
      api.get("/invites/phone").then((r) => setPhoneInvites(r.data.invites || []));
      setView("home");
      setInvitePhone("+");
      setInviteName("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not send invite");
    } finally {
      setInviting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md w-full p-0 gap-0 bg-[#0F0F12] border-white/10 rounded-t-2xl sm:rounded-2xl overflow-hidden"
        data-testid="new-chat-sheet"
      >
        <header className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
          {view === "invite" && (
            <button
              onClick={() => setView("home")}
              className="text-zinc-400 hover:text-white p-1 -ml-1"
              data-testid="invite-back-btn"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          {view === "contacts" && (
            <button
              onClick={() => setView("home")}
              className="text-zinc-400 hover:text-white p-1 -ml-1"
              data-testid="contacts-back-btn"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h2 className="text-sm font-mono uppercase tracking-widest text-zinc-300">
            {view === "home"
              ? "New chat"
              : view === "invite"
                ? "Invite via SMS / WhatsApp"
                : "Find friends from contacts"}
          </h2>
        </header>

        {view === "contacts" && (
          <ContactBookImporter
            onStartChat={async (m) => {
              try {
                const { data } = await api.post("/chats", {
                  name: m.name,
                  type: "dm",
                  member_ids: [m.user_id],
                  default_models: [],
                });
                onChatCreated?.(data);
                onOpenChange(false);
              } catch (e) {
                toast.error(e?.response?.data?.detail || "Could not start chat");
              }
            }}
          />
        )}

        {view === "home" && (
          <>
            {/* Three big actions */}
            <div className="px-2 py-2 border-b border-white/5">
              <ActionRow
                icon={<Rocket className="w-5 h-5 text-amber-400" />}
                title="Development project"
                subtitle="Collaborative dev chat · AI Dev Manager + live workspace"
                onClick={async () => {
                  try {
                    const { data } = await api.post("/chats/dev", { name: "New Development Project" });
                    onChatCreated?.(data.chat);
                    onOpenChange(false);
                    toast.success("Development chat created — your AI Dev Manager is ready.");
                  } catch (e) {
                    toast.error(e?.response?.data?.detail || "Could not create dev chat");
                  }
                }}
                testId="new-chat-action-development"
              />
              <ActionRow
                icon={<Users className="w-5 h-5 text-emerald-400" />}
                title="New group"
                subtitle="Create a chat with multiple teammates"
                onClick={() => {
                  onOpenChange(false);
                  onOpenGroupDialog?.();
                }}
                testId="new-chat-action-group"
              />
              <ActionRow
                icon={<UserPlus className="w-5 h-5 text-violet-400" />}
                title="New contact"
                subtitle="Add someone by phone number"
                onClick={() => setView("invite")}
                testId="new-chat-action-new-contact"
              />
              <ActionRow
                icon={<MessageSquare className="w-5 h-5 text-amber-400" />}
                title="Invite via SMS / WhatsApp"
                subtitle="Send a join link to anyone's phone"
                onClick={() => setView("invite")}
                testId="new-chat-action-invite-phone"
              />
              <ActionRow
                icon={<BookUser className="w-5 h-5 text-blue-400" />}
                title="Find friends from contacts"
                subtitle="Match your address book against TeamNest"
                onClick={() => setView("contacts")}
                testId="new-chat-action-import-contacts"
              />
            </div>

            {/* Search + member list */}
            <div className="p-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name or phone…"
                  className="bg-[#121214] border-white/10 rounded-md pl-9 h-10 text-sm"
                  data-testid="new-chat-search"
                />
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 px-1 pt-1">
                Contacts on TeamNest · {filteredMembers.length}
              </div>
              <ul className="max-h-60 overflow-y-auto space-y-0.5">
                {filteredMembers.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => startChat(m)}
                      data-testid={`new-chat-member-${m.id}`}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-white/5 text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-zinc-700 text-zinc-200 flex items-center justify-center text-sm font-medium">
                        {(m.name || "?")[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-zinc-100 truncate">{m.name}</div>
                        <div className="text-[11px] text-zinc-500 truncate">
                          {m.email || m.phone || "Workspace member"}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
                {filteredMembers.length === 0 && (
                  <li className="text-sm text-zinc-500 italic px-2 py-3">
                    No matching contacts. Use "Invite via SMS / WhatsApp" above.
                  </li>
                )}
              </ul>

              {phoneInvites.length > 0 && (
                <>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 px-1 pt-3 pb-1">
                    Recently invited
                  </div>
                  <ul className="max-h-40 overflow-y-auto space-y-0.5">
                    {phoneInvites.slice(0, 6).map((i) => (
                      <li
                        key={i.id}
                        className="flex items-center gap-3 px-2 py-2 text-sm"
                      >
                        <Phone className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-zinc-200 truncate">
                            {i.name || i.phone}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {i.method === "whatsapp" ? "WhatsApp" : "SMS"} · {i.status}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </>
        )}

        {view === "invite" && (
          <div className="p-4 space-y-4">
            <div
              className="px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300"
              data-testid="invite-ai-billing-notice"
            >
              AI usage in this workspace is billed to your workspace credit wallet
              unless you change the billing mode in Group settings.
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              We'll generate a join link for your workspace and message it to this number.
              Recipient taps the link and lands directly in your workspace — no app install needed.
            </p>
            <div className="space-y-2">
              <label className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">
                Their name (optional)
              </label>
              <Input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Sarah"
                className="bg-[#121214] border-white/10 rounded-md"
                data-testid="invite-name-input"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">
                Phone (with country code)
              </label>
              <Input
                value={invitePhone}
                onChange={(e) => setInvitePhone(e.target.value)}
                placeholder="+14155551234"
                className="bg-[#121214] border-white/10 rounded-md font-mono"
                inputMode="tel"
                data-testid="invite-phone-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => sendInvite("whatsapp")}
                disabled={inviting}
                data-testid="invite-send-whatsapp"
                className="h-11 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                WhatsApp
              </button>
              <button
                onClick={() => sendInvite("sms")}
                disabled={inviting}
                data-testid="invite-send-sms"
                className="h-11 rounded-md bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-black text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                SMS
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed pt-2">
              WhatsApp opens your WhatsApp app with the message pre-filled. SMS sends directly
              via Twilio (US/CA $0.01 per message) or falls back to your phone's SMS app.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ActionRow({ icon, title, subtitle, onClick, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/5 text-left"
    >
      <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-zinc-100">{title}</div>
        <div className="text-[11px] text-zinc-500 truncate">{subtitle}</div>
      </div>
    </button>
  );
}
