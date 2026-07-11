import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

const SECTIONS = [
  { id: "profile", label: "Profile" }, { id: "training", label: "Training" },
  { id: "examples", label: "Examples" }, { id: "style", label: "Style" },
  { id: "sandbox", label: "Sandbox" }, { id: "permissions", label: "Permissions" },
  { id: "deploy", label: "Deploy" },
];
const TONES = ["Professional", "Friendly", "Direct", "Executive summary", "Sales-oriented", "Warm customer service"];

export default function EmployeeEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [section, setSection] = useState("profile");

  const load = useCallback(async () => {
    try { setData(await apiGet(`/api/ai-builder/employees/${id}`)); }
    catch { router.back(); }
  }, [id]);
  useEffect(() => { if (token) load(); }, [load, token]);

  if (!data) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  const { employee, documents, examples, completeness } = data;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg }}>
        <View style={styles.headerRow}>
          <TouchableOpacity testID="mb-ep-back" onPress={() => router.back()} style={{ padding: 4 }}>
            <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1} numberOfLines={1}>{employee.name}</Text>
            <Text style={styles.sub}>{employee.job_title || "—"} · {completeness.score}% trained</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.md }} contentContainerStyle={{ gap: spacing.xs }}>
          {SECTIONS.map((s) => (
            <TouchableOpacity key={s.id} testID={`mb-sec-${s.id}`} onPress={() => setSection(s.id)}
              style={[styles.seg, section === s.id && styles.segOn]}>
              <Text style={[styles.segText, section === s.id && styles.segTextOn]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
        {section === "profile" && <ProfileSection employee={employee} onSaved={load} />}
        {section === "training" && <TrainingSection id={id!} documents={documents} onChanged={load} />}
        {section === "examples" && <ExamplesSection id={id!} examples={examples} onChanged={load} />}
        {section === "style" && <StyleSection id={id!} onChanged={load} />}
        {section === "sandbox" && <SandboxSection id={id!} name={employee.name} onChanged={load} />}
        {section === "permissions" && <PermissionsSection id={id!} onChanged={load} />}
        {section === "deploy" && <DeploySection id={id!} employee={employee} onChanged={load} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Label({ children }: any) { return <Text style={styles.label}>{children}</Text>; }
function PrimaryBtn({ onPress, busy, label, testID, disabled }: any) {
  return (
    <TouchableOpacity testID={testID} onPress={onPress} disabled={busy || disabled}
      style={[styles.primaryBtn, (busy || disabled) && { opacity: 0.4 }]}>
      {busy ? <ActivityIndicator color="#09090b" size="small" /> : <Text style={styles.primaryBtnText}>{label}</Text>}
    </TouchableOpacity>
  );
}

function ProfileSection({ employee, onSaved }: any) {
  const [f, setF] = useState({
    name: employee.name || "", job_title: employee.job_title || "", department: employee.department || "",
    description: employee.description || "", tone: employee.tone || "Professional",
    responsibilities: (employee.responsibilities || []).join("\n"),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      await apiPatch(`/api/ai-builder/employees/${employee.id}`, {
        name: f.name, job_title: f.job_title, department: f.department, description: f.description,
        tone: f.tone, responsibilities: f.responsibilities.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      onSaved();
    } catch (e: any) { Alert.alert("Error", e.message); }
    setBusy(false);
  };
  return (
    <View style={{ gap: spacing.md }}>
      <View><Label>NAME</Label><TextInput testID="mb-ep-name" value={f.name} onChangeText={set("name")} style={styles.input} placeholderTextColor={colors.textMuted} /></View>
      <View><Label>JOB TITLE</Label><TextInput value={f.job_title} onChangeText={set("job_title")} style={styles.input} placeholderTextColor={colors.textMuted} /></View>
      <View><Label>DEPARTMENT</Label><TextInput value={f.department} onChangeText={set("department")} style={styles.input} placeholderTextColor={colors.textMuted} /></View>
      <View><Label>DESCRIPTION</Label><TextInput value={f.description} onChangeText={set("description")} multiline style={[styles.input, { minHeight: 70 }]} placeholderTextColor={colors.textMuted} /></View>
      <View>
        <Label>DEFAULT TONE</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
          {TONES.map((t) => (
            <TouchableOpacity key={t} onPress={() => set("tone")(t)} style={[styles.chip, f.tone === t && styles.chipOn]}>
              <Text style={[styles.chipText, f.tone === t && styles.chipTextOn]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <View><Label>RESPONSIBILITIES (ONE PER LINE)</Label><TextInput value={f.responsibilities} onChangeText={set("responsibilities")} multiline style={[styles.input, { minHeight: 90 }]} placeholderTextColor={colors.textMuted} /></View>
      <PrimaryBtn testID="mb-ep-save" onPress={save} busy={busy} label="Save profile" />
    </View>
  );
}

function TrainingSection({ id, documents, onChanged }: any) {
  const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try { await apiPost(`/api/ai-builder/employees/${id}/documents`, { title, category: "Knowledge", content }); setTitle(""); setContent(""); onChanged(); }
    catch (e: any) { Alert.alert("Error", e.message); }
    setBusy(false);
  };
  const del = async (docId: string) => { try { await apiDelete(`/api/ai-builder/employees/${id}/documents/${docId}`); onChanged(); } catch {} };
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.hint}>Paste SOPs, policies, FAQs or scripts. Private to your workspace.</Text>
      <TextInput testID="mb-doc-title" value={title} onChangeText={setTitle} placeholder="Document title" placeholderTextColor={colors.textMuted} style={styles.input} />
      <TextInput testID="mb-doc-content" value={content} onChangeText={setContent} multiline placeholder="Paste content…" placeholderTextColor={colors.textMuted} style={[styles.input, { minHeight: 90 }]} />
      <PrimaryBtn testID="mb-doc-add" onPress={add} busy={busy} disabled={!title || !content} label="Add document" />
      {documents.map((d: any) => (
        <View key={d.id} style={styles.listRow} testID={`mb-doc-${d.id}`}>
          <Ionicons name="document-text-outline" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}><Text style={styles.listTitle}>{d.title}</Text><Text style={styles.listMeta}>{d.category} · {d.status}</Text></View>
          <TouchableOpacity testID={`mb-doc-del-${d.id}`} onPress={() => del(d.id)}><Ionicons name="trash-outline" size={18} color={colors.textMuted} /></TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function ExamplesSection({ id, examples, onChanged }: any) {
  const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [isGood, setIsGood] = useState(true); const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try { await apiPost(`/api/ai-builder/employees/${id}/examples`, { title, example_type: "General", is_good: isGood, content }); setTitle(""); setContent(""); onChanged(); }
    catch (e: any) { Alert.alert("Error", e.message); }
    setBusy(false);
  };
  const del = async (exId: string) => { try { await apiDelete(`/api/ai-builder/employees/${id}/examples/${exId}`); onChanged(); } catch {} };
  return (
    <View style={{ gap: spacing.md }}>
      <TextInput testID="mb-ex-title" value={title} onChangeText={setTitle} placeholder="Example title" placeholderTextColor={colors.textMuted} style={styles.input} />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <TouchableOpacity testID="mb-ex-good" onPress={() => setIsGood(true)} style={[styles.gbBtn, isGood && { backgroundColor: "rgba(74,222,128,0.2)" }]}><Ionicons name="thumbs-up" size={15} color={colors.success} /><Text style={styles.gbText}>Good</Text></TouchableOpacity>
        <TouchableOpacity testID="mb-ex-bad" onPress={() => setIsGood(false)} style={[styles.gbBtn, !isGood && { backgroundColor: "rgba(248,113,113,0.2)" }]}><Ionicons name="thumbs-down" size={15} color={colors.danger} /><Text style={styles.gbText}>Bad</Text></TouchableOpacity>
      </View>
      <TextInput testID="mb-ex-content" value={content} onChangeText={setContent} multiline placeholder="Example content" placeholderTextColor={colors.textMuted} style={[styles.input, { minHeight: 80 }]} />
      <PrimaryBtn testID="mb-ex-add" onPress={add} busy={busy} disabled={!title || !content} label="Add example" />
      {examples.map((ex: any) => (
        <View key={ex.id} style={styles.listRow} testID={`mb-ex-${ex.id}`}>
          <Ionicons name={ex.is_good ? "thumbs-up" : "thumbs-down"} size={16} color={ex.is_good ? colors.success : colors.danger} />
          <View style={{ flex: 1 }}><Text style={styles.listTitle}>{ex.title}</Text><Text style={styles.listMeta} numberOfLines={1}>{ex.content}</Text></View>
          <TouchableOpacity testID={`mb-ex-del-${ex.id}`} onPress={() => del(ex.id)}><Ionicons name="trash-outline" size={18} color={colors.textMuted} /></TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function StyleSection({ id, onChanged }: any) {
  const [connectors, setConnectors] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const CONN_ICON: Record<string, any> = { gmail: "mail", slack: "chatbubble-ellipses", whatsapp: "logo-whatsapp" };

  const load = async () => {
    try {
      const [c, s, p] = await Promise.all([
        apiGet("/api/ai-builder/style-connectors"),
        apiGet(`/api/ai-builder/employees/${id}/style-sources`),
        apiGet(`/api/ai-builder/employees/${id}/style-profile`),
      ]);
      setConnectors(c.connectors); setSources(s.sources);
      setProfile(p.saved?.profile || p.draft?.profile || null);
    } catch {}
  };
  useEffect(() => { load(); }, [id]);

  const connect = async (source: string) => {
    setBusy(`c-${source}`);
    try { await apiPost(`/api/ai-builder/employees/${id}/style-sources`, { source }); await load(); } catch (e: any) { Alert.alert("Error", e.message); }
    setBusy("");
  };
  const generate = async () => {
    setBusy("gen");
    try { const d = await apiPost(`/api/ai-builder/employees/${id}/style-profile/generate`); setProfile(d.profile); }
    catch (e: any) { Alert.alert("Error", e.message); }
    setBusy("");
  };
  const save = async () => {
    setBusy("save");
    try { await apiPost(`/api/ai-builder/employees/${id}/style-profile`, { profile }); Alert.alert("Saved", "Style profile saved."); onChanged(); }
    catch (e: any) { Alert.alert("Error", e.message); }
    setBusy("");
  };
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.hint}>Connect demo style sources, then generate a voice profile with Claude Fable 5.</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {connectors.map((c) => {
          const on = sources.some((s) => s.source === c.id);
          return (
            <TouchableOpacity key={c.id} testID={`mb-style-connect-${c.id}`} onPress={() => connect(c.id)}
              style={[styles.connBtn, on && { borderColor: colors.success, backgroundColor: "rgba(74,222,128,0.1)" }]}>
              {busy === `c-${c.id}` ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name={CONN_ICON[c.id]} size={16} color={on ? colors.success : colors.textSecondary} />}
              <Text style={[styles.connText, on && { color: colors.success }]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <PrimaryBtn testID="mb-style-generate" onPress={generate} busy={busy === "gen"} disabled={sources.length === 0} label="Generate style profile" />
      {profile && (
        <View style={styles.card} testID="mb-style-profile">
          <Text style={styles.cardTitle}>Style profile</Text>
          <KV k="Tone" v={profile.tone} /><KV k="Formality" v={profile.formality} />
          <KV k="Sentence length" v={profile.avg_sentence_length} /><KV k="Vocabulary" v={profile.vocabulary} />
          <KV k="Greeting" v={profile.greeting} /><KV k="Sign-off" v={profile.sign_off} />
          {profile.summary ? <Text style={styles.summary}>{profile.summary}</Text> : null}
          <PrimaryBtn testID="mb-style-save" onPress={save} busy={busy === "save"} label="Save style profile" />
        </View>
      )}
    </View>
  );
}

function SandboxSection({ id, name, onChanged }: any) {
  const [runs, setRuns] = useState<any[]>([]); const [msg, setMsg] = useState(""); const [sending, setSending] = useState(false); const [sessionId, setSessionId] = useState<string | null>(null);
  const load = async () => {
    try { const d = await apiGet(`/api/ai-builder/employees/${id}/test-runs`); const all = d.runs;
      const latest = all.length ? all[all.length - 1].session_id : null;
      setSessionId(latest); setRuns(latest ? all.filter((r: any) => r.session_id === latest) : []);
    } catch {}
  };
  useEffect(() => { load(); }, [id]);
  const send = async () => {
    if (!msg.trim()) return; setSending(true); const text = msg; setMsg("");
    try { const d = await apiPost(`/api/ai-builder/employees/${id}/sandbox`, { message: text, session_id: sessionId || undefined }); if (!sessionId) setSessionId(d.session_id); setRuns((p) => [...p, d]); onChanged(); }
    catch (e: any) { Alert.alert("Error", e.message); setMsg(text); }
    setSending(false);
  };
  const rate = async (run: any, rating: string) => {
    try { await apiPost(`/api/ai-builder/employees/${id}/test-runs/${run.id}/rate`, { rating, save_as_example: rating === "good" }); setRuns((p) => p.map((r) => r.id === run.id ? { ...r, rating } : r)); onChanged(); } catch {}
  };
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={styles.hint}>Chat with {name}. It remembers this conversation.</Text>
        <TouchableOpacity testID="mb-sandbox-new" onPress={() => { setSessionId(null); setRuns([]); }}><Text style={styles.linkText}>New</Text></TouchableOpacity>
      </View>
      {runs.map((r) => (
        <View key={r.id} testID={`mb-run-${r.id}`} style={{ gap: spacing.xs }}>
          <View style={styles.userBubble}><Text style={styles.userText}>{r.user_message}</Text></View>
          <View style={styles.aiBubble}>
            {r.escalated ? <Text style={styles.escTag}>⚠ Escalated</Text> : null}
            <Text style={styles.aiText}>{r.ai_response}</Text>
            <View style={styles.rateRow}>
              <TouchableOpacity testID={`mb-run-good-${r.id}`} onPress={() => rate(r, "good")}><Ionicons name="thumbs-up" size={15} color={r.rating === "good" ? colors.success : colors.textMuted} /></TouchableOpacity>
              <TouchableOpacity testID={`mb-run-bad-${r.id}`} onPress={() => rate(r, "bad")}><Ionicons name="thumbs-down" size={15} color={r.rating === "bad" ? colors.danger : colors.textMuted} /></TouchableOpacity>
              <Text style={styles.modelTag}>{r.model}</Text>
            </View>
          </View>
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" }}>
        <TextInput testID="mb-sandbox-input" value={msg} onChangeText={setMsg} multiline placeholder="Ask something…" placeholderTextColor={colors.textMuted} style={[styles.input, { flex: 1, maxHeight: 90 }]} />
        <TouchableOpacity testID="mb-sandbox-send" onPress={send} disabled={sending || !msg.trim()} style={[styles.sendBtn, (sending || !msg.trim()) && { opacity: 0.4 }]}>
          {sending ? <ActivityIndicator color="#09090b" size="small" /> : <Ionicons name="send" size={17} color="#09090b" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PermissionsSection({ id, onChanged }: any) {
  const [levels, setLevels] = useState<string[]>([]); const [allTools, setAllTools] = useState<string[]>([]);
  const [level, setLevel] = useState(""); const [tools, setTools] = useState<any[]>([]); const [rules, setRules] = useState<any[]>([]);
  const [trigger, setTrigger] = useState(""); const [action, setAction] = useState(""); const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const [opt, p] = await Promise.all([apiGet("/api/ai-builder/permission-options"), apiGet(`/api/ai-builder/employees/${id}/permissions`)]);
      setLevels(opt.levels); setAllTools(opt.tools); setTools(p.tools); setRules(p.escalation_rules);
      setLevel(p.permission?.permission_level || opt.levels[0]);
    } catch {}
  };
  useEffect(() => { load(); }, [id]);
  const saveLevel = async (lvl: string) => { setLevel(lvl); try { await apiPut(`/api/ai-builder/employees/${id}/permissions`, { permission_level: lvl }); onChanged(); } catch (e: any) { Alert.alert("Error", e.message); } };
  const addTool = async (t: string) => { try { await apiPost(`/api/ai-builder/employees/${id}/tools`, { tool: t, requires_approval: true }); load(); onChanged(); } catch (e: any) { Alert.alert("Error", e.message); } };
  const delTool = async (tid: string) => { try { await apiDelete(`/api/ai-builder/employees/${id}/tools/${tid}`); load(); onChanged(); } catch {} };
  const addRule = async () => { if (!trigger.trim() || !action.trim()) return; setBusy(true); try { await apiPost(`/api/ai-builder/employees/${id}/escalation-rules`, { trigger, action }); setTrigger(""); setAction(""); load(); onChanged(); } catch (e: any) { Alert.alert("Error", e.message); } setBusy(false); };
  const delRule = async (rid: string) => { try { await apiDelete(`/api/ai-builder/employees/${id}/escalation-rules/${rid}`); load(); onChanged(); } catch {} };
  return (
    <View style={{ gap: spacing.md }}>
      <Label>PERMISSION LEVEL</Label>
      {levels.map((l) => (
        <TouchableOpacity key={l} testID={`mb-perm-${l}`} onPress={() => saveLevel(l)} style={[styles.radioRow, level === l && styles.radioOn]}>
          <Ionicons name={level === l ? "radio-button-on" : "radio-button-off"} size={18} color={level === l ? colors.accent : colors.textMuted} />
          <Text style={[styles.radioText, level === l && { color: colors.textPrimary }]}>{l}</Text>
        </TouchableOpacity>
      ))}
      <Label>TOOL ACCESS</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {allTools.map((t) => {
          const active = tools.find((x) => x.tool === t);
          return (
            <TouchableOpacity key={t} testID={`mb-tool-${t}`} onPress={() => active ? delTool(active.id) : addTool(t)}
              style={[styles.chip, active && styles.chipOn]}>
              <Text style={[styles.chipText, active && styles.chipTextOn]}>{active ? "✓ " : ""}{t}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Label>ESCALATION RULES</Label>
      <TextInput testID="mb-esc-trigger" value={trigger} onChangeText={setTrigger} placeholder="When… (trigger)" placeholderTextColor={colors.textMuted} style={styles.input} />
      <TextInput testID="mb-esc-action" value={action} onChangeText={setAction} placeholder="Then… (action)" placeholderTextColor={colors.textMuted} style={styles.input} />
      <PrimaryBtn testID="mb-esc-add" onPress={addRule} busy={busy} disabled={!trigger.trim() || !action.trim()} label="Add rule" />
      {rules.map((r) => (
        <View key={r.id} style={styles.listRow} testID={`mb-esc-${r.id}`}>
          <Ionicons name="warning-outline" size={16} color={colors.accent} />
          <Text style={[styles.listTitle, { flex: 1 }]} numberOfLines={2}>If {r.trigger} → {r.action}</Text>
          <TouchableOpacity testID={`mb-esc-del-${r.id}`} onPress={() => delRule(r.id)}><Ionicons name="trash-outline" size={18} color={colors.textMuted} /></TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function DeploySection({ id, employee, onChanged }: any) {
  const [dep, setDep] = useState<any>(null); const [handle, setHandle] = useState(""); const [busy, setBusy] = useState(false);
  const [pub, setPub] = useState({ title: employee.name || "", tagline: "", category: "Productivity", price_usd: "0", share_knowledge: false });
  const [cats, setCats] = useState<string[]>([]);
  const published = employee.marketplace_status === "Published to Marketplace";
  const load = async () => {
    try { const d = await apiGet(`/api/ai-builder/employees/${id}/deployment`); setDep(d.deployment); if (d.deployment) setHandle(d.deployment.handle); else setHandle((employee.name || "employee").toLowerCase().replace(/[^a-z0-9]+/g, "")); } catch {}
    try { const c = await apiGet("/api/ai-builder/marketplace/categories"); setCats(c.categories); } catch {}
  };
  useEffect(() => { load(); }, [id]);
  const deploy = async () => { setBusy(true); try { await apiPost(`/api/ai-builder/employees/${id}/deploy`, { channel: "handle", handle }); Alert.alert("Deployed", "Your AI employee is live."); load(); onChanged(); } catch (e: any) { Alert.alert("Error", e.message); } setBusy(false); };
  const undeploy = async () => { setBusy(true); try { await apiPost(`/api/ai-builder/employees/${id}/undeploy`); load(); onChanged(); } catch {} setBusy(false); };
  const publish = async () => { setBusy(true); try { await apiPost(`/api/ai-builder/employees/${id}/marketplace/publish`, { ...pub, price_usd: Number(pub.price_usd) || 0 }); Alert.alert("Published", "Listed on the marketplace."); onChanged(); } catch (e: any) { Alert.alert("Error", e.message); } setBusy(false); };
  return (
    <View style={{ gap: spacing.md }}>
      {dep ? (
        <View style={[styles.card, { borderColor: colors.success }]} testID="mb-deploy-active">
          <Text style={{ color: colors.success, fontWeight: "800", fontSize: font.body }}>Deployed & live</Text>
          <Text style={{ color: colors.textSecondary, marginTop: 4 }}>Reachable as @{dep.handle}</Text>
          <PrimaryBtn testID="mb-undeploy" onPress={undeploy} busy={busy} label="Undeploy" />
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Deploy as an @mention</Text>
          <TextInput testID="mb-deploy-handle" value={handle} onChangeText={(v) => setHandle(v.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} style={styles.input} placeholderTextColor={colors.textMuted} />
          <PrimaryBtn testID="mb-deploy-btn" onPress={deploy} busy={busy} disabled={!handle} label="Deploy" />
        </View>
      )}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Share on Marketplace {published ? "· Listed" : ""}</Text>
        <TextInput testID="mb-market-title" value={pub.title} onChangeText={(v) => setPub((p) => ({ ...p, title: v }))} placeholder="Listing title" placeholderTextColor={colors.textMuted} style={styles.input} />
        <TextInput testID="mb-market-tagline" value={pub.tagline} onChangeText={(v) => setPub((p) => ({ ...p, tagline: v }))} placeholder="Tagline" placeholderTextColor={colors.textMuted} style={[styles.input, { marginTop: spacing.sm }]} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }} contentContainerStyle={{ gap: spacing.xs }}>
          {cats.map((c) => (
            <TouchableOpacity key={c} onPress={() => setPub((p) => ({ ...p, category: c }))} style={[styles.chip, pub.category === c && styles.chipOn]}>
              <Text style={[styles.chipText, pub.category === c && styles.chipTextOn]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, alignItems: "center" }}>
          <TextInput testID="mb-market-price" value={pub.price_usd} onChangeText={(v) => setPub((p) => ({ ...p, price_usd: v }))} keyboardType="numeric" placeholder="Price USD" placeholderTextColor={colors.textMuted} style={[styles.input, { flex: 1 }]} />
          <TouchableOpacity testID="mb-market-share-knowledge" onPress={() => setPub((p) => ({ ...p, share_knowledge: !p.share_knowledge }))} style={[styles.chip, pub.share_knowledge && styles.chipOn]}>
            <Text style={[styles.chipText, pub.share_knowledge && styles.chipTextOn]}>{pub.share_knowledge ? "✓ " : ""}Share knowledge</Text>
          </TouchableOpacity>
        </View>
        <PrimaryBtn testID="mb-market-publish-btn" onPress={publish} busy={busy} disabled={!pub.title.trim()} label={published ? "Update listing" : "Publish"} />
      </View>
    </View>
  );
}

function KV({ k, v }: { k: string; v: any }) {
  return <View style={styles.kvRow}><Text style={styles.kvK}>{k}</Text><Text style={styles.kvV}>{v || "—"}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  h1: { color: colors.textPrimary, fontSize: font.h2, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: font.small, marginTop: 2 },
  seg: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated },
  segOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  segText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "700" },
  segTextOn: { color: "#09090b" },
  label: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1.2, marginBottom: 6 },
  hint: { color: colors.textMuted, fontSize: font.small, lineHeight: 19 },
  input: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 11, color: colors.textPrimary, fontSize: font.body },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated },
  chipOn: { borderColor: colors.accentBorder, backgroundColor: colors.accentDim },
  chipText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  chipTextOn: { color: colors.accent },
  primaryBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center", marginTop: spacing.sm },
  primaryBtnText: { color: "#09090b", fontWeight: "800", fontSize: font.body },
  listRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  listTitle: { color: colors.textPrimary, fontSize: font.small, fontWeight: "600" },
  listMeta: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2 },
  gbBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  gbText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  connBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated },
  connText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.xs },
  cardTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700", marginBottom: spacing.xs },
  kvRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  kvK: { color: colors.textMuted, fontSize: font.small },
  kvV: { color: colors.textPrimary, fontSize: font.small, fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  summary: { color: colors.textSecondary, fontSize: font.small, lineHeight: 19, marginTop: spacing.sm },
  userBubble: { alignSelf: "flex-end", maxWidth: "85%", backgroundColor: colors.bubbleMine, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 9 },
  userText: { color: colors.textPrimary, fontSize: font.small },
  aiBubble: { alignSelf: "flex-start", maxWidth: "90%", backgroundColor: colors.bubbleAI, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 9 },
  aiText: { color: colors.textPrimary, fontSize: font.small, lineHeight: 20 },
  escTag: { color: colors.accent, fontSize: font.tiny, fontWeight: "700", marginBottom: 4 },
  rateRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: spacing.sm },
  modelTag: { color: colors.textMuted, fontSize: 10, marginLeft: "auto" },
  sendBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  radioRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated },
  radioOn: { borderColor: colors.accentBorder },
  radioText: { color: colors.textSecondary, fontSize: font.small, flex: 1 },
  linkText: { color: colors.accent, fontSize: font.small, fontWeight: "600" },
});
