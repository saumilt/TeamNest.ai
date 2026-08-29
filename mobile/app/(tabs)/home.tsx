import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet } from "@/src/api";
import { useAuth } from "@/src/auth";
import { CreditsBadge } from "@/src/components/CreditsBadge";
import { NewChatSheet } from "@/src/components/NewChatSheet";
import { NewMenuSheet, NewOption } from "@/src/components/NewMenuSheet";
import { NotificationBell } from "@/src/components/NotificationBell";
import { colors, font, radius, spacing } from "@/src/theme";

type QuickAction = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

type Remember = {
  key: "my_memory" | "team_knowledge" | "research" | "decisions" | "documents";
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [overview, setOverview] = useState<any>(null);
  const [dash, setDash] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [flash, setFlash] = useState("");

  const say = (t: string) => { setFlash(t); setTimeout(() => setFlash(""), 2600); };

  const load = useCallback(async () => {
    try {
      const [ov, d] = await Promise.all([
        apiGet("/api/home/overview").catch(() => null),
        apiGet("/api/dashboard").catch(() => null),
      ]);
      setOverview(ov);
      setDash(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const firstName = user?.name ? user.name.split(" ")[0] : null;

  const quickActions: QuickAction[] = [
    { key: "research", title: "Start AI Research", subtitle: "Ask one AI or compare models", icon: "sparkles", onPress: () => router.push("/(tabs)/research") },
    { key: "chat", title: "Start a Conversation", subtitle: "Chat with people or an AI", icon: "chatbubbles", onPress: () => setShowNewChat(true) },
    { key: "meeting", title: "Host a Meeting", subtitle: "Meet, transcribe & summarize", icon: "videocam", onPress: () => say("Open a chat to start a meeting") },
    { key: "task", title: "Create a Task", subtitle: "Capture an action item", icon: "checkbox", onPress: () => router.push("/(tabs)/tasks") },
    { key: "docs", title: "Ask Your Documents", subtitle: "Upload files & ask with sources", icon: "document-text", onPress: () => router.push("/documents") },
    { key: "automate", title: "Automate Something", subtitle: "Let TeamNest do it for you", icon: "flash", onPress: () => router.push("/automations") },
  ];

  const r = overview?.remembers || {};
  const remembers: Remember[] = [
    { key: "my_memory", label: "My Memory", icon: "person", onPress: () => router.push("/memory") },
    { key: "team_knowledge", label: "Team Knowledge", icon: "library", onPress: () => router.push("/documents") },
    { key: "research", label: "Research", icon: "sparkles", onPress: () => router.push("/(tabs)/research") },
    { key: "decisions", label: "Decisions", icon: "git-branch", onPress: () => router.push("/memory") },
    { key: "documents", label: "Documents", icon: "folder", onPress: () => router.push("/documents") },
  ];

  const newOptions: NewOption[] = [
    { key: "research", label: "AI Research", desc: "Ask one AI or compare models", icon: "sparkles", onPress: () => router.push("/(tabs)/research") },
    { key: "chat", label: "Chat", desc: "Message people or an AI", icon: "chatbubbles", onPress: () => setShowNewChat(true) },
    { key: "task", label: "Task", desc: "Capture an action item", icon: "checkbox", onPress: () => router.push("/(tabs)/tasks") },
    { key: "document", label: "Document Research", desc: "Upload & ask with citations", icon: "document-text", onPress: () => router.push("/documents") },
    { key: "automation", label: "Automation", desc: "Let TeamNest do it for you", icon: "flash", onPress: () => router.push("/automations") },
    { key: "employee", label: "AI Employee", desc: "Build or hire an AI teammate", icon: "person-add", onPress: () => router.push("/marketplace") },
  ];

  const recentChats: any[] = dash?.recent_chats || [];
  const openTasks: any[] = dash?.open_tasks || [];

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]} testID="mobile-home">
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.kicker}>WORKSPACE / HOME</Text>
          <Text style={styles.h1} numberOfLines={1}>
            What do you want to do{firstName ? `, ${firstName}` : ""}?
          </Text>
        </View>
        <View style={styles.headerActions}>
          <NotificationBell />
          <CreditsBadge />
        </View>
      </View>

      <Pressable testID="home-new-btn" style={styles.newBtn} onPress={() => setShowNewMenu(true)}>
        <Ionicons name="add" size={20} color="#000" />
        <Text style={styles.newBtnText}>New</Text>
        <Text style={styles.newBtnHint}>What do you want to create?</Text>
      </Pressable>

      {flash ? <Text style={styles.flash} testID="home-flash">{flash}</Text> : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          <Text style={styles.section}>START SOMETHING</Text>
          <View style={styles.actionGrid}>
            {quickActions.map((a) => (
              <Pressable key={a.key} testID={`home-action-${a.key}`} style={styles.actionCard} onPress={a.onPress}>
                <View style={styles.actionIcon}>
                  <Ionicons name={a.icon} size={20} color={colors.accent} />
                </View>
                <Text style={styles.actionTitle}>{a.title}</Text>
                <Text style={styles.actionSub} numberOfLines={2}>{a.subtitle}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.section}>WHAT TEAMNEST REMEMBERS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rememberRow}>
            {remembers.map((m) => (
              <Pressable key={m.key} testID={`home-remember-${m.key}`} style={styles.rememberCard} onPress={m.onPress}>
                <Ionicons name={m.icon} size={16} color={colors.accent} />
                <Text style={styles.rememberCount}>{r[m.key] ?? 0}</Text>
                <Text style={styles.rememberLabel} numberOfLines={1}>{m.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.continueHead}>
            <Text style={styles.section}>CONTINUE WORKING</Text>
            <Pressable testID="home-view-chats" onPress={() => router.push("/(tabs)")}>
              <Text style={styles.viewAll}>ALL CHATS</Text>
            </Pressable>
          </View>

          {recentChats.length === 0 && openTasks.length === 0 && !(overview?.continue?.meetings || []).length && !(overview?.continue?.documents || []).length ? (
            <Text style={styles.empty}>Nothing yet — start something above.</Text>
          ) : null}

          {recentChats.slice(0, 4).map((c) => (
            <Pressable key={c.id} testID={`home-chat-${c.id}`} style={styles.listRow} onPress={() => router.push(`/chat/${c.id}`)}>
              <Ionicons name="chatbubble-ellipses" size={16} color={colors.textSecondary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.listTitle} numberOfLines={1}>{c.name || "Direct chat"}</Text>
                <Text style={styles.listSub} numberOfLines={1}>{c.last_message?.body?.slice(0, 60) || "—"}</Text>
              </View>
            </Pressable>
          ))}

          {openTasks.slice(0, 4).map((t) => (
            <Pressable key={t.id} testID={`home-task-${t.id}`} style={styles.listRow} onPress={() => router.push("/(tabs)/tasks")}>
              <Ionicons name="checkbox-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.listTitle} numberOfLines={1}>{t.title}</Text>
            </Pressable>
          ))}

          {(overview?.continue?.meetings || []).slice(0, 3).map((m: any) => (
            <Pressable key={m.id} testID={`home-meeting-${m.id}`} style={styles.listRow} onPress={() => { if (m.chat_id) router.push(`/chat/${m.chat_id}`); }}>
              <Ionicons name="videocam-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.listTitle} numberOfLines={1}>{m.title || "Meeting"}</Text>
              {m.status === "active" ? <Text style={styles.liveTag}>LIVE</Text> : null}
            </Pressable>
          ))}

          {(overview?.continue?.documents || []).slice(0, 3).map((d: any) => (
            <Pressable key={d.id} testID={`home-doc-${d.id}`} style={styles.listRow} onPress={() => router.push("/documents")}>
              <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.listTitle} numberOfLines={1}>{d.name || "Document"}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <NewChatSheet visible={showNewChat} onClose={() => setShowNewChat(false)} onChatCreated={(c) => { if (c?.id) router.push(`/chat/${c.id}`); }} />
      <NewMenuSheet visible={showNewMenu} onClose={() => setShowNewMenu(false)} options={newOptions} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md, marginBottom: spacing.md },
  kicker: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1.5, marginBottom: 4 },
  h1: { color: colors.textPrimary, fontSize: font.h2, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  newBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginBottom: spacing.md },
  newBtnText: { color: "#000", fontSize: font.body, fontWeight: "800" },
  newBtnHint: { color: "rgba(0,0,0,0.6)", fontSize: font.small, fontWeight: "600", marginLeft: "auto" },
  flash: { color: colors.accent, backgroundColor: colors.accentDim, textAlign: "center", paddingVertical: 6, borderRadius: radius.sm, marginBottom: spacing.sm, fontSize: font.small },
  center: { alignItems: "center", justifyContent: "center", paddingTop: 120 },
  section: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1.5, marginTop: spacing.md, marginBottom: spacing.sm },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actionCard: { width: "48%", flexGrow: 1, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  actionIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.accentDim, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  actionTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  actionSub: { color: colors.textMuted, fontSize: font.small, marginTop: 2 },
  rememberRow: { gap: spacing.sm, paddingRight: spacing.lg },
  rememberCard: { width: 110, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  rememberCount: { color: colors.textPrimary, fontSize: font.h2, fontWeight: "800", marginTop: 4 },
  rememberLabel: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  continueHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  viewAll: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1, marginTop: spacing.md },
  empty: { color: colors.textMuted, fontSize: font.small, paddingVertical: spacing.md },
  listRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  listTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "600", flex: 1 },
  liveTag: { color: colors.success, fontSize: font.tiny, fontWeight: "800", letterSpacing: 0.5 },
  listSub: { color: colors.textMuted, fontSize: font.small, marginTop: 1 },
});
