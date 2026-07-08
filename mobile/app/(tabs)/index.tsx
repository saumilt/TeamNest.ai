import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet } from "@/src/api";
import { Avatar } from "@/src/components/Avatar";
import { CreditsBadge } from "@/src/components/CreditsBadge";
import { shortTime } from "@/src/format";
import { colors, font, radius, spacing } from "@/src/theme";

function chatTitle(c: any): string {
  if (c.type === "personal_ai") return c.name || "My AI Assistant";
  if (c.name) return c.name;
  return c.type === "direct" ? "Direct chat" : "Group chat";
}

function previewText(c: any): string {
  const lm = c.last_message;
  if (!lm) return "No messages yet";
  const body = (lm.body || "").replace(/\n/g, " ").replace(/[*#`>]/g, "");
  const sid = lm.sender_id || "";
  if (sid.startsWith("ai-")) return `AI · ${body}`;
  return body || "…";
}

export default function ChatsScreen() {
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiGet("/api/chats");
      setChats(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || "Could not load chats");
      setChats([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: any }) => {
    const isAI = item.type === "personal_ai";
    const lm = item.last_message;
    return (
      <TouchableOpacity
        testID={`chat-row-${item.id}`}
        activeOpacity={0.7}
        style={styles.row}
        onPress={() => router.push(`/chat/${item.id}`)}
      >
        <Avatar name={chatTitle(item)} ai={isAI} size={50} />
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={styles.title} numberOfLines={1}>
              {chatTitle(item)}
            </Text>
            <Text style={styles.time}>{shortTime(lm?.created_at)}</Text>
          </View>
          <View style={styles.rowTop}>
            <Text style={styles.preview} numberOfLines={1}>
              {previewText(item)}
            </Text>
            {item.linked_dev_project ? (
              <Ionicons name="hammer" size={13} color={colors.accent} />
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Text style={styles.h1}>Chats</Text>
        <CreditsBadge />
      </View>

      {chats === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                {error || "No chats yet"}
              </Text>
              <TouchableOpacity onPress={load} style={styles.retryBtn} testID="chats-retry">
                <Text style={styles.retryText}>Reload</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  h1: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800" },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkText: { color: "#09090b", fontWeight: "800", fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, gap: spacing.md },
  rowBody: { flex: 1, gap: 3 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "700", flex: 1 },
  time: { color: colors.textMuted, fontSize: font.tiny },
  preview: { color: colors.textSecondary, fontSize: font.small, flex: 1 },
  sep: { height: 1, backgroundColor: colors.borderSubtle, marginLeft: 62 },
  center: { alignItems: "center", justifyContent: "center", paddingTop: 120, gap: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: font.body },
  retryBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  retryText: { color: colors.accent, fontWeight: "700" },
});
