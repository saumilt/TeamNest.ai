import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { apiGet } from "@/src/api";
import { colors, radius } from "@/src/theme";

/**
 * CreditsBadge — persistent header pill showing remaining AI credits and the
 * current promo bonus %. Tapping "Credits" opens the in-app paywall, which
 * sells subscriptions + credit packs via native App Store / Play Billing
 * (mobile prices are ~20% higher than the web; the web stays discounted).
 */
export function CreditsBadge() {
  const [usage, setUsage] = useState<any | null>(null);
  const [bonusPct, setBonusPct] = useState(0);

  const load = useCallback(async () => {
    try {
      const [u, packs] = await Promise.all([
        apiGet("/api/billing/usage"),
        apiGet("/api/billing/credit-packs"),
      ]);
      setUsage(u);
      const promoOn = !!packs?.promo?.enabled;
      const maxBonus = Math.max(
        0,
        ...((packs?.packs || []).map((p: any) => Number(p.bonus_pct) || 0)),
      );
      setBonusPct(promoOn ? maxBonus : 0);
    } catch {
      /* best-effort */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!usage) return null;
  const unlimited = !!usage.unlimited;
  const remaining = unlimited ? "\u221e" : String(usage.credits_remaining ?? 0);

  const openBilling = () => {
    router.push("/paywall");
  };

  return (
    <View style={styles.wrap} testID="credits-badge">
      <View style={styles.flamePill}>
        <Ionicons name="flame" size={15} color="#10b981" />
        <Text style={styles.flameCount} testID="credits-badge-count">
          {remaining}
        </Text>
      </View>

      {!unlimited && (
        <TouchableOpacity
          style={styles.creditsPill}
          activeOpacity={0.85}
          onPress={openBilling}
          testID="credits-badge-buy"
        >
          <Ionicons name="sparkles" size={14} color="#09090b" />
          <Text style={styles.creditsText}>Credits</Text>
          {bonusPct > 0 && (
            <View style={styles.bonusPill} testID="credits-badge-bonus">
              <Text style={styles.bonusText}>{bonusPct}% more</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  flamePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ffffff",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    height: 32,
  },
  flameCount: { color: "#09090b", fontWeight: "800", fontSize: 13 },
  creditsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingLeft: 11,
    paddingRight: 5,
    height: 32,
  },
  creditsText: { color: "#09090b", fontWeight: "800", fontSize: 13 },
  bonusPill: {
    backgroundColor: "#ffffff",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 2,
  },
  bonusText: { color: "#09090b", fontWeight: "800", fontSize: 11 },
});
