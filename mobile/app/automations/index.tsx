import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

const RISK: Record<string, { label: string; color: string }> = {
  low: { label: "Low risk", color: colors.success },
  medium: { label: "Approval recommended", color: "#f59e0b" },
  high: { label: "Approval required", color: colors.danger },
};

const STEP_ICON: Record<string, any> = {
  get: "git-branch",
  ai: "sparkles",
  post: "arrow-forward",
  app: "flash",
  notify: "notifications",
  condition: "alert-circle",
};

export default function AutomationsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<any>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [targetChatId, setTargetChatId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    apiGet("/api/automations").then((d) => setItems(d.items || [])).catch(() => {});
    apiGet("/api/automations/stats").then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    load();
    apiGet("/api/automations/templates").then((d) => setTemplates(d.templates || [])).catch(() => {});
    apiGet("/api/chats")
      .then((d: any[]) => {
        const ai = (d || []).find((c) => c.type === "personal_ai");
        setTargetChatId(ai?.id || (d || [])[0]?.id || null);
      })
      .catch(() => {});
  }, [token, load]);

  const say = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 2600);
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setParsing(true);
    setPlan(null);
    try {
      const d = await apiPost("/api/automations/parse", { prompt });
      setPlan(d);
    } catch {
      say("Couldn't parse that");
    } finally {
      setParsing(false);
    }
  };

  const save = async (runNow: boolean) => {
    if (!plan) return;
    setSaving(true);
    try {
      const created = await apiPost("/api/automations", { ...plan, target_chat_id: targetChatId });
      if (runNow) {
        const run = await apiPost(`/api/automations/${created.id}/run`, {});
        say(`Test run: ${run.status}`);
      } else {
        say("Automation activated");
      }
      setPlan(null);
      setPrompt("");
      load();
    } catch {
      say("Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async (id: string) => {
    try {
      const run = await apiPost(`/api/automations/${id}/run`, {});
      say(`Run finished: ${run.status}`);
      load();
    } catch {
      say("Run failed");
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="autom-back" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Automations</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} testID="mobile-automations">
        <Text style={styles.sub}>Tell TeamNest what should happen automatically — in plain English.</Text>

        {stats ? (
          <View style={styles.statsRow}>
            <Stat label="Running" value={stats.running} />
            <Stat label="Approvals" value={stats.needs_approval} />
            <Stat label="Hours saved" value={stats.saved_hours} />
          </View>
        ) : null}

        {/* Builder */}
        <View style={styles.builder}>
          <Text style={styles.builderTitle}>What would you like to automate?</Text>
          <TextInput
            testID="automation-prompt"
            value={prompt}
            onChangeText={setPrompt}
            placeholder="e.g. Summarize overdue tasks every Monday and post to our team chat"
            placeholderTextColor={colors.textMuted}
            multiline
            style={styles.input}
          />
          <Pressable testID="automation-generate" style={[styles.primaryBtn, (!prompt.trim() || parsing) && styles.disabled]} onPress={generate} disabled={!prompt.trim() || parsing}>
            {parsing ? <ActivityIndicator color="#09090b" /> : <Ionicons name="sparkles" size={16} color="#09090b" />}
            <Text style={styles.primaryBtnText}>{parsing ? "Thinking…" : "Generate plan"}</Text>
          </Pressable>

          {plan ? (
            <View style={styles.plan} testID="automation-plan">
              <View style={styles.planHead}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={[styles.riskTag, { color: RISK[plan.risk]?.color || colors.success, borderColor: RISK[plan.risk]?.color || colors.success }]}>
                  {RISK[plan.risk]?.label || plan.risk}
                </Text>
              </View>
              <PlanRow badge="WHEN" icon="time" text={plan.trigger?.label} />
              {(plan.steps || []).map((s: any, i: number) => (
                <PlanRow key={i} badge={s.kind === "get" ? "GET" : "THEN"} icon={STEP_ICON[s.kind] || "flash"} text={s.label} />
              ))}
              <View style={styles.planBtns}>
                <Pressable testID="automation-activate" style={styles.activateBtn} onPress={() => save(false)} disabled={saving}>
                  <Text style={styles.activateText}>Activate</Text>
                </Pressable>
                <Pressable testID="automation-test" style={styles.testBtn} onPress={() => save(true)} disabled={saving}>
                  <Ionicons name="play" size={14} color={colors.accent} />
                  <Text style={styles.testText}>Test now</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        {msg ? <Text style={styles.flash} testID="autom-flash">{msg}</Text> : null}

        {/* Templates */}
        <Text style={styles.section}>TEMPLATES</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}>
          {templates.map((t) => (
            <Pressable
              key={t.key}
              testID={`template-${t.key}`}
              style={styles.tpl}
              onPress={() => { setPrompt(t.prompt); setPlan(null); }}
            >
              <Text style={styles.tplTitle}>{t.title}</Text>
              <Text style={styles.tplCat}>{t.category}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* List */}
        <Text style={styles.section}>YOUR AUTOMATIONS</Text>
        {items.length === 0 ? (
          <Text style={styles.empty} testID="automations-empty">No automations yet — describe one above.</Text>
        ) : (
          items.map((a) => (
            <View key={a.id} style={styles.row} testID={`automation-${a.id}`}>
              <View style={[styles.rowIcon, { backgroundColor: a.status === "active" ? colors.accent : colors.bgElevated }]}>
                <Ionicons name="flash" size={16} color={a.status === "active" ? "#09090b" : colors.textMuted} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{a.name}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{a.trigger?.label} · {a.status}</Text>
              </View>
              <Pressable testID={`automation-run-${a.id}`} onPress={() => runNow(a.id)} hitSlop={8} style={styles.runBtn}>
                <Ionicons name="play" size={16} color={colors.accent} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value ?? "—"}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PlanRow({ badge, icon, text }: { badge: string; icon: any; text: string }) {
  return (
    <View style={styles.planRow}>
      <Text style={styles.planBadge}>{badge}</Text>
      <Ionicons name={icon} size={14} color={colors.textSecondary} />
      <Text style={styles.planText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: font.body, marginBottom: spacing.lg },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  stat: { flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  statValue: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  statLabel: { color: colors.textMuted, fontSize: font.tiny, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 },
  builder: { backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentBorder, borderRadius: radius.lg, padding: spacing.md },
  builderTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800", marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: font.body,
    minHeight: 64,
    textAlignVertical: "top",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: "#09090b", fontWeight: "800", fontSize: font.body },
  disabled: { opacity: 0.6 },
  plan: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md, paddingTop: spacing.md },
  planHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  planName: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800", flex: 1 },
  riskTag: { fontSize: font.tiny, fontWeight: "700", borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, textTransform: "uppercase" },
  planRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 3 },
  planBadge: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", width: 40 },
  planText: { color: colors.textSecondary, fontSize: font.small, flex: 1 },
  planBtns: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  activateBtn: { backgroundColor: colors.textPrimary, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  activateText: { color: "#09090b", fontWeight: "800", fontSize: font.small },
  testBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.accentBorder, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  testText: { color: colors.accent, fontWeight: "700", fontSize: font.small },
  flash: { color: colors.textSecondary, fontSize: font.small, marginTop: spacing.sm },
  section: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1.2, marginTop: spacing.xl, marginBottom: spacing.sm },
  tpl: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, width: 200 },
  tplTitle: { color: colors.textPrimary, fontSize: font.small, fontWeight: "700" },
  tplCat: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.8 },
  empty: { color: colors.textMuted, fontSize: font.body },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  rowIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  rowSub: { color: colors.textMuted, fontSize: font.small, marginTop: 1 },
  runBtn: { padding: 8 },
});
