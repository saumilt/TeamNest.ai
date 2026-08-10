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
  getOfferings,
  purchasePackage,
  restorePurchases,
} from "@/src/lib/revenuecat";
import { colors, font, radius, spacing } from "@/src/theme";

const WEB_BILLING_URL = "https://teamnest.ai/billing";

// Display catalog used when live RevenueCat offerings aren't available (web
// preview / before store keys are wired). Prices are the marked-up store
// prices; on a real build these are replaced by the store's priceStrings.
const SAMPLE_PLANS = [
  { plan: "student", title: "Student", monthly: "$8.49", annual: "$84.99", blurb: "Solo plan for students (.edu verified)." },
  { plan: "pro", title: "Pro", monthly: "$11.99", annual: "$119.99", blurb: "Compare models, more credits & tools." },
  { plan: "team", title: "Team", monthly: "$23.99", annual: "$239.99", blurb: "For whole teams. Unlimited transcription." },
];
const SAMPLE_CREDITS = [
  { id: "credits_1000", title: "1,000 Credits", price: "$2.49" },
  { id: "credits_5000", title: "5,000 Credits", price: "$9.99" },
  { id: "credits_15000", title: "15,000 Credits", price: "$23.99" },
];

type Duration = "monthly" | "annual";

export default function Paywall() {
  const insets = useSafeAreaInsets();
  const [offerings, setOfferings] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState<Duration>("monthly");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [off, u] = await Promise.all([
        getOfferings(),
        apiGet("/api/billing/usage").catch(() => null),
      ]);
      setOfferings(off);
      setUsage(u);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3500); };

  // ---- derive plan rows from live offerings, else fall back to sample ----
  const livePkgs: any[] = offerings?.current?.availablePackages ?? [];
  const liveByKey: Record<string, any> = {};
  for (const p of livePkgs) {
    const id: string = p.product?.identifier || p.identifier || "";
    liveByKey[id] = p;
  }
  const usingSample = livePkgs.length === 0;

  const planRows = SAMPLE_PLANS.map((s) => {
    const mPkg = liveByKey[`${s.plan}_monthly`];
    const aPkg = liveByKey[`${s.plan}_annual`];
    return {
      plan: s.plan,
      title: s.title,
      blurb: s.blurb,
      monthly: { pkg: mPkg, price: mPkg?.product?.priceString || s.monthly },
      annual: { pkg: aPkg, price: aPkg?.product?.priceString || s.annual },
    };
  });

  const liveCredits: any[] = offerings?.all?.credits?.availablePackages ?? [];
  const creditRows = liveCredits.length
    ? liveCredits.map((p) => ({ id: p.product?.identifier || p.identifier, title: p.product?.title || p.identifier, price: p.product?.priceString || "", pkg: p }))
    : SAMPLE_CREDITS.map((c) => ({ ...c, pkg: undefined as any }));

  const currentPlan = usage?.plan_id || "free";

  const buy = async (pkg: any, id: string) => {
    if (!pkg) { flash("Available once the app is published to the store."); return; }
    setBusyId(id);
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
          <Text style={styles.hero}>Do more with TeamNest</Text>
          <Text style={styles.currentPlan} testID="paywall-current-plan">
            {"You're on "}<Text style={{ color: colors.accent, fontWeight: "800" }}>{String(currentPlan).toUpperCase()}</Text>
          </Text>

          {/* Monthly / Yearly toggle */}
          <View style={styles.toggle} testID="paywall-duration-toggle">
            {(["monthly", "annual"] as Duration[]).map((d) => (
              <TouchableOpacity
                key={d}
                testID={`paywall-toggle-${d}`}
                onPress={() => setDuration(d)}
                style={[styles.toggleBtn, duration === d && styles.toggleBtnActive]}
                activeOpacity={0.85}
              >
                <Text style={[styles.toggleText, duration === d && styles.toggleTextActive]}>
                  {d === "monthly" ? "Monthly" : "Yearly"}
                </Text>
                {d === "annual" ? (
                  <View style={styles.saveTag}><Text style={styles.saveTagText}>2 MONTHS FREE</Text></View>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>

          {/* Plan cards */}
          {planRows.map((row) => {
            const opt = duration === "monthly" ? row.monthly : row.annual;
            const isCurrent = currentPlan === row.plan;
            const id = `${row.plan}_${duration}`;
            return (
              <View key={row.plan} style={[styles.planCard, row.plan === "pro" && styles.planCardHighlight]} testID={`plan-${row.plan}`}>
                {row.plan === "pro" ? <View style={styles.popular}><Text style={styles.popularText}>MOST POPULAR</Text></View> : null}
                <View style={styles.planTop}>
                  <Text style={styles.planTitle}>{row.title}</Text>
                  <Text style={styles.planPrice}>{opt.price}<Text style={styles.planPer}>{duration === "monthly" ? " /mo" : " /yr"}</Text></Text>
                </View>
                <Text style={styles.planBlurb}>{row.blurb}</Text>
                <TouchableOpacity
                  testID={`buy-${id}`}
                  onPress={() => buy(opt.pkg, id)}
                  disabled={!!busyId || isCurrent}
                  style={[styles.planBtn, (row.plan === "pro") && styles.planBtnPrimary, isCurrent && styles.planBtnCurrent]}
                  activeOpacity={0.85}
                >
                  {busyId === id ? (
                    <ActivityIndicator size="small" color={row.plan === "pro" ? "#09090b" : colors.textPrimary} />
                  ) : (
                    <Text style={[styles.planBtnText, row.plan === "pro" && { color: "#09090b" }]}>
                      {isCurrent ? "Current plan" : `Choose ${row.title}`}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Credit packs */}
          <Text style={styles.section}>ONE-TIME CREDIT PACKS</Text>
          <View style={styles.card}>
            {creditRows.map((c) => (
              <View key={c.id} style={styles.creditRow} testID={`credit-${c.id}`}>
                <Text style={styles.creditTitle}>{c.title}</Text>
                <Text style={styles.creditPrice}>{c.price}</Text>
                <TouchableOpacity
                  testID={`buy-${c.id}`}
                  onPress={() => buy(c.pkg, c.id)}
                  disabled={!!busyId}
                  style={styles.creditBtn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.creditBtnText}>Buy</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Pricing-context note per store policy */}
          {Platform.OS === "android" ? (
            <TouchableOpacity
              testID="paywall-web-discount"
              onPress={() => Linking.openURL(WEB_BILLING_URL).catch(() => {})}
              activeOpacity={0.85}
              style={[styles.noteCard, styles.discountCard]}
            >
              <Ionicons name="pricetag" size={16} color={colors.success} />
              <Text style={styles.discountText}>Save ~20% — the same plans are cheaper on teamnest.ai.</Text>
            </TouchableOpacity>
          ) : Platform.OS === "ios" ? (
            <View style={[styles.noteCard, styles.feeCard]} testID="paywall-fee-note">
              <Ionicons name="information-circle" size={16} color={colors.textMuted} />
              <Text style={styles.feeText}>Prices shown include the App Store fee.</Text>
            </View>
          ) : null}

          {usingSample ? (
            <Text style={styles.previewNote} testID="paywall-preview-note">
              Preview pricing — live store prices appear in the published app.
            </Text>
          ) : null}

          <TouchableOpacity testID="paywall-restore" onPress={restore} disabled={restoring} style={styles.secondaryBtn}>
            {restoring ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <Text style={styles.secondaryText}>Restore purchases</Text>}
          </TouchableOpacity>
          <TouchableOpacity testID="paywall-manage" onPress={manage} style={styles.linkBtn}>
            <Text style={styles.linkText}>Manage subscription</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: font.h2, fontWeight: "800" },
  flash: { color: colors.accent, fontSize: font.small, textAlign: "center", paddingVertical: 8, backgroundColor: colors.accentDim },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { color: colors.textPrimary, fontSize: 24, fontWeight: "900", marginBottom: 2 },
  currentPlan: { color: colors.textSecondary, fontSize: font.small, marginBottom: spacing.lg },
  toggle: { flexDirection: "row", backgroundColor: colors.bgElevated, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  toggleBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.pill },
  toggleBtnActive: { backgroundColor: colors.accent },
  toggleText: { color: colors.textSecondary, fontWeight: "800", fontSize: font.small },
  toggleTextActive: { color: "#09090b" },
  saveTag: { backgroundColor: "rgba(9,9,11,0.18)", borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  saveTagText: { color: "#09090b", fontSize: 9, fontWeight: "900" },
  planCard: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  planCardHighlight: { borderColor: colors.accent },
  popular: { alignSelf: "flex-start", backgroundColor: colors.accentDim, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 8 },
  popularText: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  planTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  planTitle: { color: colors.textPrimary, fontSize: font.h2, fontWeight: "800" },
  planPrice: { color: colors.textPrimary, fontSize: 22, fontWeight: "900" },
  planPer: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  planBlurb: { color: colors.textMuted, fontSize: font.small, marginTop: 4, marginBottom: spacing.md },
  planBtn: { alignItems: "center", paddingVertical: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.accentBorder },
  planBtnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  planBtnCurrent: { backgroundColor: colors.surfaceHover, borderColor: colors.border },
  planBtnText: { color: colors.textPrimary, fontWeight: "800", fontSize: font.body },
  section: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  creditRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  creditTitle: { flex: 1, color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  creditPrice: { color: colors.textSecondary, fontSize: font.small, fontWeight: "800" },
  creditBtn: { backgroundColor: colors.accentDim, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8 },
  creditBtnText: { color: colors.accent, fontWeight: "800", fontSize: font.small },
  noteCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg, borderWidth: 1 },
  discountCard: { backgroundColor: "rgba(34,197,94,0.08)", borderColor: "rgba(34,197,94,0.35)" },
  discountText: { flex: 1, color: colors.textSecondary, fontSize: font.small },
  feeCard: { backgroundColor: colors.bgElevated, borderColor: colors.border },
  feeText: { flex: 1, color: colors.textMuted, fontSize: font.small },
  previewNote: { color: colors.textMuted, fontSize: font.tiny, fontStyle: "italic", textAlign: "center", marginTop: spacing.md },
  secondaryBtn: { alignItems: "center", paddingVertical: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, marginTop: spacing.lg },
  secondaryText: { color: colors.textSecondary, fontWeight: "700", fontSize: font.small },
  linkBtn: { alignItems: "center", paddingVertical: 14 },
  linkText: { color: colors.textMuted, fontSize: font.small, textDecorationLine: "underline" },
});
