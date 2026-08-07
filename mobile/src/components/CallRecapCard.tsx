import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font, radius, spacing } from "@/src/theme";

type Highlight = { kind?: string; note?: string; segment_id?: string };

const KIND: Record<string, { label: string; color: string; icon: any }> = {
  decision: { label: "Decision", color: "#22c55e", icon: "checkmark-circle" },
  action_item: { label: "Action", color: colors.accent, icon: "arrow-forward-circle" },
  risk: { label: "Risk", color: colors.danger, icon: "warning" },
  question: { label: "Question", color: "#38bdf8", icon: "help-circle" },
};

// AI recap card posted into a chat after a call ends. Collapsible list of the
// key decisions / action items / risks / questions from the call transcript.
export function CallRecapCard({ metadata }: { metadata: any }) {
  const [open, setOpen] = useState(true);
  const highlights: Highlight[] = Array.isArray(metadata?.highlights) ? metadata.highlights : [];
  const count = metadata?.count ?? highlights.length;

  return (
    <View style={styles.card} testID="call-recap-card">
      <Pressable testID="call-recap-toggle" onPress={() => setOpen((v) => !v)} style={styles.head}>
        <View style={styles.headIcon}>
          <Ionicons name="sparkles" size={16} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>AI call recap</Text>
          <Text style={styles.sub}>{count} key point{count === 1 ? "" : "s"} · tap to {open ? "hide" : "view"}</Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View style={styles.body}>
          {highlights.length === 0 ? (
            <Text style={styles.empty}>No transcript was captured for this call.</Text>
          ) : (
            highlights.map((h, i) => {
              const meta = KIND[h.kind || ""] || { label: h.kind || "Note", color: colors.textMuted, icon: "ellipse" };
              return (
                <View key={i} style={styles.item} testID={`recap-item-${i}`}>
                  <Ionicons name={meta.icon} size={14} color={meta.color} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.kind, { color: meta.color }]}>{meta.label}</Text>
                    <Text style={styles.note}>{h.note}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "stretch",
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.lg,
    marginVertical: spacing.sm,
    overflow: "hidden",
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  headIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accentDim, alignItems: "center", justifyContent: "center" },
  title: { color: colors.textPrimary, fontSize: font.small, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: font.tiny, marginTop: 1 },
  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  empty: { color: colors.textMuted, fontSize: font.small, fontStyle: "italic" },
  item: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  kind: { fontSize: font.tiny, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  note: { color: colors.textSecondary, fontSize: font.small, marginTop: 1, lineHeight: 18 },
});
