import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AI_MODELS, RECOMMENDED_MODEL, modelName } from "../aiModels";
import { colors, font, radius, spacing } from "../theme";

// "Ask AI" compose sheet — opened from a specific human message. Seeds that
// message as context and lets the user type the question that starts a NEW
// discussion linked to the message (POST /api/ai/research with linked_message_id).
export function AiComposeModal({
  visible,
  contextMessage,
  senderName,
  defaultModels = [],
  submitting = false,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  contextMessage: any;
  senderName: string;
  defaultModels?: string[];
  submitting?: boolean;
  onSubmit: (question: string, models: string[]) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const [models, setModels] = useState<string[]>(
    defaultModels.length ? defaultModels : [RECOMMENDED_MODEL],
  );
  const [activeHint, setActiveHint] = useState<string | null>(null);

  const reset = () => {
    setQ("");
    setModels(defaultModels.length ? defaultModels : [RECOMMENDED_MODEL]);
  };

  const toggle = (key: string) =>
    setModels((prev) =>
      prev.includes(key)
        ? prev.length > 1
          ? prev.filter((k) => k !== key)
          : prev
        : [...prev, key],
    );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="ai-compose-discussion">
          <View style={styles.head}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="sparkles" size={16} color={colors.accent} />
              <Text style={styles.headTitle}>Ask AI</Text>
            </View>
            <TouchableOpacity
              testID="ai-compose-cancel"
              onPress={() => {
                reset();
                onCancel();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }}>
            <Text style={styles.label}>Research started from</Text>
            <View style={styles.quote}>
              <Text style={styles.quoteName}>{senderName || "Message"}</Text>
              <Text style={styles.quoteBody} numberOfLines={5}>
                {contextMessage?.body || "…"}
              </Text>
            </View>

            <TextInput
              testID="ai-compose-input"
              value={q}
              onChangeText={setQ}
              placeholder="What do you want to ask AI about this?"
              placeholderTextColor={colors.textMuted}
              multiline
              style={styles.input}
            />

            <Text style={[styles.label, { marginTop: spacing.md }]}>Models</Text>
            <View style={styles.grid}>
              {AI_MODELS.map((m) => {
                const on = models.includes(m.key);
                return (
                  <TouchableOpacity
                    key={m.key}
                    testID={`ai-compose-model-${m.key}`}
                    onPress={() => { setActiveHint(m.key); toggle(m.key); }}
                    activeOpacity={0.8}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    {m.fast && (
                      <Ionicons name="flash" size={11} color={on ? "#09090b" : colors.accent} />
                    )}
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{m.name}</Text>
                    {on && <Ionicons name="checkmark" size={12} color="#09090b" />}
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.modelHint} testID="ai-compose-model-hint">
              {(() => {
                const h = AI_MODELS.find((x) => x.key === (activeHint || RECOMMENDED_MODEL));
                return h?.hint ? `${h.name} — ${h.hint}` : "";
              })()}
            </Text>
          </ScrollView>

          <View style={styles.actions}>
            <Text style={styles.modelsSummary} numberOfLines={1}>
              {models.map(modelName).join(", ")}
            </Text>
            <TouchableOpacity
              testID="ai-compose-submit"
              disabled={!q.trim() || submitting}
              onPress={() => onSubmit(q.trim(), models)}
              style={[styles.submit, (!q.trim() || submitting) && styles.submitOff]}
            >
              <Ionicons name="sparkles" size={14} color="#09090b" />
              <Text style={styles.submitText}>{submitting ? "Asking…" : "Ask AI"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  headTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800" },
  label: { color: colors.textMuted, fontSize: font.tiny, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: colors.accentBorder,
    paddingLeft: spacing.md,
    paddingVertical: 4,
    marginBottom: spacing.md,
  },
  quoteName: { color: colors.textSecondary, fontSize: font.tiny, fontWeight: "700" },
  quoteBody: { color: colors.textPrimary, fontSize: font.small, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: font.body,
    minHeight: 90,
    textAlignVertical: "top",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modelHint: { color: colors.accent, fontSize: font.tiny, marginTop: spacing.sm, minHeight: 14 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  chipTextOn: { color: "#09090b" },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  modelsSummary: { flex: 1, color: colors.accent, fontSize: font.tiny, fontWeight: "700" },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  submitOff: { opacity: 0.4 },
  submitText: { color: "#09090b", fontSize: font.small, fontWeight: "800" },
});
