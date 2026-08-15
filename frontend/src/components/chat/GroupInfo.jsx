import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import Avatar from "@/components/ui-v2/Avatar";
import {
  X,
  UserPlus,
  RefreshCw,
  Shield,
  ShieldOff,
  Trash2,
  Crown,
  Megaphone,
  Lock,
  Users as UsersIcon,
  Wallet,
} from "lucide-react";
import AiBillingTab from "@/components/chat/AiBillingTab";
import AddMemberDialog from "@/components/AddMemberDialog";
import GroupAvatarPicker from "@/components/web/GroupAvatarPicker";

/**
 * GroupInfo — slide-over panel listing chat members with role badges.
 * Admins can add/remove members, promote/demote admins, and change the
 * posting policy (everyone / admin-only / selected).
 *
 * The panel reloads itself after each mutation so the parent doesn't have to
 * track a copy of the chat document.
 */
export default function GroupInfo({ chatId, open, onClose, onChatChange }) {
  const { user } = useAuth();
  const [chat, setChat] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [aiEmployees, setAiEmployees] = useState([]);
  const [tab, setTab] = useState("members");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [resendingId, setResendingId] = useState(null);

  useEffect(() => {
    if (!open) return;
    api
      .get("/ai-employees")
      .then(({ data }) => {
        const active = (data.employees || []).filter(
          (e) =>
            e.subscription &&
            ["trial_active", "trial_ending_soon", "trial_ending_today", "active", "cancelling"].includes(
              e.subscription.status,
            ),
        );
        setAiEmployees(active);
      })
      .catch(() => {});
  }, [open]);

  const refresh = async () => {
    try {
      const { data } = await api.get(`/chats/${chatId}`);
      setChat(data);
      onChatChange?.(data);
    } catch {
      toast.error("Failed to load group info");
    }
  };

  useEffect(() => {
    if (!open || !chatId) return;
    refresh();
  }, [open, chatId]);

  const isAdmin = !!chat?.is_current_user_admin;
  const members = chat?.members || [];
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const policy = chat?.posting_policy || "all";
  const pendingCount = members.filter((m) => m.status === "invited").length;
  const shownMembers = pendingOnly ? members.filter((m) => m.status === "invited") : members;

  const handleRemove = async (uid, name) => {
    if (!window.confirm(`Remove ${name} from this chat?`)) return;
    setBusy(true);
    try {
      await api.delete(`/chats/${chatId}/members/${uid}`);
      toast.success(`${name} removed`);
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Remove failed");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAdmin = async (uid, name, makeAdmin) => {
    setBusy(true);
    try {
      await api.post(`/chats/${chatId}/admins`, { user_id: uid, make_admin: makeAdmin });
      toast.success(makeAdmin ? `${name} is now admin` : `${name} demoted`);
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const handleAddOpen = () => setShowAdd(true);

  const resendInvite = async (uid, email) => {
    setResendingId(uid);
    try {
      const { data } = await api.post(`/workspace/invite/${uid}/resend`);
      toast.success(`Invite re-sent to ${data.email || email}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not resend invite");
    } finally {
      setResendingId(null);
    }
  };

  const handlePolicyChange = async (next, selectedIds) => {
    setBusy(true);
    try {
      await api.patch(`/chats/${chatId}/posting-policy`, {
        posting_policy: next,
        posting_user_ids: selectedIds || [],
      });
      toast.success("Posting policy updated");
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop on mobile */}
      <div
        className="fixed inset-0 bg-black/50 z-40 md:hidden"
        onClick={onClose}
        data-testid="group-info-backdrop"
      />
      <aside
        data-testid="group-info-panel"
        className="fixed right-0 top-0 bottom-0 w-full md:w-[400px] bg-bg border-l border-hairline z-50 flex flex-col"
      >
        <div className="px-4 py-3 border-b border-hairline flex items-center justify-between sticky top-0 bg-bg/95 backdrop-blur">
          <div className="flex items-center gap-2 min-w-0">
            <UsersIcon className="w-4 h-4 text-brand" />
            <div className="min-w-0">
              <div className="text-[14px] font-semibold truncate">{chat?.name || "Group"}</div>
              <div className="text-[11px] text-ink-dim">
                {members.length} member{members.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-white/5 flex items-center justify-center"
            aria-label="Close group info"
            data-testid="group-info-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-4 pt-3 border-b border-hairline flex gap-1" data-testid="group-info-tabs">
          <button
            data-testid="tab-members"
            onClick={() => setTab("members")}
            className={`px-3 h-8 text-[12px] font-medium rounded-t-md border-b-2 transition-colors ${
              tab === "members"
                ? "border-brand text-ink"
                : "border-transparent text-ink-dim hover:text-ink"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <UsersIcon className="w-3.5 h-3.5" /> Members
            </span>
          </button>
          <button
            data-testid="tab-ai-billing"
            onClick={() => setTab("ai-billing")}
            className={`px-3 h-8 text-[12px] font-medium rounded-t-md border-b-2 transition-colors ${
              tab === "ai-billing"
                ? "border-brand text-ink"
                : "border-transparent text-ink-dim hover:text-ink"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" /> AI Billing & Permissions
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {tab === "ai-billing" && (
            <AiBillingTab chatId={chatId} chat={chat} isAdmin={isAdmin} />
          )}
          {tab === "members" && (
          <>
          {/* Group photo / preset icon (admins) */}
          {isAdmin && (
            <AvatarSection chatId={chatId} chat={chat} onUpdated={refresh} />
          )}
          {/* Chat category — used for sidebar grouping and to seed Dev OS smart defaults. */}
          <CategorySection chatId={chatId} chat={chat} onUpdated={onChatChange} />

          {/* Posting policy (admins only) */}
          {isAdmin && (
            <section data-testid="posting-policy-section">
              <div className="text-[11px] font-mono uppercase tracking-widest text-ink-dim mb-2">
                Who can post
              </div>
              <div className="space-y-2">
                <PolicyRow
                  active={policy === "all"}
                  icon={<UsersIcon className="w-4 h-4" />}
                  title="Everyone"
                  subtitle="Any member can post messages"
                  onClick={() => handlePolicyChange("all", [])}
                  busy={busy}
                  testid="policy-all"
                />
                <PolicyRow
                  active={policy === "admin_only"}
                  icon={<Megaphone className="w-4 h-4" />}
                  title="Admins only"
                  subtitle="Only chat admins can post. Others can read & react."
                  onClick={() => handlePolicyChange("admin_only", [])}
                  busy={busy}
                  testid="policy-admin-only"
                />
                <PolicyRow
                  active={policy === "selected"}
                  icon={<Lock className="w-4 h-4" />}
                  title="Selected people"
                  subtitle="Pick specific people who can post"
                  onClick={() =>
                    handlePolicyChange(
                      "selected",
                      chat?.posting_user_ids?.length ? chat.posting_user_ids : [user?.id]
                    )
                  }
                  busy={busy}
                  testid="policy-selected"
                />
              </div>

              {/* Selected-mode picker */}
              {policy === "selected" && (
                <div className="mt-3 p-3 border border-hairline rounded-card bg-surface-2/40" data-testid="selected-posters">
                  <div className="text-[11px] text-ink-dim mb-2">Tap to allow / revoke posting for each member.</div>
                  <div className="space-y-1">
                    {members.map((m) => {
                      const allowed = (chat?.posting_user_ids || []).includes(m.id) || (chat?.admin_ids || []).includes(m.id);
                      const isAdminMember = (chat?.admin_ids || []).includes(m.id);
                      return (
                        <button
                          key={m.id}
                          data-testid={`poster-toggle-${m.id}`}
                          disabled={busy || isAdminMember}
                          onClick={() => {
                            const next = new Set(chat?.posting_user_ids || []);
                            if (allowed) next.delete(m.id);
                            else next.add(m.id);
                            handlePolicyChange("selected", Array.from(next));
                          }}
                          className={`w-full flex items-center justify-between text-left px-2 h-9 rounded-md text-[13px] ${
                            allowed ? "bg-brand-tint text-brand" : "hover:bg-white/5"
                          } ${isAdminMember ? "opacity-70 cursor-not-allowed" : ""}`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="truncate">{m.name}</span>
                            {isAdminMember && (
                              <span className="text-[9px] font-mono uppercase tracking-widest text-amber-300">
                                admin · always
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] font-mono uppercase tracking-widest">
                            {allowed ? "can post" : "read only"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Members list */}
          <section data-testid="members-section">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-mono uppercase tracking-widest text-ink-dim">
                Members · {members.length}
                {aiEmployees.length > 0 && (
                  <span className="ml-1 text-violet-400">+ {aiEmployees.length} AI</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {pendingCount > 0 && (
                  <button
                    type="button"
                    data-testid="group-info-pending-filter"
                    onClick={() => setPendingOnly((v) => !v)}
                    className={`text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${pendingOnly ? "bg-amber-400 text-black border-amber-400" : "border-amber-500/40 text-amber-300 hover:bg-amber-500/10"}`}
                    title="Show only members who haven't accepted yet"
                  >
                    Pending {pendingCount}
                  </button>
                )}
                {isAdmin && (
                  <button
                    data-testid="open-add-member-btn"
                    onClick={handleAddOpen}
                    className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Add
                  </button>
                )}
              </div>
            </div>

            <ul className="space-y-1" data-testid="members-list">
              {shownMembers.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isSelf={m.id === user?.id}
                  canManage={isAdmin && m.id !== user?.id && !m.is_creator}
                  isAdmin={isAdmin}
                  busy={busy}
                  resending={resendingId === m.id}
                  onResend={() => resendInvite(m.id, m.email)}
                  onRemove={() => handleRemove(m.id, m.name)}
                  onToggleAdmin={() => handleToggleAdmin(m.id, m.name, !m.is_chat_admin)}
                />
              ))}
            </ul>

            {aiEmployees.length > 0 && (
              <div className="mt-4 pt-3 border-t border-hairline">
                <div className="text-[11px] font-mono uppercase tracking-widest text-violet-400 mb-2">
                  AI Employees · workspace-wide
                </div>
                <ul className="space-y-1" data-testid="ai-members-list">
                  {aiEmployees.map((e) => {
                    const fullName = e.subscription?.display_full_name || e.name;
                    const initial = (e.subscription?.display_first_name || e.name)[0]?.toUpperCase() || "AI";
                    const trigger = `@${(e.subscription?.display_first_name || e.key).toLowerCase().replace(/\s+/g, "")}`;
                    return (
                      <li
                        key={e.key}
                        data-testid={`ai-member-row-${e.key}`}
                        className="flex items-center gap-2.5 px-2 h-12 rounded-md hover:bg-violet-500/5"
                      >
                        <div className="w-8 h-8 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 flex items-center justify-center text-xs font-mono">
                          {initial}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] flex items-center gap-1.5">
                            <span className="truncate font-medium">{fullName}</span>
                            <span className="text-[10px] font-mono uppercase tracking-widest text-violet-400">
                              AI
                            </span>
                          </div>
                          <div className="text-[10px] text-ink-dim flex items-center gap-1.5 flex-wrap">
                            <span>{e.name} · {e.role}</span>
                            <span className="font-mono text-violet-400/70">· {trigger}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
          </>
          )}
        </div>
        {tab === "members" && isAdmin && (
          <div className="px-4 py-3 border-t border-hairline bg-bg shrink-0" data-testid="group-info-footer">
            <button
              data-testid="group-info-add-footer"
              onClick={handleAddOpen}
              className="w-full h-10 rounded-md bg-brand text-black font-medium text-[13px] inline-flex items-center justify-center gap-1.5 hover:bg-yellow-300"
            >
              <UserPlus className="w-4 h-4" /> Add member
            </button>
          </div>
        )}
      </aside>
      <AddMemberDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        chatId={chatId}
        chatName={chat?.name}
        existingMemberIds={memberIds}
        onAdded={refresh}
      />
    </>
  );
}

function PolicyRow({ active, icon, title, subtitle, onClick, busy, testid }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      disabled={busy}
      className={`w-full flex items-start gap-3 p-3 rounded-card border text-left transition-colors ${
        active
          ? "border-brand bg-brand-tint"
          : "border-hairline hover:bg-white/5"
      }`}
    >
      <span className={active ? "text-brand" : "text-ink-dim"}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className={`block text-[13px] font-medium ${active ? "text-brand" : "text-ink"}`}>{title}</span>
        <span className="block text-[11px] text-ink-dim mt-0.5">{subtitle}</span>
      </span>
      {active && (
        <span className="text-[9px] font-mono uppercase tracking-widest text-brand mt-1">active</span>
      )}
    </button>
  );
}

function MemberRow({ member, isSelf, canManage, isAdmin, busy, resending, onResend, onRemove, onToggleAdmin }) {
  return (
    <li
      data-testid={`member-row-${member.id}`}
      className="flex items-center gap-2.5 px-2 h-12 rounded-md hover:bg-white/5"
    >
      <Avatar name={member.name} src={member.avatar} size={32} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] flex items-center gap-1.5">
          <span className="truncate font-medium">{member.name}</span>
          {isSelf && <span className="text-[10px] text-ink-dim">(you)</span>}
        </div>
        <div className="text-[10px] text-ink-dim flex items-center gap-1.5 flex-wrap">
          {member.status === "invited" && (
            isAdmin ? (
              <button
                type="button"
                data-testid={`member-invited-${member.id}`}
                onClick={onResend}
                disabled={resending}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono uppercase tracking-widest hover:bg-amber-500/30 disabled:opacity-60"
                title="Invited — click to re-send the invite email"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${resending ? "animate-spin" : ""}`} /> invited
              </button>
            ) : (
              <span data-testid={`member-invited-${member.id}`} className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono uppercase tracking-widest" title="Invited — hasn't accepted yet">
                invited
              </span>
            )
          )}
          {member.is_creator && (
            <span className="inline-flex items-center gap-0.5 text-amber-300">
              <Crown className="w-3 h-3" /> creator
            </span>
          )}
          {member.is_chat_admin && !member.is_creator && (
            <span className="inline-flex items-center gap-0.5 text-amber-300">
              <Shield className="w-3 h-3" /> admin
            </span>
          )}
          {member.role && member.role !== "member" && (
            <span className="font-mono uppercase tracking-widest">{member.role}</span>
          )}
        </div>
      </div>
      {canManage && (
        <div className="flex items-center gap-0.5">
          <button
            data-testid={`toggle-admin-${member.id}`}
            onClick={onToggleAdmin}
            disabled={busy}
            title={member.is_chat_admin ? "Demote" : "Make admin"}
            className="w-8 h-8 rounded-full hover:bg-white/5 text-ink-dim hover:text-amber-300 flex items-center justify-center"
          >
            {member.is_chat_admin ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
          </button>
          <button
            data-testid={`remove-member-${member.id}`}
            onClick={onRemove}
            disabled={busy}
            title="Remove from chat"
            className="w-8 h-8 rounded-full hover:bg-tn-red/10 text-ink-dim hover:text-tn-red flex items-center justify-center"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </li>
  );
}

function AvatarSection({ chatId, chat, onUpdated }) {
  const [value, setValue] = useState({});
  useEffect(() => {
    setValue({
      avatar_icon: chat?.avatar_icon || null,
      avatar_color: chat?.avatar_color || null,
      avatar_url: chat?.avatar_url || null,
    });
  }, [chat?.avatar_icon, chat?.avatar_color, chat?.avatar_url]);

  const handleChange = async (next) => {
    setValue(next);
    try {
      await api.patch(`/chats/${chatId}/avatar`, {
        avatar_icon: next.avatar_icon ?? "",
        avatar_color: next.avatar_color ?? "",
        avatar_url: next.avatar_url ?? "",
      });
      onUpdated?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update group photo");
    }
  };

  return (
    <section data-testid="group-avatar-section">
      <div className="text-[11px] font-mono uppercase tracking-widest text-ink-dim mb-2">
        Group photo
      </div>
      <GroupAvatarPicker value={value} name={chat?.name || "Group"} onChange={handleChange} />
    </section>
  );
}

const CATEGORIES = [
  { key: "engineering", label: "Engineering" },
  { key: "product",     label: "Product" },
  { key: "marketing",   label: "Marketing" },
  { key: "ops",         label: "Ops" },
  { key: "sales",       label: "Sales" },
  { key: "general",     label: "General" },
];

function CategorySection({ chatId, chat, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const current = chat?.category || null;
  const setCategory = async (cat) => {
    setBusy(true);
    try {
      await api.patch(`/chats/${chatId}/category`, { category: cat === current ? null : cat });
      toast.success(cat === current ? "Category cleared" : `Category set to ${cat}`);
      onUpdated?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update category");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section data-testid="chat-category-section">
      <div className="text-[11px] font-mono uppercase tracking-widest text-ink-dim mb-2">
        Category
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => {
          const active = current === c.key;
          return (
            <button
              key={c.key}
              type="button"
              disabled={busy}
              data-testid={`chat-category-${c.key}`}
              onClick={() => setCategory(c.key)}
              className={`px-3 h-7 rounded-full text-[12px] font-medium border transition-colors ${
                active
                  ? "bg-brand-tint text-brand border-brand/30"
                  : "border-hairline text-ink-dim hover:text-ink hover:border-white/20"
              } disabled:opacity-60`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <div className="text-[10px] text-ink-mute mt-2 leading-snug">
        Groups chats by topic in the sidebar and helps Dev OS pick smart defaults when you spin up a project.
      </div>
    </section>
  );
}

