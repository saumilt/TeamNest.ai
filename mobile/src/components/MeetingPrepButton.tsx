import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiPost } from "@/src/api";
import { Markdown } from "@/src/markdown";
import { colors, font, radius, spacing } from "@/src/theme";

type Props = { chatId?: string; callId?: string; title?: string; icon?: boolean };

/** "Prepare me" — briefs the user before a meeting from its chat + documents. */
export default function MeetingPrepButton({ chatId, callId, title, icon = false }: Props) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setOpen(true);
    setLoading(true);
    setError("");
    setBrief(null);
    try {
      const d = await apiPost("/api/ai/meeting-prep", { chat_id: chatId, call_id: callId });
      setBrief(d.brief);
    } catch (e: any) {
      setError(e?.message || "Couldn't prepare a brief");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Pressable
        testID="meeting-prep-btn"
        onPress={run}
        hitSlop={8}
        style={icon ? styles.iconBtn : styles.pill}
      >
        <Ionicons name="sparkles" size={icon ? 20 : 13} color={colors.accent} />
        {!icon ? <Text style={styles.pillText}>Prepare me</Text> : null}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={styles.overlay} testID="meeting-prep-dialog">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.head}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                <Ionicons name="sparkles" size={16} color={colors.accent} />
                <Text style={styles.title} numberOfLines={1}>Meeting prep{title ? ` · ${title}` : ""}</Text>
              </View>
              <Pressable testID="meeting-prep-close" onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
              {loading ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.dim}>Preparing your brief…</Text>
                </View>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {brief ? <View testID="meeting-prep-brief"><Markdown content={brief} /></View> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.accentBorder, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  pillText: { color: colors.accent, fontWeight: "700", fontSize: font.small },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "82%", borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  title: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800" },
  dim: { color: colors.textMuted, fontSize: font.small },
  error: { color: colors.danger, fontSize: font.small },
});
