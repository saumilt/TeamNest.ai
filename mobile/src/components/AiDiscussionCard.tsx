import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, font, radius, spacing } from "../theme";

// Compact reference to an AI discussion, shown in the Human view in place of a
// long AI answer so research stays linked without pushing the human
// conversation down. Tapping opens the full discussion.
export function AiDiscussionCard({
  discussion,
  onPress,
}: {
  discussion: any;
  onPress: () => void;
}) {
  const d = discussion || {};
  const q = d.question_count || 1;
  return (
    <TouchableOpacity
      testID={`ai-research-card-${d.id}`}
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.card}
    >
      <View style={styles.icon}>
        <Ionicons name="sparkles" size={15} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          {d.title || "AI research"}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          AI research · {d.creator_name || "AI"} · {q} question{q === 1 ? "" : "s"}
          {d.credits_used ? ` · ${d.credits_used} cr` : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
    maxWidth: "92%",
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentDim,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: "rgba(251,191,36,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.textPrimary, fontSize: font.small, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2 },
});
