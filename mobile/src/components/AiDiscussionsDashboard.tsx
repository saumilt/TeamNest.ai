import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Avatar } from "./Avatar";
import { colors, font, radius, spacing } from "../theme";

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// The "AI" view — a research dashboard (not a message timeline) that groups AI
// discussions by the participant who created them.
export function AiDiscussionsDashboard({
  discussions = [],
  userId,
  onOpen,
}: {
  discussions: any[];
  userId?: string;
  onOpen: (id: string) => void;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return discussions;
    return discussions.filter(
      (d) =>
        (d.title || "").toLowerCase().includes(term) ||
        (d.creator_name || "").toLowerCase().includes(term),
    );
  }, [q, discussions]);

  const groups = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const d of filtered) {
      const key = d.created_by || "unknown";
      if (!g[key]) g[key] = [];
      g[key].push(d);
    }
    return Object.entries(g).sort((a, b) => {
      if (a[0] === userId) return -1;
      if (b[0] === userId) return 1;
      return b[1].length - a[1].length;
    });
  }, [filtered, userId]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.body}
      testID="ai-discussions-dashboard"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <Ionicons name="sparkles" size={16} color={colors.accent} />
        <Text style={styles.headerTitle}>AI Discussions</Text>
        <Text style={styles.headerCount}>{discussions.length}</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={14} color={colors.textMuted} />
        <TextInput
          testID="ai-discussions-search"
          value={q}
          onChangeText={setQ}
          placeholder="Search AI research…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      {discussions.length === 0 ? (
        <View style={styles.empty} testID="ai-discussions-empty">
          <Ionicons name="sparkles-outline" size={26} color={colors.accent} />
          <Text style={styles.emptyTitle}>No AI research yet</Text>
          <Text style={styles.emptyText}>
            Type @ai in the chat or use “Ask AI about this” on a message to start a
            discussion. It appears here without cluttering the human conversation.
          </Text>
        </View>
      ) : (
        groups.map(([uid, items]) => {
          const name = uid === userId ? "You" : items[0]?.creator_name || "Someone";
          return (
            <View key={uid} style={styles.group} testID={`ai-discussions-group-${uid}`}>
              <View style={styles.groupHead}>
                <Avatar name={name} size={22} />
                <Text style={styles.groupName}>{name}</Text>
                <Text style={styles.groupCount}>· {items.length}</Text>
              </View>
              {items.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  testID={`ai-discussion-item-${d.id}`}
                  onPress={() => onOpen(d.id)}
                  activeOpacity={0.85}
                  style={styles.item}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {d.title}
                    </Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.meta}>{d.question_count} Q</Text>
                      <Text style={styles.meta}>· {d.answer_count} answers</Text>
                      {d.credits_used ? (
                        <Text style={styles.meta}>· {d.credits_used} cr</Text>
                      ) : null}
                      <Text style={styles.meta}>· {timeAgo(d.updated_at)}</Text>
                      <View style={styles.visTag}>
                        <Ionicons
                          name={d.visibility === "private" ? "lock-closed" : "people"}
                          size={10}
                          color={colors.textMuted}
                        />
                        <Text style={styles.visTagText}>
                          {d.visibility === "private" ? "Private" : "Chat"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  headerTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  headerCount: { color: colors.textMuted, fontSize: font.small },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: font.small, paddingVertical: 9 },
  empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  emptyText: { color: colors.textMuted, fontSize: font.small, textAlign: "center", lineHeight: 19 },
  group: { marginBottom: spacing.xl },
  groupHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  groupName: { color: colors.textSecondary, fontSize: font.small, fontWeight: "700" },
  groupCount: { color: colors.textMuted, fontSize: font.tiny },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  itemTitle: { color: colors.textPrimary, fontSize: font.small, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5, marginTop: 4 },
  meta: { color: colors.textMuted, fontSize: font.tiny },
  visTag: { flexDirection: "row", alignItems: "center", gap: 3 },
  visTagText: { color: colors.textMuted, fontSize: font.tiny },
});
