import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";
import { ContinuityBar, RiskBadge, SectionTitle, eui } from "@/src/components/enterprise/ui";

const SECTIONS = ["Overview", "Role", "Duties", "Knowledge", "Decisions", "Contacts", "Successor"];
const PHASE_LABEL: Record<string, string> = { "30": "First 30 days", "60": "First 60 days", "90": "First 90 days" };

export default function EnterpriseProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [sec, setSec] = useState("Overview");
  const [capturing, setCapturing] = useState(false);
  // successor
  const [candidates, setCandidates] = useState<any[]>([]);
  const [handoff, setHandoff] = useState<any>(null);
  const [progress, setProgress] = useState<any>({ done: 0, total: 0, pct: 0 });
  const [status, setStatus] = useState("not_started");
  const [pick, setPick] = useState("");

  const load = useCallback(() => {
    apiGet(`/api/enterprise/people/${id}`).then(setData).catch(() => {});
  }, [id]);
  useFocusEffect(useCallback(() => { if (token) load(); }, [token, load]));

  const openSec = (s: string) => {
    setSec(s);
    if (s === "Successor" && !handoff && candidates.length === 0) {
      apiGet(`/api/enterprise/people/${id}/candidates`).then((d) => { setCandidates(d.candidates || []); setPick(d.candidates?.[0]?.id || ""); }).catch(() => {});
      apiGet(`/api/enterprise/people/${id}/handoff`).then((d) => { setHandoff(d.handoff); setProgress(d.progress); setStatus(d.transfer_status); setPick(d.handoff?.successor_user_id || ""); }).catch(() => {});
    }
  };

  const assign = async () => {
    if (!pick) return;
    try {
      const r = await apiPost(`/api/enterprise/people/${id}/successor`, { successor_user_id: pick });
      setHandoff(r.handoff);
      const h = await apiGet(`/api/enterprise/people/${id}/handoff`);
      setProgress(h.progress); setStatus(h.transfer_status);
    } catch {}
  };

  const toggle = async (item: any) => {
    try {
      const r = await apiPost(`/api/enterprise/people/${id}/handoff/checklist`, { item_id: item.id, done: !item.done });
      setHandoff({ ...handoff, checklist: handoff.checklist.map((c: any) => c.id === item.id ? { ...c, done: !c.done } : c) });
      setProgress(r.progress); setStatus(r.transfer_status);
    } catch {}
  };

  if (!data) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  const { employee: e, role, profile: pr, score, memories } = data;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg }}>
        <View style={styles.headerRow}>
          <TouchableOpacity testID="ent-profile-back" onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="chevron-back" size={22} color={colors.textSecondary} /></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1} numberOfLines={1}>{e.employee_name}</Text>
            <Text style={styles.sub}>{role?.role_name || "—"}{e.employment_status === "Departing" ? " · Departing" : ""}</Text>
          </View>
          {role && (
            <TouchableOpacity testID="ent-ask-btn" onPress={() => router.push(`/enterprise/ask/${role.id}`)} style={styles.askBtn}>
              <Ionicons name="sparkles" size={14} color={colors.accent} />
              <Text style={styles.askText}>Ask role</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}>
          {SECTIONS.map((s) => (
            <TouchableOpacity key={s} testID={`ent-sec-${s.toLowerCase()}`} onPress={() => openSec(s)} style={[styles.chip, sec === s && styles.chipOn]}>
              <Text style={[styles.chipText, sec === s && styles.chipTextOn]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}>
        {sec === "Overview" && (
          <View style={eui.card}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <ContinuityBar score={score?.overall_score || 0} width={90} />
              <RiskBadge level={score?.risk_level || "Unknown"} />
            </View>
            <Text style={styles.body}>{pr?.role_summary || role?.description || "No summary yet."}</Text>
            <View style={styles.kv}><Text style={styles.k}>Status</Text><Text style={styles.v}>{e.employment_status}</Text></View>
            <View style={styles.kv}><Text style={styles.k}>Unique knowledge</Text><Text style={styles.v}>{e.unique_knowledge_level}</Text></View>
            <View style={styles.kv}><Text style={styles.k}>Transfer</Text><Text style={styles.v}>{(e.knowledge_transfer_status || "not_started").replace(/_/g, " ")}</Text></View>
          </View>
        )}

        {sec === "Role" && (
          <View style={eui.card}>
            <Text style={styles.body}>{role?.description || "—"}</Text>
            <View style={styles.kv}><Text style={styles.k}>Department</Text><Text style={styles.v}>{role?.department || "—"}</Text></View>
            <View style={styles.kv}><Text style={styles.k}>Approval authority</Text><Text style={styles.v}>{role?.approval_authority || "—"}</Text></View>
            <View style={styles.kv}><Text style={styles.k}>Escalation</Text><Text style={styles.v}>{role?.escalation_rules || "—"}</Text></View>
          </View>
        )}

        {sec === "Duties" && (
          <View>
            <SectionTitle>SOPs</SectionTitle>
            {(pr?.sops || []).map((s: string, i: number) => <View key={i} style={styles.bullet}><Text style={styles.body}>• {s}</Text></View>)}
            <SectionTitle>WORKFLOWS</SectionTitle>
            {(pr?.workflow_steps || []).map((s: string, i: number) => <View key={i} style={styles.bullet}><Text style={styles.body}>• {s}</Text></View>)}
            {(!pr?.sops?.length && !pr?.workflow_steps?.length) && <Text style={styles.body}>No duties captured.</Text>}
          </View>
        )}

        {sec === "Knowledge" && (
          <View>
            <TouchableOpacity testID="ent-capture-btn" onPress={() => setCapturing(true)} style={styles.captureBtn}>
              <Ionicons name="add" size={16} color="#09090b" /><Text style={styles.miniBtnText}>Capture knowledge</Text>
            </TouchableOpacity>
            <SectionTitle>APPROVED ROLE KNOWLEDGE</SectionTitle>
            {(memories || []).length === 0 ? <Text style={styles.body}>No approved knowledge yet. Capture from notes, then approve in the Review queue.</Text> : memories.map((m: any) => (
              <View key={m.id} style={eui.card} testID={`ent-memory-${m.id}`}>
                <Text style={styles.rowTitle}>{m.title}</Text>
                <Text style={styles.body}>{m.content}</Text>
                <Text style={styles.meta}>{m.memory_type} · {m.source_type} · {m.source_date}</Text>
              </View>
            ))}
          </View>
        )}

        {sec === "Decisions" && (
          (pr?.decision_history || []).length === 0 ? <Text style={styles.body}>No decisions recorded.</Text> :
          pr.decision_history.map((d: any, i: number) => (
            <View key={i} style={eui.card}>
              <Text style={styles.rowTitle}>{d.decision}</Text>
              <Text style={styles.body}>{d.reason}</Text>
              <Text style={styles.meta}>Approved by {d.approver} · {d.date}</Text>
            </View>
          ))
        )}

        {sec === "Contacts" && (
          (pr?.relationships || []).length === 0 ? <Text style={styles.body}>No relationships recorded.</Text> :
          pr.relationships.map((r: any, i: number) => (
            <View key={i} style={eui.card}>
              <Text style={styles.rowTitle}>{r.org}</Text>
              <Text style={styles.body}>{r.notes}</Text>
              <Text style={styles.meta}>{r.type}</Text>
            </View>
          ))
        )}

        {sec === "Successor" && (
          <View>
            <View style={eui.card}>
              <Text style={styles.rowTitle}>Assign successor</Text>
              <Text style={styles.meta}>A 30/60/90 handoff package is generated from approved knowledge — no personal identity is shared.</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }} contentContainerStyle={{ gap: spacing.sm }}>
                {candidates.map((c) => (
                  <TouchableOpacity key={c.id} testID={`ent-cand-${c.id}`} onPress={() => setPick(c.id)} style={[styles.candChip, pick === c.id && styles.chipOn]}>
                    <Text style={[styles.chipText, pick === c.id && styles.chipTextOn]}>{c.employee_name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity testID="ent-assign-btn" onPress={assign} disabled={!pick} style={[styles.captureBtn, !pick && { opacity: 0.5 }]}>
                <Ionicons name="person-add" size={15} color="#09090b" /><Text style={styles.miniBtnText}>{handoff ? "Reassign" : "Assign"}</Text>
              </TouchableOpacity>
              {handoff && <Text style={[styles.meta, { marginTop: spacing.sm }]}>Successor: {handoff.successor_name} · {status.replace(/_/g, " ")}</Text>}
            </View>

            {handoff && (
              <>
                <SectionTitle>HANDOFF BRIEF</SectionTitle>
                <View style={eui.card}><Text style={styles.body} testID="ent-handoff-brief">{handoff.brief}</Text></View>
                <SectionTitle>CHECKLIST · {progress.done}/{progress.total}</SectionTitle>
                <View style={[eui.track, { marginBottom: spacing.sm }]}><View style={[eui.fill, { width: `${progress.pct}%`, backgroundColor: colors.accent }]} /></View>
                {["30", "60", "90"].map((phase) => {
                  const items = handoff.checklist.filter((c: any) => c.phase === phase);
                  if (!items.length) return null;
                  return (
                    <View key={phase} style={{ marginBottom: spacing.md }}>
                      <Text style={styles.phase}>{PHASE_LABEL[phase]}</Text>
                      {items.map((c: any) => (
                        <TouchableOpacity key={c.id} testID={`ent-chk-${c.id}`} onPress={() => toggle(c)} style={styles.chkRow}>
                          <Ionicons name={c.done ? "checkmark-circle" : "ellipse-outline"} size={18} color={c.done ? colors.success : colors.textMuted} />
                          <Text style={[styles.chkText, c.done && { color: colors.textMuted, textDecorationLine: "line-through" }]}>{c.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                })}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {capturing && role && (
        <CaptureModal roleId={role.id} roleName={role.role_name} onClose={() => setCapturing(false)} onDone={() => { setCapturing(false); load(); }} />
      )}
    </View>
  );
}

function CaptureModal({ roleId, roleName, onClose, onDone }: any) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true); setMsg("");
    try {
      const r = await apiPost(`/api/enterprise/roles/${roleId}/capture`, { text });
      if (r.proposed > 0) onDone();
      else { setMsg(r.note || "Nothing worth preserving found"); setBusy(false); }
    } catch (e: any) { setMsg(e.message || "Capture failed"); setBusy(false); }
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard} testID="ent-capture-modal">
          <Text style={styles.modalTitle}>Capture knowledge</Text>
          <Text style={styles.meta}>For the {roleName} role. We extract anonymized, transferable knowledge for review — the person&apos;s identity is never stored.</Text>
          <TextInput testID="ent-capture-text" value={text} onChangeText={setText} multiline placeholder="Paste notes / a decision / a process…" placeholderTextColor={colors.textMuted} style={styles.captureInput} />
          {msg ? <Text style={styles.meta}>{msg}</Text> : null}
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity testID="ent-capture-submit" onPress={submit} disabled={busy || !text.trim()} style={[styles.submitBtn, (busy || !text.trim()) && { opacity: 0.4 }]}>
              {busy ? <ActivityIndicator color="#09090b" size="small" /> : <Text style={styles.submitText}>Propose</Text>}
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
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: { padding: 4 },
  h1: { color: colors.textPrimary, fontSize: font.h2, fontWeight: "800" },
  sub: { color: colors.textSecondary, fontSize: font.small, marginTop: 2 },
  askBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.accentBorder, backgroundColor: colors.accentDim, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 7 },
  askText: { color: colors.accent, fontSize: font.small, fontWeight: "700" },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated },
  candChip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  chipOn: { borderColor: colors.accentBorder, backgroundColor: colors.accentDim },
  chipText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  chipTextOn: { color: colors.accent },
  body: { color: colors.textSecondary, fontSize: font.small, lineHeight: 21, marginTop: 6 },
  meta: { color: colors.textMuted, fontSize: font.tiny, marginTop: 6 },
  rowTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  kv: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  k: { color: colors.textMuted, fontSize: font.small },
  v: { color: colors.textPrimary, fontSize: font.small, fontWeight: "600" },
  bullet: { marginBottom: 2 },
  captureBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 11, marginTop: spacing.sm },
  miniBtnText: { color: "#09090b", fontSize: font.small, fontWeight: "800" },
  phase: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1, marginBottom: 6 },
  chkRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: 6 },
  chkText: { color: colors.textPrimary, fontSize: font.small, flex: 1, lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl },
  modalTitle: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  captureInput: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, color: colors.textPrimary, fontSize: font.body, minHeight: 110, marginTop: spacing.md, textAlignVertical: "top" },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" },
  cancelText: { color: colors.textSecondary, fontWeight: "700", fontSize: font.body },
  submitBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" },
  submitText: { color: "#09090b", fontWeight: "800", fontSize: font.body },
});
