import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { apiGet } from "@/src/api";
import { colors, font, radius, spacing } from "@/src/theme";

const SCOPE_LABEL: Record<string, string> = {
  user: "Per user",
  chat: "Per chat",
  workspace: "Whole workspace",
  enterprise: "Enterprise (org-wide)",
};

type Cap = {
  scope: string;
  scope_id: string;
  label?: string;
  limit_credits: number;
  used: number;
  pct: number;
};

/** Read-only view of a workspace's AI credit limits (owner/admin only).
 *  Editing lives on the web Billing page. Self-hides for members / no caps. */
export function CreditLimitsCard() {
  const [caps, setCaps] = useState<Cap[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await apiGet("/api/credit-governance/caps");
        setCaps(d?.caps || []);
      } catch {
        setCaps([]); // 403 for members → hidden
      }
    })();
  }, []);

  if (!caps || caps.length === 0) return null;

  return (
    <View style={styles.card} testID="mobile-credit-limits">
      <View style={styles.head}>
        <Ionicons name="speedometer-outline" size={16} color={colors.accent} />
        <Text style={styles.title}>AI credit limits</Text>
      </View>
      <Text style={styles.sub}>Hard caps · most restrictive wins · resets monthly. Manage on the web.</Text>
      {caps.map((c) => {
        const pct = Math.min(100, c.pct || 0);
        const barColor = pct >= 100 ? "#ef4444" : pct >= 80 ? colors.accent : "#10b981";
        return (
          <View key={`${c.scope}:${c.scope_id}`} style={styles.row} testID={`mb-cap-${c.scope}`}>
            <View style={styles.rowTop}>
              <Text style={styles.rowLabel} numberOfLines={1}>
                {SCOPE_LABEL[c.scope]} · {c.label}
              </Text>
              <Text style={styles.rowVal}>{c.used}/{c.limit_credits}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct}%`, backgroundColor: barColor }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2, marginBottom: spacing.sm },
  row: { marginTop: spacing.sm },
  rowTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  rowLabel: { color: colors.textPrimary, fontSize: font.small, flex: 1, marginRight: 8 },
  rowVal: { color: colors.textMuted, fontSize: font.tiny },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
});
