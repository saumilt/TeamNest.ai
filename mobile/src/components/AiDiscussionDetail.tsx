import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPatch, apiPost } from "../api";
import { Markdown } from "../markdown";
import { modelName } from "../aiModels";
import { colors, font, radius, spacing } from "../theme";

const VIS: Record<string, { label: string; icon: any }> = {
  private: { label: "Private", icon: "lock-closed" },
  chat: { label: "Shared with chat", icon: "people" },
  shared: { label: "Shared with people", icon: "person-add" },
};

const PUBLISH_TYPES: [string, string][] = [
  ["executive_summary", "Executive summary"],
  ["recommendation", "Recommendation"],
  ["key_findings", "Key findings"],
  ["action_items", "Action items"],
  ["risks", "Risks"],
  ["custom", "Custom excerpt"],
];

// Full-screen AI discussion detail — the mobile equivalent of the web's
// right-side AI panel. Shows the Q&A, plus creator actions (visibility,
// publish a concise summary to the chat, save to knowledge) and a clear
// "Back to chat" affordance.
export function AiDiscussionDetail({
  visible,
  threadId,
  currentUserId,
  members = [],
  onClose,
  onChanged,
  onPublished,
}: {
  visible: boolean;
  threadId: string | null;
  currentUserId?: string;
  members?: { id: string; name: string }[];
  onClose: () => void;
  onChanged?: () => void;
  onPublished?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [thread, setThread] = useState<any>(null);
  const [responses, setResponses] = useState<any[]>([]);
  const [visibility, setVisibility] = useState("private");
  const [visMenu, setVisMenu] = useState(false);
  const [shared, setShared] = useState<string[]>([]);
  const [pubOpen, setPubOpen] = useState(false);
  const [pubType, setPubType] = useState("executive_summary");
  const [customText, setCustomText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!threadId) return;
    setLoading(true);
    try {
      const data = await apiGet(`/api/ai/research/${threadId}`);
      setThread(data.thread || null);
      setResponses(Array.isArray(data.responses) ? data.responses : []);
      setVisibility(data.thread?.visibility || "private");
    } catch {
      setThread(null);
      setResponses([]);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    if (visible && threadId) {
      setVisMenu(false);
      setPubOpen(false);
      setShared([]);
      load();
    }
  }, [visible, threadId, load]);

  const isCreator = !thread || thread.created_by === currentUserId;

  const applyVisibility = async (v: string, sharedIds?: string[]) => {
    setVisibility(v);
    setVisMenu(false);
    try {
      await apiPatch(`/api/ai/threads/${threadId}/visibility`, {
        visibility: v,
        shared_user_ids: v === "shared" ? sharedIds || shared : [],
      });
      onChanged?.();
    } catch {
      Alert.alert("Error", "Couldn't update visibility");
    }
  };

  const doPublish = async () => {
    setBusy(true);
    try {
      await apiPost(`/api/ai/threads/${threadId}/publish`, {
        publication_type: pubType,
        custom_text: pubType === "custom" ? customText : undefined,
      });
      setPubOpen(false);
      setCustomText("");
      onPublished?.();
      Alert.alert("Published", "A summary was posted to the chat.");
    } catch {
      Alert.alert("Error", "Publish failed");
    } finally {
      setBusy(false);
    }
  };

  const doSaveKnowledge = async () => {
    setBusy(true);
    try {
      await apiPost(`/api/ai/threads/${threadId}/save-knowledge`, {});
      Alert.alert("Saved", "Research saved to Knowledge.");
    } catch {
      Alert.alert("Error", "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleShared = (id: string) =>
    setShared((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const Vis = VIS[visibility] || VIS.private;
  const title = thread?.title || thread?.question || "AI Discussion";

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]} testID="ai-discussion-panel">
        {/* Header + Back to chat */}
        <View style={styles.header}>
          <TouchableOpacity
            testID="back-to-chat-btn"
            onPress={onClose}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={22} color={colors.accent} />
            <Text style={styles.backText}>Back to chat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="ai-panel-close"
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Actions toolbar */}
        <View style={styles.actionsBar} testID="ai-discussion-actions">
          <View>
            <TouchableOpacity
              testID="ai-visibility-btn"
              disabled={!isCreator}
              onPress={() => setVisMenu((v) => !v)}
              style={[styles.actionChip, !isCreator && { opacity: 0.7 }]}
            >
              <Ionicons name={Vis.icon} size={12} color={colors.textSecondary} />
              <Text style={styles.actionChipText}>{Vis.label}</Text>
              {isCreator && <Ionicons name="chevron-down" size={12} color={colors.textMuted} />}
            </TouchableOpacity>
          </View>
          <TouchableOpacity testID="ai-publish-btn" onPress={() => setPubOpen(true)} style={styles.publishBtn}>
            <Ionicons name="send" size={12} color="#09090b" />
            <Text style={styles.publishText}>Publish</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="ai-save-knowledge-btn"
            onPress={doSaveKnowledge}
            disabled={busy}
            style={styles.actionChip}
          >
            <Ionicons name="bookmark-outline" size={12} color={colors.textSecondary} />
            <Text style={styles.actionChipText}>Save</Text>
          </TouchableOpacity>
        </View>

        {/* Visibility menu */}
        {visMenu && isCreator && (
          <View style={styles.visMenu} testID="ai-visibility-menu">
            {["private", "chat", "shared"].map((v) => (
              <TouchableOpacity
                key={v}
                testID={`ai-visibility-${v}`}
                onPress={() => (v === "shared" ? setVisibility("shared") : applyVisibility(v))}
                style={styles.visRow}
              >
                <Ionicons name={VIS[v].icon} size={14} color={colors.textSecondary} />
                <Text style={styles.visRowText}>{VIS[v].label}</Text>
                {visibility === v && (
                  <Ionicons name="checkmark" size={14} color={colors.accent} style={{ marginLeft: "auto" }} />
                )}
              </TouchableOpacity>
            ))}
            {visibility === "shared" && (
              <View style={styles.shareList}>
                {members.map((m) => (
                  <TouchableOpacity key={m.id} onPress={() => toggleShared(m.id)} style={styles.visRow}>
                    <Ionicons
                      name={shared.includes(m.id) ? "checkbox" : "square-outline"}
                      size={16}
                      color={shared.includes(m.id) ? colors.accent : colors.textMuted}
                    />
                    <Text style={styles.visRowText}>{m.name}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  testID="ai-visibility-apply-shared"
                  onPress={() => applyVisibility("shared", shared)}
                  style={styles.shareApply}
                >
                  <Text style={styles.shareApplyText}>Share with {shared.length || 0}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Body */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
            <Text style={styles.title}>{title}</Text>
            {thread?.question ? (
              <View style={styles.qBlock}>
                <Text style={styles.qLabel}>QUESTION</Text>
                <Text style={styles.qText}>{thread.question}</Text>
              </View>
            ) : null}

            {responses.length > 0 ? (
              responses.map((r, i) => (
                <View key={r.id || i} style={styles.answerBlock} testID={`ai-answer-${r.model_key || i}`}>
                  <View style={styles.modelHead}>
                    <Ionicons name="sparkles" size={13} color={colors.accent} />
                    <Text style={styles.modelName}>{r.model_name || modelName(r.model_key || "AI")}</Text>
                  </View>
                  <Markdown content={r.answer || "_(no answer)_"} size={14} />
                </View>
              ))
            ) : thread?.final_answer ? (
              <View style={styles.answerBlock}>
                <Markdown content={thread.final_answer} size={14} />
              </View>
            ) : (
              <Text style={styles.emptyAnswer}>No answer yet.</Text>
            )}
          </ScrollView>
        )}

        {/* Publish sub-modal */}
        <Modal visible={pubOpen} transparent animationType="fade" onRequestClose={() => setPubOpen(false)}>
          <View style={styles.pubBackdrop}>
            <View style={styles.pubCard} testID="ai-publish-dialog">
              <Text style={styles.pubTitle}>Publish to chat</Text>
              <Text style={styles.pubSub}>Post a concise summary into the human conversation.</Text>
              <View style={styles.pubGrid}>
                {PUBLISH_TYPES.map(([val, label]) => (
                  <TouchableOpacity
                    key={val}
                    testID={`ai-publish-type-${val}`}
                    onPress={() => setPubType(val)}
                    style={[styles.pubChip, pubType === val && styles.pubChipOn]}
                  >
                    <Text style={[styles.pubChipText, pubType === val && styles.pubChipTextOn]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {pubType === "custom" && (
                <TextInput
                  testID="ai-publish-custom"
                  value={customText}
                  onChangeText={setCustomText}
                  placeholder="Paste or write the excerpt to publish…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  style={styles.pubInput}
                />
              )}
              <View style={styles.pubActions}>
                <TouchableOpacity onPress={() => setPubOpen(false)} style={styles.pubCancel}>
                  <Text style={styles.pubCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="ai-publish-confirm"
                  disabled={busy || (pubType === "custom" && !customText.trim())}
                  onPress={doPublish}
                  style={[styles.pubConfirm, (busy || (pubType === "custom" && !customText.trim())) && { opacity: 0.4 }]}
                >
                  <Ionicons name="send" size={13} color="#09090b" />
                  <Text style={styles.pubConfirmText}>{busy ? "Publishing…" : "Publish"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { flexDirection: "row", alignItems: "center" },
  backText: { color: colors.accent, fontSize: font.small, fontWeight: "700" },
  actionsBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionChipText: { color: colors.textSecondary, fontSize: font.tiny, fontWeight: "600" },
  publishBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  publishText: { color: "#09090b", fontSize: font.tiny, fontWeight: "800" },
  visMenu: {
    position: "absolute",
    top: 96,
    left: spacing.md,
    zIndex: 30,
    width: 240,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 6,
  },
  visRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingVertical: 9, borderRadius: radius.sm },
  visRowText: { color: colors.textSecondary, fontSize: font.small },
  shareList: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingTop: 4, maxHeight: 200 },
  shareApply: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: 8,
    alignItems: "center",
    marginTop: 4,
  },
  shareApplyText: { color: "#09090b", fontSize: font.tiny, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800", marginBottom: spacing.md },
  qBlock: {
    borderLeftWidth: 2,
    borderLeftColor: colors.accentBorder,
    paddingLeft: spacing.md,
    paddingVertical: 4,
    marginBottom: spacing.lg,
  },
  qLabel: { color: colors.textMuted, fontSize: font.tiny, letterSpacing: 0.8, marginBottom: 4 },
  qText: { color: colors.textPrimary, fontSize: font.small },
  answerBlock: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  modelHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  modelName: { color: colors.accent, fontSize: font.small, fontWeight: "800" },
  emptyAnswer: { color: colors.textMuted, fontSize: font.small },
  pubBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.lg },
  pubCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  pubTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800" },
  pubSub: { color: colors.textMuted, fontSize: font.small, marginTop: 2, marginBottom: spacing.md },
  pubGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  pubChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pubChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pubChipText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  pubChipTextOn: { color: "#09090b" },
  pubInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: font.small,
    minHeight: 90,
    textAlignVertical: "top",
    marginBottom: spacing.md,
  },
  pubActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: spacing.md },
  pubCancel: { paddingHorizontal: 14, paddingVertical: 9 },
  pubCancelText: { color: colors.textMuted, fontSize: font.small, fontWeight: "600" },
  pubConfirm: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  pubConfirmText: { color: "#09090b", fontSize: font.small, fontWeight: "800" },
});
