import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiGet } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

const TYPE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  research: { icon: "sparkles", label: "Research" },
  approval: { icon: "shield-checkmark", label: "Approval" },
  knowledge: { icon: "bookmark", label: "Knowledge" },
};

/** Mobile AI Hub 'Activity' feed — research / approvals / knowledge, newest first. */
export default function ActivityPanel() {
  const { token } = useAuth();
  const [items, setItems] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiGet("/api/ai/activity");
      setItems(d.items || []);
    } catch { setItems([]); }
  }, []);

  useEffect(() => { if (token) load(); }, [token, load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (!items) return <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />;

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}
      testID="ai-activity-panel"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {items.length === 0 ? (
        <View style={styles.empty} testID="ai-activity-empty">
          <Ionicons name="pulse-outline" size={26} color={colors.textMuted} />
          <Text style={styles.emptyText}>No AI activity yet. Run research or an automation and it'll show up here.</Text>
        </View>
      ) : items.map((it, i) => {
        const m = TYPE_META[it.type] || { icon: "ellipse", label: it.type };
        const tappable = it.type === "research" && it.chat_id;
        return (
          <Pressable
            key={i}
            testID={`ai-activity-${i}`}
            disabled={!tappable}
            onPress={() => tappable && router.push(`/chat/${it.chat_id}`)}
            style={styles.row}
          >
            <View style={styles.icon}><Ionicons name={m.icon} size={15} color={colors.accent} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title} numberOfLines={2}>{it.title}</Text>
              <Text style={styles.meta}>{m.label} · {it.status}{it.at ? ` · ${new Date(it.at).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}</Text>
            </View>
            {tappable ? <Ionicons name="chevron-forward" size={15} color={colors.textMuted} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentDim, alignItems: "center", justifyContent: "center" },
  title: { color: colors.textPrimary, fontSize: font.small, fontWeight: "700" },
  meta: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2, textTransform: "capitalize" },
  empty: { alignItems: "center", gap: spacing.sm, padding: spacing.xl, backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", marginTop: spacing.lg },
  emptyText: { color: colors.textMuted, fontSize: font.small, textAlign: "center", lineHeight: 19 },
});
