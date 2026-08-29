import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "@/src/api";
import { CreditsBadge } from "@/src/components/CreditsBadge";
import { NotificationBell } from "@/src/components/NotificationBell";
import { Markdown } from "@/src/markdown";
import { colors, font, radius, spacing } from "@/src/theme";

const DEFAULT_MODELS = ["chatgpt", "claude", "gemini"];

export default function ResearchScreen() {
  const insets = useSafeAreaInsets();
  const [models, setModels] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>(DEFAULT_MODELS);
  const [comparisonAllowed, setComparisonAllowed] = useState(true);
  const [chatId, setChatId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [actMsg, setActMsg] = useState("");
  const [draft, setDraft] = useState<any>(null);
  const [draftBusy, setDraftBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [ms, chats, usage] = await Promise.all([
          apiGet("/api/ai/models").catch(() => null),
          apiGet("/api/chats").catch(() => null),
          apiGet("/api/billing/usage").catch(() => null),
        ]);
        // Only offer the 6 core research models.
        const core = ["chatgpt", "claude", "gemini", "deepseek", "perplexity", "grok"];
        setModels((ms || []).filter((m: any) => core.includes(m.key)));
        const personal = (chats || []).find((c: any) => c.type === "personal_ai");
        setChatId(personal?.id || (chats || [])[0]?.id || null);
        const allowed = usage ? !!usage.comparison_allowed : true;
        setComparisonAllowed(allowed);
        // Free plan: comparison is paid — lock to a single model.
        if (!allowed) setSelected(["chatgpt"]);
      } catch (e: any) {
        setError(e.message || "Failed to load models");
      }
    })();
  }, []);

  const toggle = (key: string) => {
    if (!comparisonAllowed) {
      // Paid-only: single-model selection only.
      setSelected([key]);
      return;
    }
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const run = async () => {
    const q = question.trim();
    if (!q || !chatId || selected.length === 0 || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await apiPost("/api/ai/research", {
        chat_id: chatId,
        question: q,
        selected_models: selected,
      });
      setResult(res);
    } catch (e: any) {
      setError(e.message || "Research failed");
    } finally {
      setBusy(false);
    }
  };

  const say = (t: string) => {
    setActMsg(t);
    setTimeout(() => setActMsg(""), 2600);
  };

  const saveKnowledge = async () => {
    const id = result?.thread?.id;
    if (!id) return;
    try {
      await apiPost(`/api/ai/threads/${id}/save-knowledge`, {});
      say("Saved to Team Knowledge");
    } catch {
      say("Couldn't save to knowledge");
    }
  };

  const draftEmail = async () => {
    const content = result?.thread?.final_answer;
    if (!content) return;
    setDraftBusy(true);
    try {
      const d = await apiPost("/api/ai/draft-email", { content });
      setDraft(d);
    } catch {
      say("Couldn't draft email");
    } finally {
      setDraftBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.h1}>AI Research</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <NotificationBell />
            <CreditsBadge />
          </View>
        </View>
        <Text style={styles.sub}>
          Ask once, compare answers across models, get one synthesized result.
        </Text>

        <Text style={styles.label}>MODELS TO COMPARE</Text>
        {!comparisonAllowed && (
          <View style={styles.upgradeBanner} testID="research-upgrade-banner">
            <Ionicons name="lock-closed" size={15} color={colors.accent} />
            <Text style={styles.upgradeText}>
              Comparing multiple AI models is a Pro feature.
            </Text>
            <TouchableOpacity
              testID="research-upgrade-btn"
              onPress={() => router.push({ pathname: "/paywall", params: { highlight: "pro", reason: "comparing multiple AI models" } })}
              style={styles.upgradeBtn}
            >
              <Text style={styles.upgradeBtnText}>Upgrade</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.chips}>
          {models.map((m) => {
            const on = selected.includes(m.key);
            return (
              <TouchableOpacity
                key={m.key}
                testID={`model-chip-${m.key}`}
                onPress={() => toggle(m.key)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{m.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.askCard}>
          <TextInput
            testID="research-question-input"
            value={question}
            onChangeText={setQuestion}
            placeholder="e.g. Compare Postgres vs MongoDB for a chat app"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
          />
          <TouchableOpacity
            testID="research-run-btn"
            onPress={run}
            disabled={busy || !question.trim() || selected.length === 0}
            style={[
              styles.runBtn,
              (busy || !question.trim() || selected.length === 0) && styles.runBtnDisabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#09090b" />
            ) : (
              <>
                <Ionicons name="sparkles" size={16} color="#09090b" />
                <Text style={styles.runBtnText}>
                  {selected.length > 1 ? `Compare ${selected.length} models` : "Ask AI"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {error ? (
          <Text testID="research-error" style={styles.error}>
            {error}
          </Text>
        ) : null}

        {busy ? (
          <Text style={styles.loadingHint}>Running {selected.length} models in parallel…</Text>
        ) : null}

        {result ? (
          <View style={{ marginTop: spacing.lg }}>
            <View style={styles.synthCard}>
              <View style={styles.synthHeader}>
                <Ionicons name="git-merge" size={16} color={colors.accent} />
                <Text style={styles.synthTitle}>Synthesized answer</Text>
              </View>
              <Markdown content={result.thread?.final_answer || "No answer produced."} />
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity testID="research-save-knowledge" style={styles.actBtn} onPress={saveKnowledge}>
                <Ionicons name="bookmark" size={14} color={colors.accent} />
                <Text style={styles.actText}>Save to Knowledge</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="research-draft-email" style={styles.actBtn} onPress={draftEmail} disabled={draftBusy}>
                <Ionicons name="mail" size={14} color={colors.accent} />
                <Text style={styles.actText}>{draftBusy ? "Drafting…" : "Draft Email"}</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="research-automate" style={styles.actBtn} onPress={() => say("Automation Builder is coming soon")}>
                <Ionicons name="flash" size={14} color={colors.accent} />
                <Text style={styles.actText}>Automate This</Text>
              </TouchableOpacity>
            </View>
            {actMsg ? (
              <Text style={styles.actFlash} testID="research-act-flash">{actMsg}</Text>
            ) : null}

            <Text style={[styles.label, { marginTop: spacing.xl }]}>PER-MODEL ANSWERS</Text>
            {(result.responses || []).map((r: any) => (
              <View key={r.id || r.model_key} style={styles.respCard}>
                <View style={styles.respHeader}>
                  <Text style={styles.respModel}>{r.model_name || r.model_key}</Text>
                  {!r.real ? <Text style={styles.mockTag}>demo</Text> : null}
                </View>
                <Markdown
                  content={r.content || r.answer || "(no response)"}
                  color={colors.textSecondary}
                  size={14}
                />
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={!!draft} transparent animationType="slide" onRequestClose={() => setDraft(null)}>
        <Pressable style={styles.draftOverlay} onPress={() => setDraft(null)}>
          <Pressable
            style={[styles.draftSheet, { paddingBottom: insets.bottom + spacing.lg }]}
            onPress={() => {}}
            testID="research-draft-sheet"
          >
            <View style={styles.draftGrip} />
            <Text style={styles.draftLabel}>DRAFT EMAIL · REVIEW BEFORE SENDING</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <Text style={styles.draftSubject}>{draft?.subject}</Text>
              <Text style={styles.draftBody}>{draft?.body}</Text>
            </ScrollView>
            <TouchableOpacity testID="research-draft-close" style={styles.draftClose} onPress={() => setDraft(null)}>
              <Text style={styles.draftCloseText}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800" },
  sub: { color: colors.textSecondary, fontSize: font.body, marginTop: spacing.xs, lineHeight: 21 },
  label: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  upgradeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  upgradeText: { flex: 1, color: colors.textSecondary, fontSize: font.small },
  upgradeBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  upgradeBtnText: { color: "#09090b", fontWeight: "800", fontSize: font.small },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  chipOn: { borderColor: colors.accentBorder, backgroundColor: colors.accentDim },
  chipText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  chipTextOn: { color: colors.accent },
  askCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: font.body,
    minHeight: 70,
  },
  runBtn: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  runBtnDisabled: { opacity: 0.4 },
  runBtnText: { color: "#09090b", fontWeight: "800", fontSize: font.body },
  error: { color: colors.danger, fontSize: font.small, marginTop: spacing.md },
  loadingHint: { color: colors.textMuted, fontSize: font.small, marginTop: spacing.md, textAlign: "center" },
  synthCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    padding: spacing.lg,
  },
  synthHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  synthTitle: { color: colors.accent, fontSize: font.body, fontWeight: "700" },
  respCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  respHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  respModel: { color: colors.textPrimary, fontSize: font.small, fontWeight: "700" },
  mockTag: { color: colors.textMuted, fontSize: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  actBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentDim,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actText: { color: colors.accent, fontSize: font.small, fontWeight: "700" },
  actFlash: { color: colors.textSecondary, fontSize: font.small, marginTop: spacing.sm },
  draftOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  draftSheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  draftGrip: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  draftLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1.2, marginBottom: spacing.md },
  draftSubject: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800", marginBottom: spacing.sm },
  draftBody: { color: colors.textSecondary, fontSize: font.body, lineHeight: 21 },
  draftClose: { marginTop: spacing.md, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: spacing.sm, alignItems: "center" },
  draftCloseText: { color: "#09090b", fontWeight: "800", fontSize: font.body },
});
