import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Copy,
  RefreshCw,
  Mail,
  MessageCircle,
  Smartphone,
  QrCode,
  UserPlus,
  Sparkles,
  Check,
  X,
  Upload,
  Send,
  Users2,
  Link2,
  Cloud,
  Building2,
  Trophy,
  Zap,
  Award,
} from "lucide-react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

function relativeDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString();
}

const DEFAULT_LINK_EXPIRES_DAYS = 30;
const COPY_TOAST_RESET_MS = 1_800;
const MS_PER_DAY = 86_400_000;

function buildShareUrl(token) {
  if (typeof window === "undefined" || !token) return "";
  return `${window.location.origin}/join/${token}`;
}

export default function FindFriends() {
  const { user } = useAuth();
  const [link, setLink] = useState(null);
  const [pending, setPending] = useState([]);
  const [suggestions, setSuggestions] = useState({ domain: null, suggestions: [], skipped_reason: null });
  const [rewards, setRewards] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);

  const canManage = ["owner", "admin"].includes(user?.role);

  const loadAll = async () => {
    try {
      const [a, b, c, d, e] = await Promise.all([
        api.get("/invites/link"),
        api.get("/invites"),
        api.get("/invites/suggestions"),
        api.get("/me/referrals"),
        api.get("/leaderboard/referrals?scope=workspace&limit=5"),
      ]);
      setLink(a.data.link);
      setPending(b.data || []);
      setSuggestions(c.data || { domain: null, suggestions: [] });
      setRewards(d.data);
      setLeaderboard(e.data?.leaders || []);
    } catch (err) {
      console.warn("[find-friends] load failed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // loadAll is a stable closure over local setters; only re-run on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shareUrl = link?.token ? buildShareUrl(link.token) : "";

  const rotate = async () => {
    if (!canManage) return;
    setRotating(true);
    try {
      const { data } = await api.post("/invites/link/rotate", {
        role: "member",
        expires_in_days: DEFAULT_LINK_EXPIRES_DAYS,
      });
      setLink(data.link);
      toast.success("New invite link generated · previous link revoked");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not rotate link");
    } finally {
      setRotating(false);
    }
  };

  const ensureLink = async () => {
    if (link) return;
    await rotate();
  };

  return (
    <div className="min-h-screen p-6 lg:p-10 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="label-mono mb-2">FIND YOUR FRIENDS</div>
          <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight mb-2">
            Invite your team to <span className="text-yellow-400">TeamNest.ai</span>
          </h1>
          <p className="text-sm text-zinc-400 max-w-2xl">
            Share a magic link, blast invites by email, or share over WhatsApp/SMS.
            Already-joined teammates show up in <span className="text-yellow-300">Pending</span> as accepted.
          </p>
        </div>
        <div className="text-right hidden md:block">
          <div className="label-mono">YOUR WORKSPACE</div>
          <div className="font-display text-lg mt-1">{user?.workspace_id?.slice(0, 8)}…</div>
        </div>
      </div>

      {/* Rewards row */}
      {rewards && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-4 mb-6">
          <RewardsCard rewards={rewards} />
          {leaderboard.length > 0 && <LeaderboardCard leaders={leaderboard} />}
        </div>
      )}

      <Tabs defaultValue="link" className="w-full">
        <TabsList className="bg-[#0a0a0a] border border-white/10 rounded-sm p-1 mb-6">
          <TabsTrigger value="link" data-testid="ff-tab-link" className="font-mono uppercase text-[10px] tracking-widest data-[state=active]:bg-yellow-500 data-[state=active]:text-black rounded-sm">
            <Link2 className="w-3.5 h-3.5 mr-1.5" /> Magic Link & Share
          </TabsTrigger>
          <TabsTrigger value="bulk" data-testid="ff-tab-bulk" className="font-mono uppercase text-[10px] tracking-widest data-[state=active]:bg-yellow-500 data-[state=active]:text-black rounded-sm">
            <Mail className="w-3.5 h-3.5 mr-1.5" /> Bulk Email Invite
          </TabsTrigger>
          <TabsTrigger value="suggest" data-testid="ff-tab-suggest" className="font-mono uppercase text-[10px] tracking-widest data-[state=active]:bg-yellow-500 data-[state=active]:text-black rounded-sm">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" /> People You May Know
          </TabsTrigger>
          <TabsTrigger value="pending" data-testid="ff-tab-pending" className="font-mono uppercase text-[10px] tracking-widest data-[state=active]:bg-yellow-500 data-[state=active]:text-black rounded-sm">
            <Users2 className="w-3.5 h-3.5 mr-1.5" /> Pending ({pending.filter((p) => p.status === "pending").length})
          </TabsTrigger>
        </TabsList>

        {/* === MAGIC LINK & SHARE === */}
        <TabsContent value="link">
          <MagicLinkCard
            link={link}
            shareUrl={shareUrl}
            loading={loading}
            canManage={canManage}
            rotating={rotating}
            onRotate={rotate}
            workspaceLabel={user?.name}
          />
          {!loading && !link && canManage && (
            <div className="mt-6 border border-yellow-500/30 bg-yellow-500/[0.04] rounded-sm p-6 text-center">
              <Sparkles className="w-6 h-6 text-yellow-400 mx-auto mb-3" />
              <div className="font-display text-lg mb-2">No invite link yet</div>
              <div className="text-sm text-zinc-400 mb-4">Generate one to start inviting people.</div>
              <Button data-testid="ff-generate-link" onClick={ensureLink} disabled={rotating} className="bg-yellow-500 text-black hover:bg-yellow-400 rounded-sm font-mono uppercase text-xs tracking-widest h-10">
                <Sparkles className="w-4 h-4 mr-2" /> Generate invite link
              </Button>
            </div>
          )}
          {!canManage && !link && (
            <div className="mt-6 text-center text-sm text-zinc-500 border border-white/10 bg-[#121214] p-6 rounded-sm">
              Only owner or admin can generate an invite link. Ask your workspace owner.
            </div>
          )}
        </TabsContent>

        {/* === BULK INVITE === */}
        <TabsContent value="bulk">
          <BulkInviteCard onSent={loadAll} canManage={canManage} />
        </TabsContent>

        {/* === SUGGESTIONS === */}
        <TabsContent value="suggest">
          <SuggestionsCard
            data={suggestions}
            shareUrl={shareUrl}
            onInvited={loadAll}
            canManage={canManage}
          />
        </TabsContent>

        {/* === PENDING === */}
        <TabsContent value="pending">
          <PendingCard pending={pending} onReload={loadAll} canManage={canManage} />
        </TabsContent>
      </Tabs>

      {/* OAuth v2 teaser */}
      <div className="mt-12 border border-white/10 bg-[#121214] rounded-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-zinc-900 rounded-sm flex items-center justify-center shrink-0">
            <Cloud className="w-5 h-5 text-zinc-500" />
          </div>
          <div className="flex-1">
            <div className="label-mono mb-1">COMING NEXT</div>
            <div className="font-display text-lg mb-1">Sync from Google Contacts & Microsoft 365</div>
            <p className="text-sm text-zinc-400">
              Connect your Google account or Microsoft 365 to pull contacts and invite them in one click.
              We&apos;ll only request read-only contact access.
            </p>
          </div>
          <div className="flex gap-2 shrink-0 self-center">
            <Badge variant="outline" className="rounded-sm border-zinc-700 text-zinc-500 font-mono text-[10px] tracking-widest">
              SOON
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============= MAGIC LINK CARD =============
function MagicLinkCard({ link, shareUrl, loading, canManage, rotating, onRotate, workspaceLabel }) {
  const [copied, setCopied] = useState(false);
  const qrSrc = useMemo(
    () => (shareUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareUrl)}&bgcolor=0a0a0a&color=facc15&margin=10&qzone=2` : ""),
    [shareUrl]
  );

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), COPY_TOAST_RESET_MS);
    } catch {
      toast.error("Copy failed — long-press the link to copy");
    }
  };

  const shareMessage = `Hey — join my team on TeamNest.ai (AI-native chat + research). ${shareUrl}`;

  const shareTargets = [
    {
      id: "whatsapp",
      label: "WhatsApp",
      icon: MessageCircle,
      color: "text-green-400 border-green-400/30 hover:bg-green-400/10",
      url: `https://wa.me/?text=${encodeURIComponent(shareMessage)}`,
    },
    {
      id: "sms",
      label: "SMS",
      icon: Smartphone,
      color: "text-blue-400 border-blue-400/30 hover:bg-blue-400/10",
      url: `sms:?&body=${encodeURIComponent(shareMessage)}`,
    },
    {
      id: "email",
      label: "Email",
      icon: Mail,
      color: "text-yellow-300 border-yellow-500/30 hover:bg-yellow-500/10",
      url: `mailto:?subject=${encodeURIComponent("Join my team on TeamNest.ai")}&body=${encodeURIComponent(shareMessage)}`,
    },
  ];

  if (loading) {
    return <div className="h-64 shimmer rounded-sm" />;
  }

  if (!link) return null;

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-6">
      {/* Left: link + share */}
      <div className="border border-yellow-500/30 bg-yellow-500/[0.03] rounded-sm p-6" data-testid="ff-magic-link-card">
        <div className="flex items-center justify-between mb-3">
          <div className="label-mono text-yellow-400 flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" /> YOUR MAGIC INVITE LINK
          </div>
          {link.expires_at && (
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              EXPIRES {relativeDate(link.expires_at)}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch gap-2 mb-4">
          <div data-testid="ff-share-url" className="flex-1 bg-[#0a0a0a] border border-white/10 rounded-sm px-3 py-2.5 font-mono text-xs text-zinc-200 break-all">
            {shareUrl || "—"}
          </div>
          <Button
            data-testid="ff-copy-link"
            onClick={copy}
            className="bg-white text-black hover:bg-zinc-200 rounded-sm font-mono uppercase text-[10px] tracking-widest h-auto px-4"
          >
            {copied ? (<><Check className="w-3.5 h-3.5 mr-1.5" /> Copied</>) : (<><Copy className="w-3.5 h-3.5 mr-1.5" /> Copy</>)}
          </Button>
          {canManage && (
            <Button
              data-testid="ff-rotate-link"
              variant="outline"
              onClick={onRotate}
              disabled={rotating}
              className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase text-[10px] tracking-widest h-auto px-3"
              title="Generate a new link and revoke this one"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${rotating ? "animate-spin" : ""}`} /> Rotate
            </Button>
          )}
        </div>

        <div className="label-mono mb-2">SHARE INSTANTLY</div>
        <div className="flex flex-wrap gap-2 mb-5">
          {shareTargets.map((t) => (
            <a
              key={t.id}
              data-testid={`ff-share-${t.id}`}
              href={t.url}
              target={t.id === "whatsapp" ? "_blank" : undefined}
              rel={t.id === "whatsapp" ? "noopener noreferrer" : undefined}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono uppercase tracking-widest rounded-sm border bg-transparent transition-colors ${t.color}`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </a>
          ))}
        </div>

        <div className="border-t border-white/5 pt-4 grid grid-cols-3 gap-3 text-center">
          <Stat label="USES" value={link.use_count ?? 0} />
          <Stat label="MAX" value={link.max_uses ?? "∞"} />
          <Stat label="ROLE" value={(link.role || "member").toUpperCase()} />
        </div>
      </div>

      {/* Right: QR code */}
      <div className="border border-white/10 bg-[#0a0a0a] rounded-sm p-5 flex flex-col items-center text-center" data-testid="ff-qr-card">
        <div className="label-mono mb-3 flex items-center gap-1.5">
          <QrCode className="w-3.5 h-3.5" /> SCAN TO JOIN
        </div>
        {qrSrc ? (
          <img
            src={qrSrc}
            alt="QR code to join workspace"
            className="w-[200px] h-[200px] rounded-sm border border-yellow-500/30 bg-[#0a0a0a]"
          />
        ) : (
          <div className="w-[200px] h-[200px] shimmer rounded-sm" />
        )}
        <div className="text-[10px] font-mono text-zinc-500 mt-3 leading-relaxed">
          Show this in meetings,<br />print on flyers, share on screen.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="label-mono">{label}</div>
      <div className="font-display text-xl mt-1">{value}</div>
    </div>
  );
}

// ============= BULK INVITE CARD =============
function BulkInviteCard({ onSent, canManage }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const parsedEmails = useMemo(() => {
    const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    return Array.from(new Set(matches.map((e) => e.toLowerCase().trim())));
  }, [text]);

  const onPickCsv = () => fileRef.current?.click();

  const onCsv = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const content = await file.text();
      // Extract emails from CSV regardless of column layout
      setText((prev) => (prev ? prev + "\n" : "") + content);
      toast.success(`Loaded ${file.name}`);
    } catch {
      toast.error("Could not read file");
    }
  };

  const send = async () => {
    if (parsedEmails.length === 0) {
      toast.error("No valid emails detected");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const { data } = await api.post("/invites/bulk", {
        emails: parsedEmails,
        note,
        share_url_base: typeof window !== "undefined" ? window.location.origin : undefined,
      });
      setResult(data);
      const newCount = data.recorded.filter((r) => !r.duplicate).length;
      const dupCount = data.recorded.filter((r) => r.duplicate).length;
      toast.success(
        `Prepared ${newCount} new invite${newCount === 1 ? "" : "s"}` +
          (dupCount ? ` · ${dupCount} already invited` : "")
      );
      onSent?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Bulk invite failed");
    } finally {
      setBusy(false);
    }
  };

  const openEmailClient = () => {
    if (!result?.mailto_url) return;
    window.location.href = result.mailto_url;
  };

  if (!canManage) {
    return (
      <div className="border border-white/10 bg-[#121214] rounded-sm p-6 text-center text-sm text-zinc-500">
        Only owner/admin can send bulk invites.
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="border border-white/10 bg-[#121214] rounded-sm p-6" data-testid="ff-bulk-card">
        <div className="label-mono mb-2">PASTE EMAILS · OR UPLOAD CSV</div>
        <Textarea
          data-testid="ff-bulk-emails"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="alex@acme.com&#10;sara@acme.com, jay@example.org&#10;or paste a CSV column…"
          className="bg-[#0a0a0a] border-white/10 rounded-sm min-h-[140px] font-mono text-xs"
        />

        <div className="flex items-center justify-between mt-2 mb-4">
          <div className="text-[11px] font-mono text-zinc-500">
            <span data-testid="ff-email-count" className="text-yellow-300 font-bold">{parsedEmails.length}</span>{" "}
            valid email{parsedEmails.length === 1 ? "" : "s"} detected
          </div>
          <div>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onCsv} data-testid="ff-csv-input" />
            <Button
              data-testid="ff-csv-upload"
              type="button"
              variant="outline"
              onClick={onPickCsv}
              className="h-8 border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase text-[10px] tracking-widest px-2.5"
            >
              <Upload className="w-3 h-3 mr-1.5" /> Upload CSV
            </Button>
          </div>
        </div>

        <div className="label-mono mb-2">PERSONAL NOTE (OPTIONAL)</div>
        <Input
          data-testid="ff-bulk-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Excited to have you on board…"
          className="bg-[#0a0a0a] border-white/10 rounded-sm text-sm mb-4"
        />

        <Button
          data-testid="ff-bulk-prepare"
          onClick={send}
          disabled={busy || parsedEmails.length === 0}
          className="w-full bg-yellow-500 text-black hover:bg-yellow-400 rounded-sm font-mono uppercase text-xs tracking-widest h-11"
        >
          <Send className="w-4 h-4 mr-2" />
          {busy ? "Preparing…" : `Prepare ${parsedEmails.length} invite${parsedEmails.length === 1 ? "" : "s"}`}
        </Button>
      </div>

      <div className="border border-white/10 bg-[#0a0a0a] rounded-sm p-6 flex flex-col" data-testid="ff-bulk-preview">
        <div className="label-mono mb-3">PREVIEW & SEND</div>
        {!result ? (
          <div className="text-xs text-zinc-500 flex-1 flex flex-col justify-center">
            <Mail className="w-5 h-5 text-zinc-700 mx-auto mb-3" />
            <p className="leading-relaxed text-center">
              We prepare a single email with everyone on BCC and a copy of your magic link.
              Click <span className="text-yellow-300">&quot;Open in email client&quot;</span> to send it from your own inbox.
              <br /><br />
              Your recipients won&apos;t see each other.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-[#121214] border border-white/10 rounded-sm p-3 mb-3 max-h-[220px] overflow-y-auto">
              <div className="text-[10px] font-mono text-zinc-500 mb-1">SUBJECT</div>
              <div className="text-xs text-zinc-200 mb-3 leading-relaxed">{result.subject}</div>
              <div className="text-[10px] font-mono text-zinc-500 mb-1">BODY</div>
              <div className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">{result.body}</div>
            </div>
            <Button
              data-testid="ff-bulk-open-mailto"
              onClick={openEmailClient}
              className="w-full bg-white text-black hover:bg-zinc-200 rounded-sm font-mono uppercase text-xs tracking-widest h-10"
            >
              <Mail className="w-4 h-4 mr-2" /> Open in email client
            </Button>
            <a
              href={result.mailto_url}
              className="hidden"
              ref={(el) => { if (el && false) el.click(); }}
            >fallback</a>
          </>
        )}
      </div>
    </div>
  );
}

// ============= SUGGESTIONS =============
function SuggestionsCard({ data, shareUrl, onInvited, canManage }) {
  const [busyEmail, setBusyEmail] = useState(null);

  const invite = async (email) => {
    if (!canManage) {
      toast.error("Only owner/admin can invite");
      return;
    }
    setBusyEmail(email);
    try {
      await api.post("/invites/bulk", {
        emails: [email],
        share_url_base: typeof window !== "undefined" ? window.location.origin : undefined,
      });
      toast.success(`${email} added to pending invites`);
      onInvited?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Invite failed");
    } finally {
      setBusyEmail(null);
    }
  };

  if (data.skipped_reason === "generic_domain") {
    return (
      <div className="border border-white/10 bg-[#121214] rounded-sm p-6 text-center">
        <Building2 className="w-6 h-6 text-zinc-600 mx-auto mb-3" />
        <div className="font-display text-base mb-2">No domain suggestions for personal email</div>
        <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
          Your account uses a personal email domain ({data.domain}). Connect a work email to discover teammates from your company who are already on TeamNest.
        </p>
      </div>
    );
  }

  if (!data.suggestions || data.suggestions.length === 0) {
    return (
      <div className="border border-white/10 bg-[#121214] rounded-sm p-6 text-center">
        <Sparkles className="w-6 h-6 text-zinc-600 mx-auto mb-3" />
        <div className="font-display text-base mb-2">No suggestions yet</div>
        <p className="text-xs text-zinc-500">
          No one from <span className="text-yellow-300">@{data.domain}</span> is on TeamNest yet — be the first.
          Share your magic link with colleagues!
        </p>
      </div>
    );
  }

  return (
    <div className="border border-white/10 bg-[#121214] rounded-sm p-6" data-testid="ff-suggest-card">
      <div className="label-mono mb-3 flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
        PEOPLE AT <span className="text-yellow-300">@{data.domain}</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {data.suggestions.map((s, idx) => (
          <div
            key={s.real_email || `${s.first_name}-${idx}`}
            data-testid={`ff-suggest-${idx}`}
            className="border border-white/10 bg-[#0a0a0a] rounded-sm p-3 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 bg-yellow-500/10 border border-yellow-500/30 rounded-sm flex items-center justify-center font-display font-bold text-yellow-400">
                {s.first_name?.charAt(0) || "?"}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{s.first_name || "Someone"}</div>
                <div className="text-[11px] font-mono text-zinc-500 truncate">{s.masked_email}</div>
                <div className="text-[10px] text-zinc-600 truncate">at {s.workspace_name}</div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => invite(s.real_email)}
              disabled={busyEmail === s.real_email}
              className="border-yellow-500/30 bg-transparent text-yellow-300 hover:bg-yellow-500/10 rounded-sm font-mono uppercase text-[10px] tracking-widest h-8 px-3 shrink-0"
            >
              <UserPlus className="w-3 h-3 mr-1" />
              {busyEmail === s.real_email ? "…" : "Invite"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============= PENDING =============
function PendingCard({ pending, onReload, canManage }) {
  const cancel = async (id) => {
    try {
      await api.delete(`/invites/${id}`);
      toast.success("Invite cancelled");
      onReload?.();
    } catch {
      toast.error("Cancel failed");
    }
  };

  if (pending.length === 0) {
    return (
      <div className="border border-white/10 bg-[#121214] rounded-sm p-8 text-center">
        <Users2 className="w-6 h-6 text-zinc-600 mx-auto mb-3" />
        <div className="font-display text-base mb-1">No invites yet</div>
        <p className="text-xs text-zinc-500">Bulk-invite some emails and they&apos;ll show up here.</p>
      </div>
    );
  }

  return (
    <div className="border border-white/10 bg-[#121214] rounded-sm overflow-hidden" data-testid="ff-pending-card">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left label-mono px-4 py-3">EMAIL</th>
            <th className="text-left label-mono px-4 py-3">STATUS</th>
            <th className="text-left label-mono px-4 py-3">INVITED</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {pending.map((p) => (
            <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.03]" data-testid={`ff-pending-row-${p.id}`}>
              <td className="px-4 py-3 text-sm text-zinc-200 font-mono">{p.email}</td>
              <td className="px-4 py-3">
                {p.status === "accepted" ? (
                  <Badge className="rounded-sm bg-green-500/15 border-green-500/40 text-green-300 font-mono text-[10px] tracking-widest border">
                    <Check className="w-3 h-3 mr-1" /> ACCEPTED
                  </Badge>
                ) : (
                  <Badge className="rounded-sm bg-yellow-500/15 border-yellow-500/40 text-yellow-300 font-mono text-[10px] tracking-widest border">
                    PENDING
                  </Badge>
                )}
              </td>
              <td className="px-4 py-3 text-xs font-mono text-zinc-500">{relativeDate(p.created_at)}</td>
              <td className="px-4 py-3 text-right">
                {canManage && p.status !== "accepted" && (
                  <button
                    data-testid={`ff-cancel-${p.id}`}
                    onClick={() => cancel(p.id)}
                    className="text-zinc-500 hover:text-red-400 text-[10px] font-mono uppercase tracking-widest"
                  >
                    <X className="w-3 h-3 inline mr-1" /> cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}



// ============= REWARDS =============
const BADGE_STYLES = {
  bronze: { color: "text-orange-300", border: "border-orange-500/40", bg: "bg-orange-500/10", glow: "shadow-orange-500/30", label: "BRONZE" },
  silver: { color: "text-zinc-200", border: "border-zinc-300/40", bg: "bg-zinc-300/10", glow: "shadow-zinc-300/30", label: "SILVER" },
  gold: { color: "text-yellow-300", border: "border-yellow-400/40", bg: "bg-yellow-500/10", glow: "shadow-yellow-400/30", label: "GOLD" },
  platinum: { color: "text-cyan-300", border: "border-cyan-300/40", bg: "bg-cyan-300/10", glow: "shadow-cyan-300/30", label: "PLATINUM" },
};

function daysLeft(iso) {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / MS_PER_DAY));
}

function RewardsCard({ rewards }) {
  const style = BADGE_STYLES[rewards.badge] || null;
  const progressPct = rewards.progress?.threshold
    ? Math.min(100, (rewards.referral_count / rewards.progress.threshold) * 100)
    : 100;
  const boostDays = daysLeft(rewards.pro_boost_until);

  return (
    <div className="border border-yellow-500/30 bg-gradient-to-br from-yellow-500/[0.06] to-transparent rounded-sm p-5" data-testid="ff-rewards-card">
      <div className="flex items-start gap-4">
        <div
          className={`w-14 h-14 rounded-sm border-2 ${style ? `${style.bg} ${style.border} shadow-lg ${style.glow}` : "bg-zinc-900 border-zinc-800"} flex items-center justify-center shrink-0`}
        >
          <Award className={`w-7 h-7 ${style ? style.color : "text-zinc-700"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="label-mono">YOUR REFERRAL TIER</span>
            {style ? (
              <span className={`text-[10px] font-mono tracking-widest ${style.color}`}>{style.label}</span>
            ) : (
              <span className="text-[10px] font-mono tracking-widest text-zinc-600">UNRANKED</span>
            )}
          </div>
          <div className="flex items-baseline gap-3 mt-1">
            <span data-testid="ff-referral-count" className="font-display text-3xl font-bold tracking-tight">
              {rewards.referral_count}
            </span>
            <span className="text-xs text-zinc-500">teammate{rewards.referral_count === 1 ? "" : "s"} invited & joined</span>
          </div>

          {rewards.progress?.next_badge && (
            <div className="mt-3" data-testid="ff-tier-progress">
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mb-1">
                <span>
                  {rewards.progress.remaining} more to{" "}
                  <span className="text-yellow-300">{rewards.progress.next_badge.toUpperCase()}</span>
                </span>
                <span>{rewards.referral_count} / {rewards.progress.threshold}</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-sm overflow-hidden">
                <div
                  className="h-full bg-yellow-500 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {rewards.pro_boost_active && (
          <div
            data-testid="ff-boost-active"
            className="border border-yellow-500/40 bg-yellow-500/10 rounded-sm px-3 py-2 text-center shrink-0"
            title={`Pro AI Boost — unlock all 6 AI models · ${boostDays} days left`}
          >
            <Zap className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
            <div className="text-[9px] font-mono uppercase tracking-widest text-yellow-300">PRO BOOST</div>
            <div className="text-[10px] font-mono text-yellow-200 mt-0.5">{boostDays}D LEFT</div>
          </div>
        )}
      </div>
    </div>
  );
}

function LeaderboardCard({ leaders }) {
  return (
    <div className="border border-white/10 bg-[#0a0a0a] rounded-sm p-5" data-testid="ff-leaderboard">
      <div className="label-mono mb-3 flex items-center gap-1.5">
        <Trophy className="w-3.5 h-3.5 text-yellow-400" /> WORKSPACE LEADERBOARD
      </div>
      <div className="space-y-1.5">
        {leaders.map((l, idx) => {
          const style = BADGE_STYLES[l.badge];
          return (
            <div
              key={l.id}
              data-testid={`ff-leader-${idx}`}
              className={`flex items-center gap-2.5 px-2 py-1.5 rounded-sm ${l.is_me ? "bg-yellow-500/[0.06] border border-yellow-500/20" : ""}`}
            >
              <span className={`font-mono text-xs w-5 text-center ${idx === 0 ? "text-yellow-300" : "text-zinc-500"}`}>
                {idx + 1}
              </span>
              <div className="w-6 h-6 bg-zinc-800 rounded-sm overflow-hidden flex items-center justify-center text-[10px] font-bold shrink-0">
                {l.avatar ? <img src={l.avatar} alt={l.name} className="w-full h-full object-cover" /> : l.name.charAt(0)}
              </div>
              <span className="flex-1 text-xs truncate">
                {l.name} {l.is_me && <span className="text-[10px] text-yellow-400 font-mono">· you</span>}
              </span>
              {style && (
                <Award className={`w-3.5 h-3.5 ${style.color}`} />
              )}
              <span className="text-xs font-display font-bold tabular-nums w-6 text-right">{l.referral_count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
