import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "@/src/api";
import {
  getCustomerInfo,
  getOfferings,
  iapAvailable,
  purchasePackage,
  restorePurchases,
} from "@/src/lib/revenuecat";
import { colors, font, radius, spacing } from "@/src/theme";

const WEB_BILLING_URL = "https://teamnest.ai/billing";

export default function Paywall() {
  const insets = useSafeAreaInsets();
  const [offerings, setOfferings] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const available = iapAvailable();

  const load = useCallback(async () => {
    try {
      const [off, u] = await Promise.all([
        getOfferings(),
        apiGet("/api/billing/usage").catch(() => null),
      ]);
      setOfferings(off);
      setUsage(u);
      await getCustomerInfo();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3500); };

  const buy = async (pkg: any) => {
    setBusyId(pkg.identifier);
    try {
      await purchasePackage(pkg);
      await apiPost("/api/billing/iap/sync", {}).catch(() => {});
      flash("Purchase complete — your plan is now active.");
      await load();
    } catch (e: any) {
      if (!e?.userCancelled) flash(e?.message || "Purchase failed. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const restore = async () => {
    setRestoring(true);
    try {
      await restorePurchases();
      await apiPost("/api/billing/iap/sync", {}).catch(() => {});
      flash("Purchases restored.");
      await load();
    } catch {
      flash("No purchases to restore.");
    } finally {
      setRestoring(false);
    }
  };

  const manage = () => {
    const url = Platform.OS === "ios"
      ? "https://apps.apple.com/account/subscriptions"
      : "https://play.google.com/store/account/subscriptions";
    Linking.openURL(url).catch(() => {});
  };

  const subs: any[] = offerings?.current?.availablePackages ?? [];
  const creditPkgs: any[] = offerings?.all?.credits?.availablePackages ?? [];
  const currentPlan = usage?.plan_id || "free";

  const renderPackage = (pkg: any, kind: "sub" | "credit") => {
    const p = pkg.product || {};
    const active = kind === "sub" && p.identifier?.startsWith(currentPlan);
    return (
      <View key={pkg.identifier} style={styles.pkgRow} testID={`pkg-${pkg.identifier}`}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.pkgTitle}>{p.title || pkg.identifier}</Text>
          {p.description ? <Text style={styles.pkgDesc} numberOfLines={2}>{p.description}</Text> : null}
        </View>
        <Text style={styles.pkgPrice}>{p.priceString || ""}</Text>
        <TouchableOpacity
          testID={`buy-${pkg.identifier}`}
          onPress={() => buy(pkg)}
          disabled={!!busyId || active}
          style={[styles.buyBtn, (active) && styles.buyBtnActive]}
          activeOpacity={0.85}
        >
          {busyId === pkg.identifier ? (
            <ActivityIndicator size="small" color="#09090b" />
          ) : (
            <Text style={styles.buyText}>{active ? "Current" : kind === "sub" ? "Subscribe" : "Buy"}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <TouchableOpacity testID="paywall-back" onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Upgrade</Text>
        <View style={{ width: 40 }} />
      </View>

      {msg ? <Text style={styles.flash} testID="paywall-flash">{msg}</Text> : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
          <Text style={styles.currentPlan} testID="paywall-current-plan">
            Current plan: <Text style={{ color: colors.accent }}>{String(currentPlan).toUpperCase()}</Text>
          </Text>

          {/* Pricing-context message — per store policy */}
          {Platform.OS === "android" ? (
            <TouchableOpacity
              testID="paywall-web-discount"
              onPress={() => Linking.openURL(WEB_BILLING_URL).catch(() => {})}
              activeOpacity={0.85}
              style={[styles.noteCard, styles.discountCard]}
            >
              <Ionicons name="pricetag" size={18} color={colors.success} />
              <Text style={styles.discountText}>
                Save ~20% — the same plans are cheaper on <Text style={{ fontWeight: "800" }}>teamnest.ai</Text>. Tap to open the web checkout.
              </Text>
            </TouchableOpacity>
          ) : Platform.OS === "ios" ? (
            <View style={[styles.noteCard, styles.feeCard]} testID="paywall-fee-note">
              <Ionicons name="information-circle" size={18} color={colors.textMuted} />
              <Text style={styles.feeText}>Prices shown include the App Store fee.</Text>
            </View>
          ) : null}

          {!available ? (
            <View style={styles.unavailable} testID="paywall-unavailable">
              <Ionicons name="phone-portrait-outline" size={22} color={colors.textMuted} />
              <Text style={styles.unavailableTitle}>In-app purchases open in the app</Text>
              <Text style={styles.unavailableSub}>
                Subscriptions are available in the TeamNest iOS / Android app. You can also subscribe on the web for the discounted price.
              </Text>
              <TouchableOpacity
                testID="paywall-open-web"
                onPress={() => Linking.openURL(WEB_BILLING_URL).catch(() => {})}
                style={styles.webBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.webBtnText}>Subscribe on the web</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.section}>PLANS</Text>
              <View style={styles.card}>
                {subs.length === 0 ? (
                  <Text style={styles.empty}>No plans available right now.</Text>
                ) : (
                  subs.map((p) => renderPackage(p, "sub"))
                )}
              </View>

              {creditPkgs.length > 0 ? (
                <>
                  <Text style={styles.section}>CREDIT PACKS</Text>
                  <View style={styles.card}>
                    {creditPkgs.map((p) => renderPackage(p, "credit"))}
                  </View>
                </>
              ) : null}

              <TouchableOpacity testID="paywall-restore" onPress={restore} disabled={restoring} style={styles.secondaryBtn}>
                {restoring ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <Text style={styles.secondaryText}>Restore purchases</Text>}
              </TouchableOpacity>
              <TouchableOpacity testID="paywall-manage" onPress={manage} style={styles.linkBtn}>
                <Text style={styles.linkText}>Manage subscription</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}
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
  flash: { color: colors.accent, fontSize: font.small, textAlign: "center", paddingVertical: 8, backgroundColor: colors.accentDim },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  currentPlan: { color: colors.textSecondary, fontSize: font.body, fontWeight: "700", marginBottom: spacing.md },
  noteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  discountCard: { backgroundColor: "rgba(34,197,94,0.08)", borderColor: "rgba(34,197,94,0.35)" },
  discountText: { flex: 1, color: colors.textSecondary, fontSize: font.small, lineHeight: 18 },
  feeCard: { backgroundColor: colors.bgElevated, borderColor: colors.border },
  feeText: { flex: 1, color: colors.textMuted, fontSize: font.small },
  unavailable: { alignItems: "center", gap: spacing.sm, padding: spacing.xl },
  unavailableTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800", marginTop: spacing.sm },
  unavailableSub: { color: colors.textMuted, fontSize: font.small, textAlign: "center", lineHeight: 20 },
  webBtn: { marginTop: spacing.md, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 22, paddingVertical: 12 },
  webBtnText: { color: "#09090b", fontWeight: "800", fontSize: font.body },
  section: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1, marginBottom: spacing.sm, marginTop: spacing.sm },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: spacing.lg,
  },
  empty: { color: colors.textMuted, fontSize: font.small, padding: spacing.md, fontStyle: "italic" },
  pkgRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  pkgTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  pkgDesc: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2 },
  pkgPrice: { color: colors.textSecondary, fontSize: font.small, fontWeight: "800" },
  buyBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9, minWidth: 84, alignItems: "center" },
  buyBtnActive: { backgroundColor: colors.surfaceHover },
  buyText: { color: "#09090b", fontWeight: "800", fontSize: font.small },
  secondaryBtn: { alignItems: "center", paddingVertical: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm },
  secondaryText: { color: colors.textSecondary, fontWeight: "700", fontSize: font.small },
  linkBtn: { alignItems: "center", paddingVertical: 14 },
  linkText: { color: colors.textMuted, fontSize: font.small, textDecorationLine: "underline" },
});
