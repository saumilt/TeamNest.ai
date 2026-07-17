// Shared primitives for the mobile Role Intelligence module — mirrors the web
// ContinuityBar / RiskBadge / Stat so both surfaces feel like one product.
import { StyleSheet, Text, View } from "react-native";
import { colors, font, radius, spacing } from "@/src/theme";

export const RISK_COLORS: Record<string, string> = {
  Critical: "#f87171", High: "#fb923c", Medium: "#fbbf24", Low: "#4ade80", Unknown: colors.textMuted,
};

export const FLAG_COLORS: Record<string, string> = {
  "Departing": "#fb923c",
  "Single-person dependency": "#f87171",
  "No successor": "#fbbf24",
  "No backup": colors.textMuted,
  "High unique knowledge": colors.accent,
};

export function ContinuityBar({ score, width = 74 }: { score: number; width?: number }) {
  const s = Math.max(0, Math.min(100, score || 0));
  const c = s >= 70 ? colors.success : s >= 45 ? colors.accent : colors.danger;
  return (
    <View style={{ width }}>
      <View style={eui.track}><View style={[eui.fill, { width: `${s}%`, backgroundColor: c }]} /></View>
      <Text style={eui.barLabel}>{s}%</Text>
    </View>
  );
}

export function RiskBadge({ level }: { level: string }) {
  const c = RISK_COLORS[level] || colors.textMuted;
  return (
    <View style={[eui.badge, { borderColor: c }]}>
      <Text style={[eui.badgeText, { color: c }]}>{level}</Text>
    </View>
  );
}

export function FlagChip({ label }: { label: string }) {
  const c = FLAG_COLORS[label] || colors.textMuted;
  return (
    <View style={[eui.flag, { backgroundColor: `${c}22` }]}>
      <Text style={[eui.flagText, { color: c }]}>{label}</Text>
    </View>
  );
}

export function Freshness({ freshness }: { freshness?: any }) {
  const last = freshness?.last_captured_at;
  if (!last) return (
    <View testID="freshness-none" style={[eui.flag, { backgroundColor: colors.surfaceHover }]}>
      <Text style={[eui.flagText, { color: colors.textMuted }]}>No knowledge yet</Text>
    </View>
  );
  const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  const stale = days > 90;
  const label = days <= 0 ? "today" : days === 1 ? "1d ago" : days < 30 ? `${days}d ago` : `~${Math.round(days / 30)}mo ago`;
  const c = stale ? "#fbbf24" : "#4ade80";
  return (
    <View testID="freshness-pill" style={[eui.flag, { backgroundColor: `${c}22` }]}>
      <Text style={[eui.flagText, { color: c }]}>{stale ? "Stale · " : "Updated "}{label}</Text>
    </View>
  );
}

export function Stat({ label, value, testID }: { label: string; value: any; testID?: string }) {
  return (
    <View style={eui.stat} testID={testID}>
      <Text style={eui.statVal}>{value}</Text>
      <Text style={eui.statLabel}>{label}</Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: any }) {
  return <Text style={eui.section}>{children}</Text>;
}

export const eui = StyleSheet.create({
  track: { height: 5, borderRadius: 999, backgroundColor: colors.surfaceHover, overflow: "hidden" },
  fill: { height: "100%" },
  barLabel: { color: colors.textMuted, fontSize: 10, marginTop: 3, textAlign: "right" },
  badge: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  flag: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  flagText: { fontSize: 10, fontWeight: "700" },
  stat: { flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, minWidth: 96 },
  statVal: { color: colors.textPrimary, fontSize: font.h2, fontWeight: "800" },
  statLabel: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2 },
  section: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1.5, marginTop: spacing.xl, marginBottom: spacing.sm },
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
});
