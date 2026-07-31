import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { apiGet } from "@/src/api";
import { useAuth } from "@/src/auth";
import { getItem, setItem } from "@/src/storage";
import { radius, spacing } from "@/src/theme";

/**
 * BudgetNudge (mobile parity of the web banner). Proactively warns the current
 * user when they near an AI credit cap set by their workspace admin. Reads
 * `/api/credit-governance/my-budget` (tightest cap = `nearest`) and floats a
 * dismissible banner above the tab bar at >= 80% usage. Dismissal is per
 * threshold-bucket so crossing 80% -> 100% re-surfaces it.
 */
const NUDGE_AT = 80;
const DISMISS_KEY = "budget_nudge_dismissed";

export default function BudgetNudge() {
  const { token, loading } = useAuth();
  const [nearest, setNearest] = useState<any>(null);
  const [dismissedBucket, setDismissedBucket] = useState<string | null>(null);

  useEffect(() => {
    getItem(DISMISS_KEY).then((v) => setDismissedBucket(v || null));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const d = await apiGet("/api/credit-governance/my-budget");
      setNearest(d?.nearest || null);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    if (loading || !token) return;
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh, token, loading]);

  if (!nearest || nearest.pct < NUDGE_AT) return null;
  const maxed = nearest.pct >= 100;
  const bucket = maxed ? "100" : "80";
  if (dismissedBucket === bucket) return null;

  const dismiss = () => {
    setDismissedBucket(bucket);
    setItem(DISMISS_KEY, bucket);
  };

  const accent = maxed ? "#f87171" : "#fbbf24";

  return (
    <View style={styles.wrap} pointerEvents="box-none" testID="budget-nudge">
      <View
        style={[styles.card, { borderColor: maxed ? "rgba(248,113,113,0.4)" : "rgba(251,191,36,0.4)" }]}
        testID={`budget-nudge-${maxed ? "maxed" : "warn"}`}
      >
        <Ionicons name={maxed ? "alert-circle" : "speedometer"} size={18} color={accent} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: maxed ? "#fecaca" : "#fde68a" }]}>
            {maxed
              ? `You've used all of ${nearest.label} AI credit budget`
              : `You're at ${nearest.pct}% of ${nearest.label} AI credit budget`}
          </Text>
          <Text style={styles.usage} testID="budget-nudge-usage">
            {nearest.used.toLocaleString()} / {nearest.limit.toLocaleString()} credits this month
            {!maxed ? ` · ${nearest.remaining.toLocaleString()} left` : ""}
          </Text>
          <View style={styles.meter}>
            <View style={[styles.meterFill, { width: `${Math.min(100, nearest.pct)}%`, backgroundColor: accent }]} />
          </View>
          <Text style={styles.hint}>
            {maxed
              ? "AI is paused until your admin raises the cap or the monthly reset."
              : "AI pauses automatically once you hit 100%. Ask your admin to raise it if needed."}
          </Text>
        </View>
        <TouchableOpacity testID="budget-nudge-dismiss" onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.md, right: spacing.md, bottom: 96 },
  card: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.sm,
    backgroundColor: "rgba(20,20,22,0.97)", borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  title: { fontSize: 13, fontWeight: "700" },
  usage: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 2 },
  meter: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden", marginTop: 8 },
  meterFill: { height: "100%", borderRadius: 3 },
  hint: { color: "rgba(255,255,255,0.45)", fontSize: 10.5, marginTop: 8 },
});
