import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { colors, radius, spacing } from "@/src/theme";

const EMOJIS = ["❤️", "👍", "🎉", "😂", "🔥"];

// Chat-header quick-react trigger: a smiley that expands an emoji row. Tapping
// calls onReact — the chat screen broadcasts it and the ReactionOverlay handles
// the live floating animation for everyone.
export function QuickReactBar({ onReact }: { onReact: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);

  const react = (emoji: string) => {
    onReact(emoji);
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      {open ? (
        <View style={styles.row}>
          {EMOJIS.map((e, i) => (
            <Animated.View key={e} entering={ZoomIn.delay(i * 35)}>
              <Pressable testID={`quick-react-${i}`} onPress={() => react(e)} style={styles.emojiBtn}>
                <Text style={styles.emoji}>{e}</Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      ) : null}
      <Pressable testID="chat-quick-react-btn" onPress={() => setOpen((v) => !v)} style={styles.trigger}>
        <Ionicons name={open ? "close" : "happy-outline"} size={20} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center" },
  trigger: { padding: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginRight: spacing.sm,
  },
  emojiBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  emoji: { fontSize: 20 },
});
