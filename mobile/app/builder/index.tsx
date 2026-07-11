import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

const RISK_COLOR: Record<string, string> = {
  Low: colors.success, Medium: colors.accent, High: colors.danger,
};

export default function BuilderDashboard() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [employees, setEmployees] = useState<any[] | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [access, setAccess] = useState<any>(null);

  const load = useCallback(() => {
    apiGet("/api/builder-program/me").then(setAccess).catch(() => setAccess({ builder_access: false }));
    apiGet("/api/ai-builder/dashboard").then(setStats).catch(() => {});
    apiGet("/api/ai-builder/employees").then((d) => setEmployees(d.employees)).catch(() => setEmployees([]));
    apiGet("/api/ai-builder/templates").then((d) => setTemplates(d.templates)).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { if (token) load(); }, [token, load]));

  const create = async (body: any) => {
    try {
      const emp = await apiPost("/api/ai-builder/employees", body);
      setShowCreate(false);
      router.push(`/builder/${emp.id}`);
    } catch (e: any) { /* toast-less; surfaced in modal */ throw e; }
  };

  if (access === null) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  }
  if (access && !access.builder_access) {
    const st = access.application?.status;
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md }}>
          <View style={styles.headerRow}>
            <TouchableOpacity testID="mb-back" onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="chevron-back" size={22} color={colors.textSecondary} /></TouchableOpacity>
            <View style={{ flex: 1 }}><Text style={styles.h1}>AI Employee Builder</Text><Text style={styles.sub}>Beta · invite-only access</Text></View>
          </View>
          <View style={[styles.tplCard, { marginTop: spacing.lg, gap: spacing.sm }]} testID="mb-builder-gate">
            <Text style={{ color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" }}>
              {st === "pending" ? "Application under review" : "Become an AI Employee Builder"}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: font.small, lineHeight: 20 }}>
              {st === "pending"
                ? "Thanks for applying! We'll grant access here once approved."
                : "Get approved to build & sell AI employees on the marketplace — or unlock instantly on the Team plan ($19.99)."}
            </Text>
            {st !== "pending" && (
              <TouchableOpacity testID="mb-builder-apply" onPress={() => router.push("/builder-program")} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Apply to build</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: 60 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity testID="mb-back" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>AI Employees</Text>
            <Text style={styles.sub}>Create, train and deploy AI employees.</Text>
          </View>
          <TouchableOpacity testID="mb-marketplace" onPress={() => router.push("/marketplace")} style={styles.iconBtn}>
            <Ionicons name="storefront-outline" size={22} color={colors.accent} />
          </TouchableOpacity>
        </View>

        {stats && (
          <View style={styles.statsRow}>
            {[["Total", stats.total], ["Deployed", stats.deployed], ["In market", stats.marketplace]].map(([l, v]) => (
              <View key={l as string} style={styles.statCard} testID={`mb-stat-${l}`}>
                <Text style={styles.statVal}>{v as number}</Text>
                <Text style={styles.statLabel}>{l as string}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity testID="mb-create-btn" onPress={() => setShowCreate(true)} style={styles.primaryBtn}>
          <Ionicons name="add" size={18} color="#09090b" />
          <Text style={styles.primaryBtnText}>Create AI Employee</Text>
        </TouchableOpacity>

        <Text style={styles.section}>YOUR AI EMPLOYEES</Text>
        {employees === null ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
        ) : employees.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={26} color={colors.textMuted} />
            <Text style={styles.emptyText}>No AI employees yet. Create one below or from a template.</Text>
          </View>
        ) : (
          employees.map((e) => (
            <TouchableOpacity key={e.id} testID={`mb-emp-${e.id}`} onPress={() => router.push(`/builder/${e.id}`)} style={styles.empCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.empName}>{e.name}</Text>
                <Text style={styles.empMeta}>{e.job_title || "—"}{e.department ? ` · ${e.department}` : ""}</Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${e.training_completeness_score}%` }]} />
                </View>
              </View>
              <View style={styles.statusPill}><Text style={styles.statusText}>{e.status}</Text></View>
            </TouchableOpacity>
          ))
        )}

        <Text style={styles.section}>START FROM A TEMPLATE</Text>
        {templates.map((t) => (
          <View key={t.id} style={styles.tplCard} testID={`mb-tpl-${t.id}`}>
            <View style={styles.tplHeaderRow}>
              <Text style={styles.tplName}>{t.name}</Text>
              {t.risk_level ? (
                <View style={[styles.riskPill, { borderColor: RISK_COLOR[t.risk_level] }]}>
                  <Text style={[styles.riskText, { color: RISK_COLOR[t.risk_level] }]}>{t.risk_level}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.tplDesc}>{t.description}</Text>
            <TouchableOpacity testID={`mb-use-tpl-${t.id}`} onPress={() => create({ source: "template", template_id: t.id })} style={styles.tplBtn}>
              <Text style={styles.tplBtnText}>Use this template</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      {showCreate && <CreateModal templates={templates} onClose={() => setShowCreate(false)} onCreate={create} />}
    </View>
  );
}

function CreateModal({ templates, onClose, onCreate }: any) {
  const [mode, setMode] = useState("blank");
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id || "");
  const [jd, setJd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      if (mode === "blank") await onCreate({ source: "blank", name: name || "New AI Employee" });
      else if (mode === "template") await onCreate({ source: "template", template_id: templateId, name: name || undefined });
      else await onCreate({ source: "job_description", name: name || "New AI Employee", job_description: jd });
    } catch (e: any) { setErr(e.message || "Failed"); setBusy(false); }
  };

  const MODES = [{ id: "blank", label: "Blank" }, { id: "template", label: "Template" }, { id: "job_description", label: "Job desc" }];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Create AI Employee</Text>
          <View style={styles.modeRow}>
            {MODES.map((m) => (
              <TouchableOpacity key={m.id} testID={`mb-mode-${m.id}`} onPress={() => setMode(m.id)}
                style={[styles.modeBtn, mode === m.id && styles.modeBtnOn]}>
                <Text style={[styles.modeText, mode === m.id && styles.modeTextOn]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput testID="mb-name-input" value={name} onChangeText={setName} placeholder="Employee name"
            placeholderTextColor={colors.textMuted} style={styles.input} />
          {mode === "job_description" && (
            <TextInput testID="mb-jd-input" value={jd} onChangeText={setJd} multiline
              placeholder="Paste a job description…" placeholderTextColor={colors.textMuted}
              style={[styles.input, { minHeight: 90, marginTop: spacing.sm }]} />
          )}
          {err ? <Text style={styles.err}>{err}</Text> : null}
          <View style={styles.modalActions}>
            <TouchableOpacity testID="mb-create-cancel" onPress={onClose} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity testID="mb-create-submit" onPress={submit} disabled={busy || (mode === "job_description" && !jd.trim())}
              style={[styles.submitBtn, (busy || (mode === "job_description" && !jd.trim())) && { opacity: 0.4 }]}>
              {busy ? <ActivityIndicator color="#09090b" size="small" /> : <Text style={styles.submitText}>Create</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  iconBtn: { padding: 4 },
  h1: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800" },
  sub: { color: colors.textSecondary, fontSize: font.small, marginTop: 2 },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  statCard: { flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  statVal: { color: colors.textPrimary, fontSize: font.h2, fontWeight: "800" },
  statLabel: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2 },
  primaryBtn: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: spacing.lg },
  primaryBtnText: { color: "#09090b", fontWeight: "800", fontSize: font.body },
  section: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1.5, marginTop: spacing.xl, marginBottom: spacing.sm },
  empty: { alignItems: "center", gap: spacing.sm, padding: spacing.xl, backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  emptyText: { color: colors.textMuted, fontSize: font.small, textAlign: "center" },
  empCard: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  empName: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  empMeta: { color: colors.textMuted, fontSize: font.small, marginTop: 2 },
  progressTrack: { height: 5, borderRadius: 999, backgroundColor: colors.surfaceHover, marginTop: spacing.sm, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.accent },
  statusPill: { backgroundColor: colors.surfaceHover, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
  tplCard: { backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  tplHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tplName: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700", flex: 1 },
  riskPill: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1 },
  riskText: { fontSize: 10, fontWeight: "700" },
  tplDesc: { color: colors.textSecondary, fontSize: font.small, marginTop: spacing.xs, lineHeight: 19 },
  tplBtn: { marginTop: spacing.md, backgroundColor: colors.surfaceHover, borderRadius: radius.pill, paddingVertical: 10, alignItems: "center" },
  tplBtnText: { color: colors.textPrimary, fontSize: font.small, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl },
  modalTitle: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800", marginBottom: spacing.lg },
  modeRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  modeBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, alignItems: "center" },
  modeBtnOn: { borderColor: colors.accentBorder, backgroundColor: colors.accentDim },
  modeText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  modeTextOn: { color: colors.accent },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, color: colors.textPrimary, fontSize: font.body },
  err: { color: colors.danger, fontSize: font.small, marginTop: spacing.sm },
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" },
  cancelText: { color: colors.textSecondary, fontWeight: "700", fontSize: font.body },
  submitBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" },
  submitText: { color: "#09090b", fontWeight: "800", fontSize: font.body },
});
