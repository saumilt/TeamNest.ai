import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { getItem, setItem } from "@/src/storage";
import { colors, font, radius, spacing } from "@/src/theme";

const INTRO_KEY = "ai_employees_intro_seen_v1";

const EMP_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  cmo: "megaphone", bookkeeper: "calculator", sales: "briefcase",
  financial_modeler: "trending-up", paralegal: "school",
  restaurant_orders: "restaurant", bill_pay: "receipt",
};

// Role-first "who does what" grouping for the intro.
const ROLE_GROUPS: { title: string; icon: keyof typeof Ionicons.glyphMap; blurb: string; keys: string[] }[] = [
  { title: "Marketing", icon: "megaphone", blurb: "Plans campaigns, writes content, runs social.", keys: ["cmo"] },
  { title: "Finance", icon: "calculator", blurb: "Keeps the books, models numbers, pays bills.", keys: ["bookkeeper", "financial_modeler", "bill_pay"] },
  { title: "Sales", icon: "briefcase", blurb: "Finds leads and moves deals forward.", keys: ["sales"] },
  { title: "Legal", icon: "school", blurb: "Reviews and drafts everyday legal docs.", keys: ["paralegal"] },
  { title: "Operations", icon: "restaurant", blurb: "Handles orders and day-to-day ops.", keys: ["restaurant_orders"] },
];

const SUGGESTED: Record<string, string> = { cmo: "Priya", sales: "Marcus", paralegal: "Diana", bookkeeper: "Henry" };

/** Mobile AI Employees panel — role-first intro + active/coming-soon roster. */
export default function AIEmployeesPanel() {
  const { user, token } = useAuth();
  const { show } = useToast();
  const isAdmin = user?.role === "owner" || user?.role === "admin";
  const [employees, setEmployees] = useState<any[] | null>(null);
  const [digests, setDigests] = useState<any[]>([]);
  const [showIntro, setShowIntro] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet("/api/ai-employees").then((d) => setEmployees(d.employees || [])).catch(() => setEmployees([]));
    apiGet("/api/ai-employees/_/digests").then((d) => setDigests(d.digests || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (token) load();
    getItem(INTRO_KEY).then((v) => setShowIntro(!v));
  }, [token, load]);

  const dismissIntro = () => { setShowIntro(false); setItem(INTRO_KEY, "1"); };

  const startTrial = async (emp: any) => {
    setBusy(emp.key);
    try {
      await apiPost(`/api/ai-employees/${emp.key}/trial`, { display_first_name: SUGGESTED[emp.key] || "Alex" });
      show(`${SUGGESTED[emp.key] || "Alex"} AI trial started — 7 days`);
      load();
    } catch (e: any) {
      show(e?.message || "Couldn't start trial", "error");
    } finally { setBusy(null); }
  };

  if (!employees) return <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />;

  const active = employees.filter((e) => e.status === "active");
  const comingSoon = employees.filter((e) => e.status === "coming_soon");
  const byKey: Record<string, any> = Object.fromEntries(employees.map((e) => [e.key, e]));

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }} testID="ai-employees-panel">
      {showIntro ? (
        <View style={styles.intro} testID="employees-intro">
          <View style={styles.introHead}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
              <Ionicons name="people-circle" size={18} color={colors.accent} />
              <Text style={styles.introTitle}>Meet your AI team — who does what</Text>
            </View>
            <Pressable testID="employees-intro-dismiss" onPress={dismissIntro} hitSlop={10}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.introSub}>Hire specialized AI teammates by role — pay per role, not per seat. Each has a 7-day trial and never acts on sensitive work without approval.</Text>
          {ROLE_GROUPS.map((g) => {
            const names = g.keys.map((k) => byKey[k]).filter(Boolean);
            if (names.length === 0) return null;
            return (
              <View key={g.title} style={styles.groupRow} testID={`employees-group-${g.title.toLowerCase()}`}>
                <View style={styles.groupIcon}><Ionicons name={g.icon} size={15} color={colors.accent} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.groupTitle}>{g.title}</Text>
                  <Text style={styles.groupBlurb}>{g.blurb}</Text>
                  <Text style={styles.groupNames}>{names.map((n: any) => n.name).join(" · ")}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {digests.length > 0 ? (
        <View testID="employee-digests">
          <Text style={styles.section}>THIS WEEK WITH YOUR AI TEAM</Text>
          {digests.map((d) => (
            <View key={d.employee_key} style={styles.digestCard} testID={`digest-${d.employee_key}`}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={styles.digestName}>{d.display_full_name}</Text>
                <Text style={styles.digestMeta}>{d.period}</Text>
              </View>
              <View style={styles.digestStats}>
                <Text style={styles.digestStat}>{d.tasks} <Text style={styles.digestUnit}>tasks</Text></Text>
                <Text style={[styles.digestStat, { color: colors.accent }]}>~{d.hours_saved}h <Text style={styles.digestUnit}>saved</Text></Text>
                <Text style={[styles.digestStat, { color: colors.success }]}>${d.dollar_savings}</Text>
              </View>
              <Text style={styles.digestRecap}>{d.recap || "No activity yet this week."}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.section}>ACTIVE EMPLOYEES · {active.length}</Text>
      {active.map((emp) => {
        const sub = emp.subscription;
        return (
          <View key={emp.key} style={styles.card} testID={`employee-card-${emp.key}`}>
            <View style={styles.cardHead}>
              <View style={styles.avatar}><Ionicons name={EMP_ICON[emp.key] || "person"} size={18} color={colors.accent} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.empName}>{sub?.display_full_name || emp.name}</Text>
                <Text style={styles.empRole} numberOfLines={1}>{emp.role}</Text>
              </View>
              <Text style={styles.price}>${emp.monthly_price}<Text style={styles.priceUnit}>/mo</Text></Text>
            </View>
            <Text style={styles.empDesc} numberOfLines={3}>{emp.description}</Text>
            {sub ? (
              <Pressable testID={`open-${emp.key}`} style={styles.primaryBtn} onPress={() => router.push("/(tabs)")}>
                <Text style={styles.primaryBtnText}>Use in chat</Text>
                <Ionicons name="chevron-forward" size={14} color="#09090b" />
              </Pressable>
            ) : isAdmin ? (
              <Pressable testID={`start-trial-${emp.key}`} style={styles.primaryBtn} disabled={busy === emp.key} onPress={() => startTrial(emp)}>
                {busy === emp.key ? <ActivityIndicator size="small" color="#09090b" /> : <Text style={styles.primaryBtnText}>Start 7-day trial</Text>}
              </Pressable>
            ) : (
              <Text style={styles.askAdmin}>Ask an owner/admin to start the trial.</Text>
            )}
          </View>
        );
      })}

      {comingSoon.length > 0 ? (
        <>
          <Text style={styles.section}>COMING SOON · {comingSoon.length}</Text>
          {comingSoon.map((emp) => (
            <View key={emp.key} style={[styles.card, { opacity: 0.7 }]} testID={`coming-soon-card-${emp.key}`}>
              <View style={styles.cardHead}>
                <View style={styles.avatarDim}><Ionicons name={EMP_ICON[emp.key] || "person"} size={16} color={colors.textMuted} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.empName}>{emp.name}</Text>
                  <Text style={styles.empRole} numberOfLines={1}>{emp.role}</Text>
                </View>
                <Text style={styles.soonTag}>SOON</Text>
              </View>
              <Text style={styles.empDesc} numberOfLines={2}>{emp.description}</Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  intro: { backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentBorder, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },
  introHead: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  introTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800" },
  introSub: { color: colors.textSecondary, fontSize: font.small, lineHeight: 19, marginBottom: spacing.md },
  groupRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  groupIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  groupTitle: { color: colors.textPrimary, fontSize: font.small, fontWeight: "800" },
  groupBlurb: { color: colors.textSecondary, fontSize: font.tiny, marginTop: 1 },
  groupNames: { color: colors.accent, fontSize: font.tiny, fontWeight: "700", marginTop: 2 },
  section: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1.5, marginTop: spacing.md, marginBottom: spacing.sm },
  digestCard: { backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentBorder, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  digestName: { color: colors.textPrimary, fontSize: font.small, fontWeight: "800" },
  digestMeta: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 0.8 },
  digestStats: { flexDirection: "row", gap: spacing.lg, marginTop: 6, marginBottom: 4, alignItems: "baseline" },
  digestStat: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800" },
  digestUnit: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "600" },
  digestRecap: { color: colors.textSecondary, fontSize: font.tiny, lineHeight: 17 },
  card: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentDim, alignItems: "center", justifyContent: "center" },
  avatarDim: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceHover, alignItems: "center", justifyContent: "center" },
  empName: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800" },
  empRole: { color: colors.textMuted, fontSize: font.tiny, marginTop: 1 },
  price: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  priceUnit: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "600" },
  empDesc: { color: colors.textSecondary, fontSize: font.small, lineHeight: 19, marginTop: spacing.sm },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: 10, marginTop: spacing.md },
  primaryBtnText: { color: "#09090b", fontSize: font.small, fontWeight: "800" },
  askAdmin: { color: colors.textMuted, fontSize: font.small, textAlign: "center", marginTop: spacing.md },
  soonTag: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "800", letterSpacing: 1 },
});
