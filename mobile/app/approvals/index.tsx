import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

export default function ApprovalInboxScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const isAdmin = ["owner", "admin"].includes(user?.role);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    apiGet("/api/automations/pending")
      .then((d) => setItems(d.items || []))
      .catch(() => {})
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { if (token) load(); }, [token, load]);

  const say = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 2400); };

  const decide = async (runId: string, action: "approve" | "reject") => {
    setActingId(runId);
    try {
      const run = await apiPost(`/api/automations/runs/${runId}/${action}`, {});
      say(action === "approve" ? `Approved · ${run.status}` : "Rejected");
      load();
    } catch (e: any) {
      say(e?.message || "Couldn't update");
    } finally { setActingId(null); }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="approvals-back" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Approval Inbox</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        testID="mobile-approvals"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
      >
        <Text style={styles.sub}>
          Automations waiting on a decision. {isAdmin ? "Approve to run now, or reject to cancel." : "An owner or admin approves these."}
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={styles.empty} testID="approvals-empty">
            <Ionicons name="shield-checkmark" size={34} color={colors.success} />
            <Text style={styles.emptyTitle}>You're all caught up</Text>
            <Text style={styles.emptySub}>No automations are waiting for approval.</Text>
          </View>
        ) : (
          items.map((p) => (
            <View key={p.id} style={styles.card} testID={`inbox-item-${p.id}`}>
              <View style={styles.cardHead}>
                <Ionicons name="alert-circle" size={16} color="#f59e0b" />
                <Text style={styles.cardName} numberOfLines={1}>{p.automation_name}</Text>
              </View>
              <Text style={styles.cardSummary}>{p.reasoning_summary}</Text>
              <Text style={styles.cardMeta}>Triggered {p.trigger_source} · {String(p.risk).toUpperCase()} risk</Text>
              {isAdmin ? (
                <View style={styles.btnRow}>
                  <Pressable testID={`inbox-approve-${p.id}`} disabled={actingId === p.id} style={styles.approveBtn} onPress={() => decide(p.id, "approve")}>
                    <Ionicons name="checkmark" size={14} color="#09090b" />
                    <Text style={styles.approveText}>Approve & run</Text>
                  </Pressable>
                  <Pressable testID={`inbox-reject-${p.id}`} disabled={actingId === p.id} style={styles.rejectBtn} onPress={() => decide(p.id, "reject")}>
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                    <Text style={styles.rejectText}>Reject</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        )}
        {msg ? <Text style={styles.flash} testID="approvals-flash">{msg}</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  headerTitle: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: font.body, marginBottom: spacing.lg },
  empty: { alignItems: "center", marginTop: spacing.xl, gap: 6 },
  emptyTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700", marginTop: 8 },
  emptySub: { color: colors.textMuted, fontSize: font.small },
  card: { backgroundColor: "rgba(245,158,11,0.05)", borderWidth: 1, borderColor: "rgba(245,158,11,0.25)", borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardName: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800", flex: 1 },
  cardSummary: { color: colors.textSecondary, fontSize: font.small, marginTop: 4 },
  cardMeta: { color: colors.textMuted, fontSize: font.tiny, marginTop: 4, textTransform: "capitalize" },
  btnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  approveBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.success, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  approveText: { color: "#09090b", fontWeight: "800", fontSize: font.small },
  rejectBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  rejectText: { color: colors.textSecondary, fontWeight: "700", fontSize: font.small },
  flash: { color: colors.textSecondary, fontSize: font.small, marginTop: spacing.md, textAlign: "center" },
});
