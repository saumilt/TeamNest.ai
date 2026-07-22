import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
import { NotificationBell } from "@/src/components/NotificationBell";
import { shortTime } from "@/src/format";
import { getItem, setItem } from "@/src/storage";
import { colors, font, radius, spacing } from "@/src/theme";

const WHATS_NEW_SEEN_KEY = "whatsnew_seen_v1";

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
  const [showNudge, setShowNudge] = useState(false);

  useEffect(() => {
    (async () => {
      const seen = await getItem(WHATS_NEW_SEEN_KEY);
      if (!seen) setShowNudge(true);
    })();
  }, []);

  const dismissNudge = useCallback(async () => {
    setShowNudge(false);
    await setItem(WHATS_NEW_SEEN_KEY, "1");
  }, []);

  const openWhatsNew = useCallback(async () => {
    await dismissNudge();
    router.push("/you");
  }, [dismissNudge]);

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
            {item.unread_count > 0 ? (
              <View style={styles.unreadBadge} testID={`chat-unread-${item.id}`}>
                <Text style={styles.unreadText}>
                  {item.unread_count > 99 ? "99+" : item.unread_count}
                </Text>
              </View>
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
        <View style={styles.headerActions}>
          <NotificationBell />
          <CreditsBadge />
        </View>
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
          ListHeaderComponent={
            showNudge ? (
              <TouchableOpacity
                testID="whats-new-nudge"
                activeOpacity={0.85}
                style={styles.nudge}
                onPress={openWhatsNew}
              >
                <View style={styles.nudgeIcon}>
                  <Ionicons name="sparkles" size={16} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nudgeTitle}>New in TeamNest</Text>
                  <Text style={styles.nudgeBody} numberOfLines={2}>
                    Dev OS, Role Intelligence &amp; AI Memory — see what&apos;s new
                  </Text>
                </View>
                <TouchableOpacity
                  testID="whats-new-nudge-dismiss"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={dismissNudge}
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            ) : null
          }
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
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
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
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: { color: "#09090b", fontSize: 11, fontWeight: "800" },
  sep: { height: 1, backgroundColor: colors.borderSubtle, marginLeft: 62 },
  nudge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  nudgeIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: "rgba(251,191,36,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  nudgeTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800" },
  nudgeBody: { color: colors.textSecondary, fontSize: font.small, marginTop: 1 },
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
