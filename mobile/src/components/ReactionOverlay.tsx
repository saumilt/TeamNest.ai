import { useCallback, useImperativeHandle, useState, forwardRef, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export type ReactionOverlayHandle = { spawn: (emoji: string) => void };

type Floater = { id: string; emoji: string; x: number };

// Live ephemeral reaction overlay: emojis float up and fade. Imperative —
// call ref.spawn(emoji) from a tap or an incoming WebSocket reaction event.
export const ReactionOverlay = forwardRef<ReactionOverlayHandle, object>((_props, ref) => {
  const [items, setItems] = useState<Floater[]>([]);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((f) => f.id !== id));
  }, []);

  useImperativeHandle(ref, () => ({
    spawn: (emoji: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const x = 12 + Math.random() * 60; // rightward spread from the trigger area
      setItems((prev) => [...prev.slice(-14), { id, emoji, x }]);
    },
  }));

  return (
    <View pointerEvents="none" style={styles.overlay}>
      {items.map((f) => (
        <FloatingEmoji key={f.id} emoji={f.emoji} x={f.x} onDone={() => remove(f.id)} />
      ))}
    </View>
  );
});

ReactionOverlay.displayName = "ReactionOverlay";

function FloatingEmoji({ emoji, x, onDone }: { emoji: string; x: number; onDone: () => void }) {
  const y = useSharedValue(0);
  const o = useSharedValue(0);
  const s = useSharedValue(0.6);
  const drift = useSharedValue(0);

  useEffect(() => {
    o.value = 1;
    o.value = withTiming(0, { duration: 1600 });
    s.value = withTiming(1.25, { duration: 700 });
    drift.value = withTiming((Math.random() - 0.5) * 40, { duration: 1600 });
    y.value = withTiming(-210, { duration: 1600 }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateY: y.value }, { translateX: drift.value }, { scale: s.value }],
  }));

  return <Animated.Text style={[styles.emoji, { right: x }, style]}>{emoji}</Animated.Text>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "flex-end", justifyContent: "flex-end" },
  emoji: { position: "absolute", bottom: 90, fontSize: 30 },
});
