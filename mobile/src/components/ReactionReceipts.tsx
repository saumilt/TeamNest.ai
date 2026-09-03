import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Avatar } from "@/src/components/Avatar";
import { colors, radius, spacing } from "@/src/theme";

type Member = { id: string; name?: string; email?: string; avatar?: string | null };

/**
 * ReactionReceipts (mobile) — renders a message's persisted emoji reactions as
 * pills; tapping any pill opens a sheet listing WHO reacted with which emoji,
 * with a one-tap "Remove" for your own reaction.
 */
export function ReactionReceipts({
  reactions,
  members,
  myId,
  mine,
  onReact,
}: {
  reactions: Record<string, string[]>;
  members: Member[];
  myId?: string;
  mine?: boolean;
  onReact: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(reactions || {}).filter(([, u]) => (u || []).length > 0);
  if (entries.length === 0) return null;

  const memberFor = (id: string) => (members || []).find((x) => x.id === id) || null;
  const nameFor = (id: string) => {
    if (id === myId) return "You";
    const m = memberFor(id);
    return m?.name || m?.email || (String(id).startsWith("ai") ? "AI" : "Someone");
  };

  return (
    <>
      <View style={[styles.pillRow, mine ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
        {entries.map(([emoji, users]) => {
          const isMineReact = (users || []).includes(myId || "");
          return (
            <TouchableOpacity
              key={emoji}
              testID={`reaction-pill-${emoji}`}
              onPress={() => setOpen(true)}
              style={[styles.pill, isMineReact && styles.pillMine]}
              activeOpacity={0.8}
            >
              <Text style={styles.pillEmoji}>{emoji}</Text>
              <Text style={styles.pillCount}>{users.length}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} testID="reactions-info">
            <Text style={styles.title}>Reactions</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {entries.map(([emoji, users]) => (
                <View key={emoji} style={{ marginBottom: spacing.md }}>
                  <View style={styles.groupHead}>
                    <Text style={styles.groupEmoji}>{emoji}</Text>
                    <Text style={styles.groupCount}>{users.length}</Text>
                  </View>
                  {(users || []).map((uid) => (
                    <View key={uid} style={styles.personRow} testID={`reaction-user-${emoji}-${uid}`}>
                      <Avatar name={memberFor(uid)?.name || nameFor(uid)} src={memberFor(uid)?.avatar} size={28} />
                      <Text style={styles.personName} numberOfLines={1}>
                        {nameFor(uid)}
                      </Text>
                      {uid === myId && (
                        <TouchableOpacity
                          testID={`reaction-remove-${emoji}`}
                          onPress={() => {
                            onReact(emoji);
                            setOpen(false);
                          }}
                        >
                          <Text style={styles.removeText}>Remove</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillMine: { borderColor: colors.accentBorder, backgroundColor: "rgba(251,191,36,0.12)" },
  pillEmoji: { fontSize: 13 },
  pillCount: { fontSize: 11, color: colors.textMuted },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginBottom: spacing.md },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  groupEmoji: { fontSize: 16 },
  groupCount: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  personRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  personName: { color: colors.textPrimary, fontSize: 14, flex: 1 },
  removeText: { color: colors.danger, fontSize: 12, fontWeight: "700" },
  closeBtn: { marginTop: spacing.sm, alignSelf: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.xl },
  closeText: { color: colors.accent, fontSize: 14, fontWeight: "700" },
});
