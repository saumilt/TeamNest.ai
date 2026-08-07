import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/src/components/Avatar";
import { apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

type Member = {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  role: string;
  status: string;
  must_change_password?: boolean;
  accepted_at?: string | null;
  joined_at?: string | null;
  last_invite_sent_at?: string | null;
};

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const DELIVERY: Record<string, { label: string; color: string; icon: any }> = {
  opened: { label: "Opened", color: colors.success, icon: "eye-outline" },
  delivered: { label: "Delivered", color: "#38bdf8", icon: "checkmark-done-outline" },
  sent: { label: "Sent", color: colors.textMuted, icon: "checkmark-outline" },
  failed: { label: "Failed", color: colors.danger, icon: "warning-outline" },
};

const EVENT_META: Record<string, { label: string; color: string; icon: any }> = {
  accepted: { label: "Accepted by mail server", color: colors.textMuted, icon: "paper-plane-outline" },
  delivered: { label: "Delivered to inbox", color: "#38bdf8", icon: "checkmark-done-outline" },
  opened: { label: "Opened the email", color: colors.success, icon: "eye-outline" },
  clicked: { label: "Clicked a link", color: colors.accent, icon: "hand-left-outline" },
  failed: { label: "Delivery failed", color: colors.danger, icon: "close-circle-outline" },
  rejected: { label: "Rejected", color: colors.danger, icon: "close-circle-outline" },
  complained: { label: "Marked as spam", color: colors.danger, icon: "alert-circle-outline" },
  unsubscribed: { label: "Unsubscribed", color: colors.textMuted, icon: "remove-circle-outline" },
  stored: { label: "Stored", color: colors.textMuted, icon: "archive-outline" },
};

function fmtEventTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function TeamScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, loading: authLoading } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [timelineFor, setTimelineFor] = useState<Member | null>(null);
  const [tlEvents, setTlEvents] = useState<any[]>([]);
  const [tlLoading, setTlLoading] = useState(false);
  const [tlConfigured, setTlConfigured] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [inviting, setInviting] = useState(false);
  const [inviteErr, setInviteErr] = useState("");

  const canInvite = ["owner", "admin"].includes((user as any)?.role);

  const load = useCallback(async () => {
    try {
      const [m, a] = await Promise.all([
        apiGet("/api/workspace/members"),
        apiGet("/api/workspace/invite-analytics").catch(() => ({ analytics: {} })),
      ]);
      setMembers(m || []);
      setAnalytics((a && a.analytics) || {});
    } catch {
      /* leave existing state */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (token) load();
    else if (!authLoading) setLoading(false);
  }, [token, authLoading, load]);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2500); };

  const openTimeline = async (m: Member) => {
    setTimelineFor(m);
    setTlEvents([]);
    setTlConfigured(true);
    setTlLoading(true);
    try {
      const r = await apiGet(`/api/workspace/members/${m.id}/invite-timeline`);
      setTlEvents(r?.events || []);
      setTlConfigured(r?.configured !== false);
    } catch {
      setTlEvents([]);
    } finally {
      setTlLoading(false);
    }
  };

  const resend = async (m: Member) => {
    setResendingId(m.id);
    try {
      await apiPost(`/api/workspace/invite/${m.id}/resend`, {});
      flash(`Invite re-sent to ${m.email}`);
      load();
    } catch (e: any) {
      flash(e?.message || "Could not resend invite");
    } finally { setResendingId(null); }
  };

  const doInvite = async () => {
    if (!name.trim() || !email.trim() || inviting) return;
    setInviting(true);
    setInviteErr("");
    try {
      const res = await apiPost("/api/workspace/invite", { name: name.trim(), email: email.trim(), role });
      setInviteOpen(false);
      setName(""); setEmail(""); setRole("member");
      flash(res?.added_to_existing_user ? `${res.name} added` : `Invitation sent to ${email.trim()}`);
      load();
    } catch (e: any) {
      setInviteErr(e?.message || "Invite failed");
    } finally { setInviting(false); }
  };

  const renderMember = (m: Member) => {
    const pending = m.status === "invited" || m.must_change_password;
    const joinedWhen = m.accepted_at || m.joined_at;
    const info = pending ? analytics[m.id] : null;
    const d = info && info.status && DELIVERY[info.status];
    return (
      <TouchableOpacity
        key={m.id}
        style={styles.memberRow}
        testID={`member-row-${m.id}`}
        onPress={() => openTimeline(m)}
        activeOpacity={0.7}
      >
        <Avatar name={m.name} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
          <Text style={styles.memberEmail} numberOfLines={1}>{m.email}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.rolePill}><Text style={styles.rolePillText}>{m.role}</Text></View>
            {pending ? (
              <View style={[styles.statusPill, styles.statusInvited]} testID={`member-status-invited-${m.id}`}>
                <Text style={[styles.statusText, { color: colors.accent }]}>
                  Invited{m.last_invite_sent_at ? ` · ${timeAgo(m.last_invite_sent_at)}` : ""}
                </Text>
              </View>
            ) : (
              <View style={[styles.statusPill, styles.statusJoined]} testID={`member-status-joined-${m.id}`}>
                <Ionicons name="checkmark" size={11} color={colors.success} />
                <Text style={[styles.statusText, { color: colors.success }]}>
                  Joined{joinedWhen ? ` · ${timeAgo(joinedWhen)}` : ""}
                </Text>
              </View>
            )}
            {d ? (
              <View style={[styles.statusPill, { borderColor: d.color + "55" }]} testID={`member-delivery-${info.status}`}>
                <Ionicons name={d.icon} size={11} color={d.color} />
                <Text style={[styles.statusText, { color: d.color }]}>{d.label}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {canInvite && pending ? (
          <TouchableOpacity
            testID={`member-resend-${m.id}`}
            onPress={() => resend(m)}
            disabled={resendingId === m.id}
            style={styles.resendBtn}
          >
            {resendingId === m.id ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <>
                <Ionicons name="mail-outline" size={13} color={colors.accent} />
                <Text style={styles.resendText}>Resend</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} testID={`member-timeline-hint-${m.id}`} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <TouchableOpacity testID="team-back-btn" onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Team</Text>
        {canInvite ? (
          <TouchableOpacity testID="team-invite-btn" onPress={() => { setInviteErr(""); setInviteOpen(true); }} style={styles.inviteBtn}>
            <Ionicons name="person-add-outline" size={15} color="#000" />
            <Text style={styles.inviteBtnText}>Invite</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 40 }} />}
      </View>

      {msg ? <Text style={styles.flash} testID="team-flash">{msg}</Text> : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
        >
          <Text style={styles.count}>{members.length} member{members.length === 1 ? "" : "s"}</Text>
          <View style={styles.card}>
            {members.map(renderMember)}
          </View>
        </ScrollView>
      )}

      <Modal visible={!!timelineFor} transparent animationType="slide" onRequestClose={() => setTimelineFor(null)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setTimelineFor(null)} />
          <View style={styles.sheet} testID="invite-timeline-sheet">
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.sheetTitle}>Invite delivery</Text>
                <Text style={styles.sheetSub} numberOfLines={1}>{timelineFor?.email}</Text>
              </View>
              <TouchableOpacity testID="invite-timeline-close" onPress={() => setTimelineFor(null)} style={styles.sheetClose}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {tlLoading ? (
              <View style={styles.tlCenter}><ActivityIndicator color={colors.accent} /></View>
            ) : !tlConfigured ? (
              <Text style={styles.tlEmpty} testID="invite-timeline-unconfigured">Email delivery tracking isn&apos;t configured for this workspace yet.</Text>
            ) : tlEvents.length === 0 ? (
              <Text style={styles.tlEmpty} testID="invite-timeline-empty">No delivery events yet. If you just sent the invite, check back in a moment.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: spacing.lg }}>
                {tlEvents.map((e, i) => {
                  const meta = EVENT_META[e.event] || { label: e.event || "Event", color: colors.textMuted, icon: "ellipse-outline" };
                  const last = i === tlEvents.length - 1;
                  return (
                    <View key={i} style={styles.tlRow} testID={`invite-timeline-event-${e.event}`}>
                      <View style={styles.tlRail}>
                        <View style={[styles.tlDot, { backgroundColor: meta.color }]}>
                          <Ionicons name={meta.icon} size={12} color="#09090b" />
                        </View>
                        {!last ? <View style={styles.tlLine} /> : null}
                      </View>
                      <View style={{ flex: 1, paddingBottom: last ? 0 : spacing.lg }}>
                        <Text style={[styles.tlLabel, { color: meta.color }]}>{meta.label}</Text>
                        <Text style={styles.tlTime}>{fmtEventTime(e.timestamp)}</Text>
                        {e.reason ? <Text style={styles.tlReason}>{e.reason}</Text> : null}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {timelineFor && canInvite && (timelineFor.status === "invited" || timelineFor.must_change_password) ? (
              <TouchableOpacity
                testID="invite-timeline-resend"
                onPress={() => { const m = timelineFor; setTimelineFor(null); if (m) resend(m); }}
                disabled={resendingId === timelineFor.id}
                style={styles.tlResendBtn}
                activeOpacity={0.85}
              >
                {resendingId === timelineFor.id ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <>
                    <Ionicons name="mail-outline" size={15} color="#000" />
                    <Text style={styles.tlResendText}>Resend invite</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={inviteOpen} transparent animationType="fade" onRequestClose={() => !inviting && setInviteOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="team-invite-modal">
            <Text style={styles.modalTitle}>Invite by email</Text>
            <Text style={styles.modalSub}>They&apos;ll get an email to set their password and join.</Text>
            <Text style={styles.label}>NAME</Text>
            <TextInput testID="invite-name-input" value={name} onChangeText={setName} placeholder="Jane Doe" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.label}>EMAIL</Text>
            <TextInput testID="invite-email-input" value={email} onChangeText={setEmail} placeholder="jane@company.com" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" style={styles.input} />
            <Text style={styles.label}>ROLE</Text>
            <View style={styles.roleToggle}>
              {(["member", "admin"] as const).map((r) => (
                <TouchableOpacity key={r} testID={`invite-role-${r}`} onPress={() => setRole(r)} style={[styles.roleOpt, role === r && styles.roleOptOn]}>
                  <Text style={[styles.roleOptText, role === r && styles.roleOptTextOn]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {inviteErr ? <Text style={styles.err}>{inviteErr}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity testID="invite-cancel-btn" onPress={() => setInviteOpen(false)} disabled={inviting} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="invite-send-btn" onPress={doInvite} disabled={inviting || !name.trim() || !email.trim()} style={[styles.sendBtn, (inviting || !name.trim() || !email.trim()) && { opacity: 0.4 }]}>
                {inviting ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.sendText}>Send invite</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: font.h2, fontWeight: "800" },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inviteBtnText: { color: "#000", fontWeight: "800", fontSize: font.small },
  flash: { color: colors.accent, fontSize: font.small, textAlign: "center", paddingVertical: 8, backgroundColor: colors.accentDim },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  count: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  memberName: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  memberEmail: { color: colors.textSecondary, fontSize: font.small, marginTop: 1 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 },
  rolePill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rolePillText: { color: colors.textSecondary, fontSize: font.tiny, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusInvited: { borderColor: colors.accentBorder },
  statusJoined: { borderColor: "rgba(74,222,128,0.35)" },
  statusText: { fontSize: font.tiny, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  resendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  resendText: { color: colors.accent, fontSize: font.tiny, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl },
  modalTitle: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  modalSub: { color: colors.textSecondary, fontSize: font.small, marginTop: 4 },
  label: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1.2, marginTop: spacing.lg, marginBottom: 6 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: font.body,
  },
  roleToggle: { flexDirection: "row", gap: spacing.sm },
  roleOpt: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: "center",
  },
  roleOptOn: { borderColor: colors.accentBorder, backgroundColor: colors.accentDim },
  roleOptText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "700", textTransform: "capitalize" },
  roleOptTextOn: { color: colors.accent },
  err: { color: colors.danger, fontSize: font.small, marginTop: spacing.md },
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl },
  cancelBtn: { flex: 1, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingVertical: 13, alignItems: "center" },
  cancelText: { color: colors.textSecondary, fontWeight: "700", fontSize: font.body },
  sendBtn: { flex: 1, borderRadius: radius.pill, backgroundColor: colors.accent, paddingVertical: 13, alignItems: "center" },
  sendText: { color: "#000", fontWeight: "800", fontSize: font.body },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, paddingTop: spacing.sm },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
  sheetTitle: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  sheetSub: { color: colors.textSecondary, fontSize: font.small, marginTop: 1 },
  sheetClose: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceHover },
  tlCenter: { paddingVertical: spacing.xl, alignItems: "center" },
  tlEmpty: { color: colors.textMuted, fontSize: font.small, paddingVertical: spacing.lg, lineHeight: 20 },
  tlRow: { flexDirection: "row", gap: spacing.md },
  tlRail: { alignItems: "center", width: 24 },
  tlDot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tlLine: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  tlLabel: { fontSize: font.small, fontWeight: "800" },
  tlTime: { color: colors.textMuted, fontSize: font.tiny, marginTop: 1 },
  tlReason: { color: colors.textSecondary, fontSize: font.tiny, marginTop: 3, fontStyle: "italic" },
  tlResendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 13,
    marginTop: spacing.md,
  },
  tlResendText: { color: "#000", fontWeight: "800", fontSize: font.body },
});
