import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors, radius, spacing } from "@/src/theme";

const EMOJIS = ["❤️", "👍", "🎉", "😂", "🔥"];

// Chat-header quick-react: a smiley trigger that expands a row of emojis. Tapping
// one fires a floating burst (rises + fades) and calls onReact so the reaction is
// broadcast to the chat. Purely additive delight — no layout impact when closed.
export function QuickReactBar({ onReact }: { onReact: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const [burstEmoji, setBurstEmoji] = useState("");
  const y = useSharedValue(0);
  const o = useSharedValue(0);
  const s = useSharedValue(1);

  const burstStyle = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateY: y.value }, { scale: s.value }],
  }));

  const react = (emoji: string) => {
    onReact(emoji);
    setBurstEmoji(emoji);
    y.value = 4;
    o.value = 1;
    s.value = 0.6;
    o.value = withTiming(0, { duration: 850 });
    y.value = withTiming(-72, { duration: 850 });
    s.value = withTiming(1.5, { duration: 850 });
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      {burstEmoji ? (
        <Animated.Text pointerEvents="none" style={[styles.burst, burstStyle]}>
          {burstEmoji}
        </Animated.Text>
      ) : null}
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
  burst: {
    position: "absolute",
    right: 0,
    top: -6,
    fontSize: 22,
    zIndex: 10,
  },
});
