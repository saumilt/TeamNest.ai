import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/src/components/Avatar";
import { CreditsBadge } from "@/src/components/CreditsBadge";
import { CreditLimitsCard } from "@/src/components/CreditLimitsCard";
import { NotificationBell } from "@/src/components/NotificationBell";
import { apiDelete, apiGet } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

const LEGAL_LINKS = [
  { icon: "shield-checkmark-outline", label: "Privacy Policy", url: "https://teamnest.ai/privacy" },
  { icon: "document-text-outline", label: "Terms of Service", url: "https://teamnest.ai/terms" },
  { icon: "help-buoy-outline", label: "Help & Support", url: "https://teamnest.ai/support" },
];

// Mirrors the web landing "What's New" — Dev OS (development) and enterprise
// employee memory are featured first per product priority.
const WHATS_NEW = [
  {
    key: "dev-os",
    icon: "rocket-outline",
    tag: "Dev OS",
    title: "@devmanager builds working apps",
    body: "Describe an app in plain English inside any chat. @devmanager plans, builds, browser-tests and ships it — no code, no sub-agents.",
    to: "/(tabs)",
  },
  {
    key: "role-intel",
    icon: "shield-checkmark-outline",
    tag: "Enterprise",
    title: "Role Intelligence",
    body: "Capture a role's approved work as institutional memory and hand it to a successor — identity-safe. Ask the previous role, expertise & risk maps.",
    to: "/enterprise",
  },
  {
    key: "ai-memory",
    icon: "sparkles-outline",
    tag: "Memory",
    title: "AI Memory that learns",
    body: "Like ChatGPT memory, but for your team. AI learns durable personal & workspace preferences from your chats. Say \u201c@ai remember …\u201d — you stay in control.",
    to: "/memory",
  },
  {
    key: "connectors",
    icon: "git-network-outline",
    tag: "New",
    title: "Apps",
    body: "Connect your tools — Zapier (6,000+ apps), Gmail, Microsoft 365 — with plain-English Read/Act consent. Send events out and receive them in.",
    to: "/apps",
  },
];

export default function YouScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState("");

  const isAdmin = ["owner", "admin"].includes(user?.role);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    apiGet("/api/automations/pending").then((d) => setPendingApprovals((d.items || []).length)).catch(() => {});
  }, [isAdmin]);

  const activeWs =
    (user?.workspaces || []).find((w: any) => w.id === user?.workspace_id) ||
    (user?.workspaces || [])[0];

  const doLogout = async () => {
    setBusy(true);
    await logout();
    router.replace("/(auth)/login");
  };

  const canDelete = password.length > 0 && confirm.trim().toUpperCase() === "DELETE";

  const doDelete = async () => {
    if (!canDelete || deleting) return;
    setDeleting(true);
    setDelError("");
    try {
      await apiDelete("/api/auth/me", { password, confirm: "DELETE" });
      setDelOpen(false);
      await logout();
      router.replace("/(auth)/login");
    } catch (e: any) {
      setDelError(e.message || "Could not delete account");
      setDeleting(false);
    }
  };

  const Row = ({ icon, label, value }: { icon: any; label: string; value?: string }) => (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value || "—"}
      </Text>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: 60 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg }}>
        <Text style={[styles.h1, { marginBottom: 0 }]}>You</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <NotificationBell />
          <CreditsBadge />
        </View>
      </View>

      <View style={styles.profileCard}>
        <Avatar name={user?.name} size={72} />
        <Text style={styles.name}>{user?.name || "TeamNest user"}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        {user?.role ? (
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user.role}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Row icon="business-outline" label="Workspace" value={activeWs?.name} />
        <View style={styles.divider} />
        <Row icon="mail-outline" label="Email" value={user?.email} />
        <View style={styles.divider} />
        <Row
          icon="people-outline"
          label="Workspaces"
          value={String((user?.workspaces || []).length)}
        />
      </View>

      <View style={[styles.card, { marginTop: spacing.lg }]}>
        <TouchableOpacity testID="you-team" style={styles.linkRow} onPress={() => router.push("/team")}>
          <Ionicons name="people-outline" size={18} color={colors.accent} />
          <Text style={styles.linkLabel}>Team & Members</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        {isAdmin ? (
          <>
            <View style={styles.divider} />
            <TouchableOpacity testID="you-approvals" style={styles.linkRow} onPress={() => router.push("/approvals")}>
              <Ionicons name="file-tray-full-outline" size={18} color={colors.accent} />
              <Text style={styles.linkLabel}>Approval Inbox</Text>
              {pendingApprovals > 0 ? (
                <View style={styles.badge} testID="you-approvals-badge"><Text style={styles.badgeText}>{pendingApprovals > 9 ? "9+" : pendingApprovals}</Text></View>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </>
        ) : null}
      </View>

      <CreditLimitsCard />

      {/* Brand positioning — mirrors the web landing hero */}
      <View style={styles.introCard} testID="brand-intro-card">
        <View style={styles.introPill}>
          <Ionicons name="sparkles" size={12} color={colors.accent} />
          <Text style={styles.introPillText}>Enterprise AI Intelligence</Text>
        </View>
        <Text style={styles.introTitle}>Your team&apos;s collective intelligence — kept forever.</Text>
        <Text style={styles.introBody}>
          Capture every role&apos;s expertise and retain it indefinitely, deploy specialized AI
          employees you design, and train new ones with agentic AI. When people move on, the
          intelligence stays.
        </Text>
        <View style={styles.introChips}>
          {["Institutional memory", "Specialized AI employees", "Agentic training"].map((c) => (
            <View key={c} style={styles.introChip}>
              <Text style={styles.introChipText}>{c}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* What's new — mirrors the web landing highlights */}
      <Text style={styles.sectionEyebrow}>Just shipped</Text>
      <Text style={styles.sectionTitle}>New in TeamNest</Text>
      <View style={{ gap: spacing.md }}>
        {WHATS_NEW.map((f) => (
          <TouchableOpacity
            key={f.key}
            testID={`whats-new-${f.key}`}
            activeOpacity={0.75}
            style={styles.newCard}
            onPress={() => router.push(f.to as any)}
          >
            <View style={styles.newCardHead}>
              <View style={styles.newIcon}>
                <Ionicons name={f.icon as any} size={18} color={colors.accent} />
              </View>
              <View style={styles.newTag}>
                <Text style={styles.newTagText}>{f.tag}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: "auto" }} />
            </View>
            <Text style={styles.newTitle}>{f.title}</Text>
            <Text style={styles.newBody}>{f.body}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* AI Employees */}
      <View style={[styles.card, { marginTop: spacing.md }]}>
        <TouchableOpacity testID="you-ai-hub" style={styles.linkRow} onPress={() => router.push("/ai")}>
          <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
          <Text style={styles.linkLabel}>AI Hub</Text>
          <Text style={styles.betaTag}>Ask · Do · Watch</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity testID="you-ai-builder" style={styles.linkRow} onPress={() => router.push("/builder")}>
          <Ionicons name="construct-outline" size={18} color={colors.accent} />
          <Text style={styles.linkLabel}>AI Employee Builder</Text>
          <Text style={styles.betaTag}>✦ Beta</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity testID="you-deployed" style={styles.linkRow} onPress={() => router.push("/builder/deployed")}>
          <Ionicons name="rocket-outline" size={18} color={colors.accent} />
          <Text style={styles.linkLabel}>Deployed Employees</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity testID="you-marketplace" style={styles.linkRow} onPress={() => router.push("/marketplace")}>
          <Ionicons name="storefront-outline" size={18} color={colors.accent} />
          <Text style={styles.linkLabel}>AI Employee Marketplace</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity testID="you-memory" style={styles.linkRow} onPress={() => router.push("/memory")}>
          <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
          <Text style={styles.linkLabel}>AI Memory</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity testID="you-documents" style={styles.linkRow} onPress={() => router.push("/documents")}>
          <Ionicons name="folder-open-outline" size={18} color={colors.accent} />
          <Text style={styles.linkLabel}>Documents</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity testID="you-ai-conversation" style={styles.linkRow} onPress={() => router.push("/settings/ai-conversation")}>
          <Ionicons name="chatbubbles-outline" size={18} color={colors.accent} />
          <Text style={styles.linkLabel}>AI Conversation Mode</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity testID="you-enterprise" style={styles.linkRow} onPress={() => router.push("/enterprise")}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent} />
          <Text style={styles.linkLabel}>Role Intelligence</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Legal & support */}
      <View style={[styles.card, { marginTop: spacing.md }]}>
        {LEGAL_LINKS.map((l, i) => (
          <View key={l.url}>
            {i > 0 && <View style={styles.divider} />}
            <TouchableOpacity
              testID={`legal-${l.label.split(" ")[0].toLowerCase()}`}
              style={styles.linkRow}
              onPress={() => Linking.openURL(l.url).catch(() => {})}
            >
              <Ionicons name={l.icon as any} size={18} color={colors.textMuted} />
              <Text style={styles.linkLabel}>{l.label}</Text>
              <Ionicons name="open-outline" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <TouchableOpacity
        testID="logout-btn"
        onPress={doLogout}
        disabled={busy}
        style={styles.logoutBtn}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.textPrimary} />
        <Text style={styles.logoutText}>Sign out</Text>
      </TouchableOpacity>

      <TouchableOpacity
        testID="delete-account-btn"
        onPress={() => { setDelError(""); setPassword(""); setConfirm(""); setDelOpen(true); }}
        style={styles.deleteBtn}
      >
        <Ionicons name="trash-outline" size={17} color={colors.danger} />
        <Text style={styles.deleteText}>Delete account</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>TeamNest.ai · mobile</Text>

      {/* Delete account modal */}
      <Modal visible={delOpen} transparent animationType="fade" onRequestClose={() => !deleting && setDelOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="delete-account-modal">
            <View style={styles.modalIcon}>
              <Ionicons name="warning-outline" size={22} color={colors.danger} />
            </View>
            <Text style={styles.modalTitle}>Delete your account?</Text>
            <Text style={styles.modalDesc}>
              This permanently deletes your account and personal data. Workspaces you
              solely own are deleted; shared ones are transferred. This can&apos;t be undone.
            </Text>

            <Text style={styles.modalLabel}>CURRENT PASSWORD</Text>
            <TextInput
              testID="delete-password-input"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              style={styles.modalInput}
            />
            <Text style={styles.modalLabel}>TYPE DELETE TO CONFIRM</Text>
            <TextInput
              testID="delete-confirm-input"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="DELETE"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              style={[styles.modalInput, { letterSpacing: 3 }]}
            />

            {delError ? <Text style={styles.modalError}>{delError}</Text> : null}

            <View style={styles.modalActions}>
              <TouchableOpacity
                testID="delete-cancel-btn"
                onPress={() => setDelOpen(false)}
                disabled={deleting}
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="delete-confirm-btn"
                onPress={doDelete}
                disabled={!canDelete || deleting}
                style={[styles.modalDelete, (!canDelete || deleting) && { opacity: 0.4 }]}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalDeleteText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800", marginBottom: spacing.lg },
  profileCard: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  name: { color: colors.textPrimary, fontSize: font.h2, fontWeight: "800", marginTop: spacing.sm },
  email: { color: colors.textSecondary, fontSize: font.body },
  roleBadge: {
    marginTop: spacing.xs,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  roleText: { color: colors.accent, fontSize: font.tiny, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  card: {
    marginTop: spacing.lg,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  infoLabel: { color: colors.textSecondary, fontSize: font.body, flex: 1 },
  infoValue: { color: colors.textPrimary, fontSize: font.body, fontWeight: "600", maxWidth: "50%" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  linkLabel: { color: colors.textPrimary, fontSize: font.body, flex: 1 },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: "#f59e0b", alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#09090b", fontSize: font.tiny, fontWeight: "800" },
  betaTag: { color: colors.accent, fontSize: font.tiny, fontWeight: "800" },
  sectionEyebrow: {
    color: colors.accent,
    fontSize: font.tiny,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginTop: spacing.xl,
  },
  introCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    padding: spacing.lg,
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  introPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: colors.accentDim,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  introPillText: { color: colors.accent, fontSize: font.tiny, fontWeight: "800", letterSpacing: 0.6 },
  introTitle: { color: colors.textPrimary, fontSize: font.h2, fontWeight: "800", marginTop: 4, lineHeight: 26 },
  introBody: { color: colors.textSecondary, fontSize: font.small, lineHeight: 20 },
  introChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  introChip: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  introChipText: { color: colors.textSecondary, fontSize: font.tiny, fontWeight: "700" },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: font.h2,
    fontWeight: "800",
    marginTop: 4,
    marginBottom: spacing.md,
  },
  newCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  newCardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  newIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.accentDim,
    alignItems: "center",
    justifyContent: "center",
  },
  newTag: {
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  newTagText: { color: colors.accent, fontSize: font.tiny, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  newTitle: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800", marginTop: 2 },
  newBody: { color: colors.textSecondary, fontSize: font.small, lineHeight: 20 },
  divider: { height: 1, backgroundColor: colors.borderSubtle },
  logoutBtn: {
    marginTop: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 15,
  },
  logoutText: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  deleteBtn: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 13,
  },
  deleteText: { color: colors.danger, fontSize: font.small, fontWeight: "700" },
  footer: { color: colors.textMuted, fontSize: font.tiny, textAlign: "center", marginTop: spacing.xl },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  modalIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: "rgba(248,113,113,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  modalTitle: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  modalDesc: { color: colors.textSecondary, fontSize: font.small, lineHeight: 20, marginTop: spacing.sm },
  modalLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1.2, marginTop: spacing.lg, marginBottom: 6 },
  modalInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: font.body,
  },
  modalError: { color: colors.danger, fontSize: font.small, marginTop: spacing.md },
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl },
  modalCancel: {
    flex: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    alignItems: "center",
  },
  modalCancelText: { color: colors.textSecondary, fontWeight: "700", fontSize: font.body },
  modalDelete: {
    flex: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    paddingVertical: 13,
    alignItems: "center",
  },
  modalDeleteText: { color: "#fff", fontWeight: "800", fontSize: font.body },
});
