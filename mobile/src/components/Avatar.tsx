import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../theme";

// Deterministic circular avatar. Priority: uploaded photo (`src`) → preset
// icon+color (group avatars) → name initials. AI senders get an amber accent.
export function Avatar({
  name,
  size = 44,
  ai = false,
  src,
  icon,
  color,
}: {
  name?: string;
  size?: number;
  ai?: boolean;
  src?: string | null;
  icon?: any;
  color?: string | null;
}) {
  const dim = { width: size, height: size, borderRadius: radius.pill };

  if (src) {
    return (
      <Image source={{ uri: src }} style={[styles.base, dim]} contentFit="cover" transition={120} />
    );
  }

  if (icon) {
    return (
      <View style={[styles.base, dim, { backgroundColor: color || colors.accent }]}>
        <Ionicons name={icon} size={size * 0.5} color="#09090b" />
      </View>
    );
  }

  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <View
      style={[styles.base, dim, { backgroundColor: ai ? colors.accent : colors.surfaceHover }]}
    >
      <Text
        style={{
          color: ai ? "#09090b" : colors.textPrimary,
          fontWeight: "700",
          fontSize: size * 0.38,
        }}
      >
        {ai ? "AI" : initials || "?"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
