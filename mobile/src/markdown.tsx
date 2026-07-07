import React from "react";
import { Linking, StyleSheet, Text, TextStyle, View } from "react-native";
import { colors } from "./theme";

// Lightweight markdown renderer for chat + AI answers. Handles the subset the
// backend emits: **bold**, `code`, [label](url), bullet lines (- / •) and
// blank-line paragraph spacing. Intentionally minimal — no external deps.

type Props = { content: string; color?: string; size?: number };

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function renderInline(text: string, color: string, size: number) {
  const parts = text.split(INLINE).filter((p) => p !== "");
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <Text key={i} style={{ color, fontSize: size, fontWeight: "700" }}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <Text
          key={i}
          style={{ color: colors.accent, fontSize: size - 1, fontFamily: "monospace" }}
        >
          {part.slice(1, -1)}
        </Text>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const url = link[2];
      return (
        <Text
          key={i}
          style={{ color: colors.accent, fontSize: size, textDecorationLine: "underline" }}
          onPress={() => Linking.openURL(url).catch(() => {})}
        >
          {link[1]}
        </Text>
      );
    }
    return (
      <Text key={i} style={{ color, fontSize: size }}>
        {part}
      </Text>
    );
  });
}

export function Markdown({ content, color = colors.textPrimary, size = 15 }: Props) {
  const lines = (content || "").replace(/\r/g, "").split("\n");
  const rowText: TextStyle = { color, fontSize: size, lineHeight: size + 7, flexShrink: 1 };
  return (
    <View>
      {lines.map((line, idx) => {
        if (line.trim() === "") return <View key={idx} style={{ height: size * 0.5 }} />;
        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        if (heading) {
          return (
            <Text
              key={idx}
              style={{ color, fontSize: size + 3, fontWeight: "700", marginVertical: 2 }}
            >
              {renderInline(heading[2], color, size + 3)}
            </Text>
          );
        }
        const bullet = line.match(/^\s*[-•]\s+(.*)$/);
        if (bullet) {
          return (
            <View key={idx} style={styles.bulletRow}>
              <Text style={{ color: colors.accent, fontSize: size, lineHeight: size + 7 }}>•  </Text>
              <Text style={rowText}>{renderInline(bullet[1], color, size)}</Text>
            </View>
          );
        }
        return (
          <Text key={idx} style={rowText}>
            {renderInline(line, color, size)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bulletRow: { flexDirection: "row", alignItems: "flex-start" },
});
