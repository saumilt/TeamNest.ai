import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../theme";

// Deterministic circular avatar from a name/initials. AI senders get an amber
// accent so agents (@ai / @devmanager) read distinctly from teammates.
export function Avatar({
  name,
  size = 44,
  ai = false,
}: {
  name?: string;
  size?: number;
  ai?: boolean;
}) {
  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: radius.pill,
          backgroundColor: ai ? colors.accent : colors.surfaceHover,
        },
      ]}
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
  base: { alignItems: "center", justifyContent: "center" },
});
