import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Avatar } from "@/src/components/Avatar";
import { groupAvatarProps } from "@/src/components/groupAvatarPresets";
import { CreditsBadge } from "@/src/components/CreditsBadge";
import { NewChatSheet } from "@/src/components/NewChatSheet";
import { NotificationBell } from "@/src/components/NotificationBell";
import { shortTime } from "@/src/format";
import { getItem, setItem } from "@/src/storage";
import { colors, font, radius, spacing } from "@/src/theme";

const WHATS_NEW_SEEN_KEY = "whatsnew_seen_v1";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "direct", label: "Direct" },
  { value: "group", label: "Groups" },
  { value: "ai", label: "AI" },
  { value: "unread", label: "Unread" },
];

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
  const { user, setUser } = useAuth();
  const [chats, setChats] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showNudge, setShowNudge] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [folders, setFolders] = useState<any[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const activeWsId = user?.workspace_id;

  useEffect(() => {
    (async () => {
      const seen = await getItem(WHATS_NEW_SEEN_KEY);
      if (!seen) setShowNudge(true);
    })();
  }, []);

  const say = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 2600); };

  const dismissNudge = useCallback(async () => {
    setShowNudge(false);
    await setItem(WHATS_NEW_SEEN_KEY, "1");
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiGet("/api/chats");
      setChats(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || "Could not load chats");
      setChats([]);
    }
    apiGet("/api/me/workspaces").then((w) => setWorkspaces(Array.isArray(w) ? w : [])).catch(() => {});
    apiGet("/api/folders").then((f) => setFolders(Array.isArray(f) ? f : [])).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const switchWs = async (wsId: string) => {
    setWsMenuOpen(false);
    if (wsId === activeWsId) return;
    setSwitching(true);
    try {
      const res = await apiPost("/api/workspace/switch", { workspace_id: wsId });
      if (res?.user) setUser(res.user);
      setActiveFolder(null);
      setChats(null);
      await load();
      say(`Switched to ${workspaces.find((w) => w.workspace_id === wsId)?.name || "workspace"}`);
    } catch {
      say("Could not switch workspace");
    } finally {
      setSwitching(false);
    }
  };

  const onChatCreated = (chat: any) => {
    if (chat?.id) {
      load();
      router.push(`/chat/${chat.id}`);
    }
  };

  const filteredChats = (() => {
    let list = chats || [];
    if (filter === "direct") list = list.filter((c) => c.type === "direct");
    else if (filter === "group") list = list.filter((c) => c.type === "group");
    else if (filter === "ai") list = list.filter((c) => c.type === "personal_ai");
    else if (filter === "unread") list = list.filter((c) => c.unread_count > 0);
    if (activeFolder) list = list.filter((c) => c.project_folder_id === activeFolder);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => chatTitle(c).toLowerCase().includes(q));
    }
    return list;
  })();

  const activeWs = workspaces.find((w) => w.workspace_id === activeWsId);

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
        <Avatar name={chatTitle(item)} ai={isAI} size={50} {...groupAvatarProps(item)} />
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={styles.title} numberOfLines={1}>{chatTitle(item)}</Text>
            <Text style={styles.time}>{shortTime(lm?.created_at)}</Text>
          </View>
          <View style={styles.rowTop}>
            <Text style={styles.preview} numberOfLines={1}>{previewText(item)}</Text>
            {item.linked_dev_project ? <Ionicons name="hammer" size={13} color={colors.accent} /> : null}
            {item.unread_count > 0 ? (
              <View style={styles.unreadBadge} testID={`chat-unread-${item.id}`}>
                <Text style={styles.unreadText}>{item.unread_count > 99 ? "99+" : item.unread_count}</Text>
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
          <TouchableOpacity testID="chats-search-toggle" onPress={() => setShowSearch((s) => !s)} style={styles.iconBtn}>
            <Ionicons name="search" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <NotificationBell />
          <CreditsBadge />
          <TouchableOpacity testID="new-chat-btn" onPress={() => setShowNewChat(true)} style={styles.newChatBtn}>
            <Ionicons name="create-outline" size={18} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      {workspaces.length > 1 ? (
        <TouchableOpacity testID="workspace-select-btn" style={styles.wsBar} onPress={() => setWsMenuOpen(true)} disabled={switching}>
          <Ionicons name="business-outline" size={15} color={colors.accent} />
          <Text style={styles.wsName} numberOfLines={1}>{activeWs?.name || "Workspace"}</Text>
          {switching ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="chevron-down" size={15} color={colors.textMuted} />}
        </TouchableOpacity>
      ) : null}

      {showSearch ? (
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            testID="chats-search-input"
            value={search}
            onChangeText={setSearch}
            placeholder="Search chats…"
            placeholderTextColor={colors.textMuted}
            autoFocus
            style={{ flex: 1, color: colors.textPrimary, fontSize: font.body, paddingVertical: 8 }}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")} testID="chats-search-clear">
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipRowContent}>
        {FILTERS.map((f) => {
          const on = f.value === filter;
          return (
            <TouchableOpacity key={f.value} testID={`chat-filter-${f.value}`} onPress={() => setFilter(f.value)} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {folders.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.folderRow} contentContainerStyle={styles.chipRowContent}>
          <TouchableOpacity testID="folder-all" onPress={() => setActiveFolder(null)} style={[styles.folderChip, !activeFolder && styles.folderChipOn]}>
            <Ionicons name="folder-outline" size={12} color={!activeFolder ? colors.accent : colors.textMuted} />
            <Text style={[styles.folderText, !activeFolder && styles.folderTextOn]}>All folders</Text>
          </TouchableOpacity>
          {folders.map((fo) => {
            const on = activeFolder === fo.id;
            return (
              <TouchableOpacity key={fo.id} testID={`folder-${fo.id}`} onPress={() => setActiveFolder(on ? null : fo.id)} style={[styles.folderChip, on && styles.folderChipOn]}>
                <Ionicons name="folder" size={12} color={on ? colors.accent : colors.textMuted} />
                <Text style={[styles.folderText, on && styles.folderTextOn]} numberOfLines={1}>{fo.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {msg ? <Text style={styles.flash} testID="chats-flash">{msg}</Text> : null}

      {chats === null ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>
      ) : (
        <FlatList
          data={filteredChats}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListHeaderComponent={
            showNudge ? (
              <TouchableOpacity testID="whats-new-nudge" activeOpacity={0.85} style={styles.nudge} onPress={dismissNudge}>
                <View style={styles.nudgeIcon}><Ionicons name="sparkles" size={16} color={colors.accent} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nudgeTitle}>New in TeamNest</Text>
                  <Text style={styles.nudgeBody} numberOfLines={2}>Start new chats, filter by type & switch workspaces — right here</Text>
                </View>
                <TouchableOpacity testID="whats-new-nudge-dismiss" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} onPress={dismissNudge}>
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            ) : null
          }
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>{error || (filter === "all" && !search ? "No chats yet" : "No chats match this filter")}</Text>
              <TouchableOpacity onPress={() => setShowNewChat(true)} style={styles.retryBtn} testID="chats-empty-new">
                <Text style={styles.retryText}>Start a chat</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <NewChatSheet visible={showNewChat} onClose={() => setShowNewChat(false)} onChatCreated={onChatCreated} />

      <Modal visible={wsMenuOpen} transparent animationType="fade" onRequestClose={() => setWsMenuOpen(false)}>
        <Pressable style={styles.wsOverlay} onPress={() => setWsMenuOpen(false)}>
          <View style={[styles.wsMenu, { marginTop: insets.top + 90 }]} testID="workspace-select-menu">
            <Text style={styles.wsMenuLabel}>SWITCH WORKSPACE</Text>
            {workspaces.map((w) => {
              const on = w.workspace_id === activeWsId;
              return (
                <TouchableOpacity key={w.workspace_id} testID={`workspace-option-${w.workspace_id}`} style={styles.wsOption} onPress={() => switchWs(w.workspace_id)}>
                  <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={18} color={on ? colors.accent : colors.textMuted} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.wsOptName} numberOfLines={1}>{w.name}</Text>
                    {w.role ? <Text style={styles.wsOptRole}>{w.role}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  h1: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  newChatBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  wsBar: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 9, marginBottom: spacing.sm },
  wsName: { flex: 1, color: colors.textPrimary, fontSize: font.small, fontWeight: "600" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  chipRow: { flexGrow: 0, marginBottom: spacing.sm },
  chipRowContent: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.accentDim, borderColor: colors.accentBorder },
  chipText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  chipTextOn: { color: colors.accent },
  folderRow: { flexGrow: 0, marginBottom: spacing.sm },
  folderChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, maxWidth: 160 },
  folderChipOn: { borderStyle: "solid", backgroundColor: colors.accentDim, borderColor: colors.accentBorder },
  folderText: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "600" },
  folderTextOn: { color: colors.accent },
  flash: { color: colors.accent, backgroundColor: colors.accentDim, textAlign: "center", paddingVertical: 6, borderRadius: radius.sm, marginBottom: spacing.sm, fontSize: font.small },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, gap: spacing.md },
  rowBody: { flex: 1, gap: 3 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "700", flex: 1 },
  time: { color: colors.textMuted, fontSize: font.tiny },
  preview: { color: colors.textSecondary, fontSize: font.small, flex: 1 },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  unreadText: { color: "#09090b", fontSize: 11, fontWeight: "800" },
  sep: { height: 1, backgroundColor: colors.borderSubtle, marginLeft: 62 },
  nudge: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentBorder, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  nudgeIcon: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: "rgba(251,191,36,0.16)", alignItems: "center", justifyContent: "center" },
  nudgeTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800" },
  nudgeBody: { color: colors.textSecondary, fontSize: font.small, marginTop: 1 },
  center: { alignItems: "center", justifyContent: "center", paddingTop: 120, gap: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: font.body, textAlign: "center", paddingHorizontal: spacing.xl },
  retryBtn: { marginTop: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.accentBorder },
  retryText: { color: colors.accent, fontWeight: "700" },
  wsOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  wsMenu: { marginHorizontal: spacing.lg, backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  wsMenuLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1, marginBottom: spacing.sm, paddingHorizontal: spacing.sm },
  wsOption: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.sm },
  wsOptName: { color: colors.textPrimary, fontSize: font.body, fontWeight: "600" },
  wsOptRole: { color: colors.textMuted, fontSize: font.tiny, textTransform: "uppercase" },
});
