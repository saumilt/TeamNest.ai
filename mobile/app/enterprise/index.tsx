import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { iapConsumablesAvailable, purchaseConsumableIap } from "@/src/lib/iap";
import { colors, font, radius, spacing } from "@/src/theme";
import { ContinuityBar, FlagChip, Freshness, RiskBadge, SectionTitle, Stat, eui } from "@/src/components/enterprise/ui";
import { useToast } from "@/src/components/Toast";

const TABS = ["Overview", "People", "Roles", "Risk", "Review", "Billing"];

function fmtBytes(b: number) {
  if (b == null) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(2)} MB`;
  return `${(b / 1024 ** 3).toFixed(3)} GB`;
}

export default function EnterpriseDashboard() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { show } = useToast();
  const [tab, setTab] = useState("Overview");
  const [gate, setGate] = useState(false);
  const [ov, setOv] = useState<any>(null);
  const [people, setPeople] = useState<any[] | null>(null);
  const [roles, setRoles] = useState<any[] | null>(null);
  const [risk, setRisk] = useState<any>(null);
  const [review, setReview] = useState<any[] | null>(null);
  const [billing, setBilling] = useState<any>(null);
  const [pending, setPending] = useState(0);
  const [openRole, setOpenRole] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [packBusy, setPackBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet("/api/enterprise/overview").then(setOv).catch((e) => { if (e.status === 403) setGate(true); });
    apiGet("/api/enterprise/people").then((d) => setPeople(d.people)).catch(() => setPeople([]));
    apiGet("/api/enterprise/roles").then((d) => setRoles(d.roles)).catch(() => setRoles([]));
    apiGet("/api/enterprise/memories/review").then((d) => setPending(d.pending_count || 0)).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { if (token) load(); }, [token, load]));

  const openTab = (t: string) => {
    setTab(t);
    if (t === "Risk" && !risk) apiGet("/api/enterprise/risk-dashboard").then(setRisk).catch(() => {});
    if (t === "Review" && !review) apiGet("/api/enterprise/memories/review").then((d) => { setReview(d.memories); setPending(d.pending_count || 0); }).catch(() => setReview([]));
    if (t === "Billing" && !billing) apiGet("/api/enterprise/billing").then(setBilling).catch(() => {});
  };

  const decide = async (m: any, decision: string) => {
    const e = edits[m.id] || {};
    try {
      await apiPost(`/api/enterprise/memories/${m.id}/decide`, { decision, title: e.title, content: e.content });
      setReview((xs) => (xs || []).filter((x) => x.id !== m.id));
      setPending((p) => Math.max(0, p - 1));
    } catch {}
  };

  const buyPack = async (packId: string, gb?: number) => {
    setPackBusy(packId);
    try {
      // Mobile digital goods must go through native IAP; the web preview (no
      // IAP) falls back to the direct backend grant so the flow stays testable.
      if (iapConsumablesAvailable()) {
        await purchaseConsumableIap("storage_pack", packId);
      } else {
        await apiPost("/api/enterprise/storage/packs/purchase", { pack_id: packId });
      }
      const b = await apiGet("/api/enterprise/billing"); setBilling(b);
      show(gb ? `${gb} GB storage added` : "Storage added");
    } catch {
      show("Purchase didn't complete", "error");
    } finally {
      setPackBusy(null);
    }
  };

  if (gate) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.center, { padding: spacing.xl }]}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.textMuted} />
          <Text style={styles.gateTitle}>Owners only</Text>
          <Text style={styles.gateText}>Role Intelligence is available to workspace owners. Ask your owner for access.</Text>
          <TouchableOpacity testID="ent-gate-back" onPress={() => router.back()} style={styles.primaryBtn}><Text style={styles.primaryBtnText}>Go back</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg }}>
        <View style={styles.headerRow}>
          <TouchableOpacity testID="ent-back" onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="chevron-back" size={22} color={colors.textSecondary} /></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Role Intelligence</Text>
            <Text style={styles.sub}>Institutional memory & continuity</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}>
          {TABS.map((t) => (
            <TouchableOpacity key={t} testID={`ent-tab-${t.toLowerCase()}`} onPress={() => openTab(t)} style={[styles.chip, tab === t && styles.chipOn]}>
              <Text style={[styles.chipText, tab === t && styles.chipTextOn]}>{t}</Text>
              {t === "Review" && pending > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{pending}</Text></View>}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}>
        {/* OVERVIEW */}
        {tab === "Overview" && (ov ? (
          <View>
            <View style={styles.statsRow}>
              <Stat label="Employees" value={ov.counts.employees} testID="ent-ov-emp" />
              <Stat label="Roles" value={ov.counts.roles} />
              <Stat label="At risk" value={ov.counts.at_risk} testID="ent-ov-atrisk" />
            </View>
            <SectionTitle>KNOWLEDGE RISK</SectionTitle>
            {ov.risk_preview.map((r: any, i: number) => (
              <View key={i} style={styles.rowCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{r.role || "—"}</Text>
                  <Text style={styles.rowMeta}>{r.employee_name} · unique: {r.unique_knowledge}</Text>
                </View>
                <ContinuityBar score={r.continuity_score} />
                <RiskBadge level={r.risk_level} />
              </View>
            ))}
          </View>
        ) : <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />)}

        {/* PEOPLE */}
        {tab === "People" && (people ? people.map((p) => (
          <TouchableOpacity key={p.id} testID={`ent-person-${p.id}`} onPress={() => router.push(`/enterprise/${p.id}`)} style={styles.rowCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{p.employee_name}</Text>
              <Text style={styles.rowMeta}>{p.role_name || "—"}{p.employment_status === "Departing" ? " · Departing" : ""}</Text>
            </View>
            <ContinuityBar score={p.continuity_score} />
            <RiskBadge level={p.risk_level} />
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )) : <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />)}

        {/* ROLES */}
        {tab === "Roles" && (roles ? roles.map((r) => (
          <View key={r.id} style={styles.rowCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{r.role_name}</Text>
              <Text style={styles.rowMeta}>{r.department || "—"}</Text>
              <View style={{ marginTop: 6, alignSelf: "flex-start" }}><Freshness freshness={r.freshness} /></View>
            </View>
            <ContinuityBar score={r.continuity_score} />
            <RiskBadge level={r.risk_level} />
          </View>
        )) : <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />)}

        {/* RISK */}
        {tab === "Risk" && (risk ? (
          <View>
            <View style={styles.statsRow}>
              <Stat label="At risk" value={risk.summary.at_risk} testID="ent-risk-atrisk" />
              <Stat label="Critical" value={risk.summary.critical} />
              <Stat label="Avg" value={`${risk.summary.avg_continuity}%`} />
            </View>
            <SectionTitle>EXPERTISE MAP</SectionTitle>
            {risk.roles.map((r: any) => (
              <View key={r.role_id} style={eui.card} testID={`ent-risk-role-${r.role_id}`}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => setOpenRole(openRole === r.role_id ? null : r.role_id)} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{r.role_name}</Text>
                    <View style={styles.flagWrap}>
                      {r.flags.length === 0 ? <FlagChip label="No flags" /> : r.flags.map((f: string) => <FlagChip key={f} label={f} />)}
                      <Freshness freshness={r.freshness} />
                    </View>
                  </View>
                  <ContinuityBar score={r.continuity_score} />
                  <RiskBadge level={r.risk_level} />
                </TouchableOpacity>
                {openRole === r.role_id && (
                  <View style={{ marginTop: spacing.md, gap: 6 }} testID={`ent-risk-breakdown-${r.role_id}`}>
                    {Object.entries(r.breakdown).map(([k, v]: any) => (
                      <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                        <Text style={styles.bdLabel}>{k.replace(/_score$/, "").replace(/_/g, " ")}</Text>
                        <View style={[eui.track, { flex: 1 }]}><View style={[eui.fill, { width: `${v}%`, backgroundColor: v >= 60 ? colors.success : v >= 40 ? colors.accent : colors.danger }]} /></View>
                        <Text style={styles.bdVal}>{v}%</Text>
                      </View>
                    ))}
                    {r.person_id && (
                      <TouchableOpacity testID={`ent-risk-view-${r.role_id}`} onPress={() => router.push(`/enterprise/${r.person_id}`)} style={styles.miniBtn}>
                        <Text style={styles.miniBtnText}>View {r.person_name || "profile"}</Text>
                        <Ionicons name="arrow-forward" size={13} color="#09090b" />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
        ) : <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />)}

        {/* REVIEW */}
        {tab === "Review" && (review ? (review.length === 0 ? (
          <View style={styles.empty}><Ionicons name="file-tray-outline" size={26} color={colors.textMuted} /><Text style={styles.emptyText}>No proposed knowledge to review.</Text></View>
        ) : review.map((m) => {
          const e = edits[m.id] || { title: m.title, content: m.content };
          return (
            <View key={m.id} style={eui.card} testID={`ent-review-${m.id}`}>
              <View style={styles.flagWrap}>
                <View style={styles.tag}><Text style={styles.tagText}>{m.role_name}</Text></View>
                <View style={styles.tagDim}><Text style={styles.tagDimText}>{m.memory_type}</Text></View>
              </View>
              <TextInput testID={`ent-review-title-${m.id}`} value={e.title} onChangeText={(t) => setEdits({ ...edits, [m.id]: { ...e, title: t } })} style={styles.reviewTitle} />
              <TextInput testID={`ent-review-content-${m.id}`} value={e.content} multiline onChangeText={(t) => setEdits({ ...edits, [m.id]: { ...e, content: t } })} style={styles.reviewBody} />
              <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end", marginTop: spacing.sm }}>
                <TouchableOpacity testID={`ent-review-reject-${m.id}`} onPress={() => decide(m, "reject")} style={styles.rejectBtn}><Text style={styles.rejectText}>Reject</Text></TouchableOpacity>
                <TouchableOpacity testID={`ent-review-approve-${m.id}`} onPress={() => decide(m, "approve")} style={styles.approveBtn}><Text style={styles.approveText}>Approve</Text></TouchableOpacity>
              </View>
            </View>
          );
        })) : <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />)}

        {/* BILLING */}
        {tab === "Billing" && (billing ? (
          <View>
            <View style={styles.statsRow}>
              <Stat label="Seats / mo" value={`$${billing.seats.monthly_seat_cost.toFixed(2)}`} testID="ent-bl-seats" />
              <Stat label="Storage / mo" value={`$${billing.storage.pricing.monthly_storage_cost.toFixed(2)}`} />
            </View>
            <View style={[eui.card, { borderColor: colors.accentBorder, backgroundColor: colors.accentDim, marginTop: spacing.md }]}>
              <Text style={styles.section2}>TOTAL MONTHLY ESTIMATE</Text>
              <Text style={styles.total} testID="ent-bl-total">${billing.total_monthly_estimate.toFixed(2)}</Text>
            </View>
            <SectionTitle>STORAGE METERING</SectionTitle>
            <View style={eui.card}>
              <Text style={styles.usage} testID="ent-bl-usage">{fmtBytes(billing.storage.usage.total_bytes)} used · {billing.storage.pricing.included_gb} GB included</Text>
              <Text style={styles.rate}>Rate ${billing.storage.pricing.effective_rate_per_gb}/GB·mo (R2 ${billing.storage.pricing.base_rate_per_gb} + {billing.storage.pricing.markup_pct}%)</Text>
              {billing.storage.usage.breakdown.map((b: any) => (
                <View key={b.label} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 6 }}>
                  <Text style={styles.bdLabel} numberOfLines={1}>{b.label}</Text>
                  <View style={[eui.track, { flex: 1 }]}><View style={[eui.fill, { width: `${Math.min(100, (b.bytes / Math.max(1, billing.storage.usage.total_bytes)) * 100)}%`, backgroundColor: colors.accent }]} /></View>
                  <Text style={styles.bdVal}>{fmtBytes(b.bytes)}</Text>
                </View>
              ))}
            </View>
            <SectionTitle>STORAGE PACKS</SectionTitle>
            {billing.storage.packs_available.map((p: any) => (
              <View key={p.id} style={[eui.card, { flexDirection: "row", alignItems: "center" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{p.gb} GB</Text>
                  <Text style={styles.rowMeta}>${p.price_usd}/mo add-on</Text>
                </View>
                <TouchableOpacity testID={`ent-buy-${p.id}`} onPress={() => buyPack(p.id, p.gb)} disabled={!!packBusy} style={[styles.miniBtn, packBusy === p.id && { opacity: 0.6 }]}>
                  {packBusy === p.id ? <ActivityIndicator size="small" color="#09090b" /> : <><Ionicons name="add" size={14} color="#09090b" /><Text style={styles.miniBtnText}>Add</Text></>}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  gateTitle: { color: colors.textPrimary, fontSize: font.h2, fontWeight: "800", marginTop: spacing.sm },
  gateText: { color: colors.textSecondary, fontSize: font.small, textAlign: "center", lineHeight: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: { padding: 4 },
  h1: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800" },
  sub: { color: colors.textSecondary, fontSize: font.small, marginTop: 2 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated },
  chipOn: { borderColor: colors.accentBorder, backgroundColor: colors.accentDim },
  chipText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  chipTextOn: { color: colors.accent },
  badge: { backgroundColor: colors.accent, borderRadius: 999, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: "#09090b", fontSize: 10, fontWeight: "800" },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  rowCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  rowTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  rowMeta: { color: colors.textMuted, fontSize: font.small, marginTop: 2 },
  flagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  bdLabel: { color: colors.textSecondary, fontSize: font.tiny, width: 96, textTransform: "capitalize" },
  bdVal: { color: colors.textMuted, fontSize: font.tiny, width: 48, textAlign: "right" },
  miniBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 7, alignSelf: "flex-start", marginTop: spacing.sm },
  miniBtnText: { color: "#09090b", fontSize: font.small, fontWeight: "800" },
  empty: { alignItems: "center", gap: spacing.sm, padding: spacing.xl, backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", marginTop: spacing.lg },
  emptyText: { color: colors.textMuted, fontSize: font.small, textAlign: "center" },
  tag: { backgroundColor: colors.accentDim, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { color: colors.accent, fontSize: 10, fontWeight: "800" },
  tagDim: { backgroundColor: colors.surfaceHover, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tagDimText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
  reviewTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700", backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 8, marginTop: spacing.sm },
  reviewBody: { color: colors.textSecondary, fontSize: font.small, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 8, marginTop: 6, minHeight: 66 },
  rejectBtn: { borderWidth: 1, borderColor: "rgba(248,113,113,0.4)", borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 7 },
  rejectText: { color: colors.danger, fontSize: font.small, fontWeight: "700" },
  approveBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 7 },
  approveText: { color: "#09090b", fontSize: font.small, fontWeight: "800" },
  section2: { color: colors.accent, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1.5 },
  total: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800", marginTop: 2 },
  usage: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  rate: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2 },
  primaryBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 12, paddingHorizontal: spacing.xl, marginTop: spacing.md },
  primaryBtnText: { color: "#09090b", fontWeight: "800", fontSize: font.body },
});
