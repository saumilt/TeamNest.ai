import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost, getBase } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Markdown } from "@/src/markdown";
import { shortTime } from "@/src/format";
import { colors, font, radius, spacing } from "@/src/theme";

function isAgent(senderId: string) {
  return senderId?.startsWith("ai-");
}

function agentLabel(msg: any) {
  const role = msg?.metadata?.role_label;
  if (role) return role;
  if (msg.sender_id === "ai-system") return "System";
  if (msg.message_type === "ai_answer") return "AI Answer";
  if (msg.message_type === "ai_question") return "Question";
  return "AI";
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = String(id);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [chat, setChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [members, setMembers] = useState<Record<string, any>>({});
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const upsertMessage = useCallback((incoming: any) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === incoming.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = incoming;
        return next;
      }
      return [...prev, incoming];
    });
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [c, msgs] = await Promise.all([
          apiGet(`/api/chats/${chatId}`),
          apiGet(`/api/chats/${chatId}/messages?limit=200`),
        ]);
        if (!active) return;
        setChat(c);
        const map: Record<string, any> = {};
        (c.members || []).forEach((m: any) => (map[m.id] = m));
        setMembers(map);
        setMessages(Array.isArray(msgs) ? msgs.filter((m) => !m.deleted_at) : []);
      } catch {
        // leave empty
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [chatId]);

  // Real-time WebSocket
  useEffect(() => {
    let closed = false;
    (async () => {
      try {
        const { token } = await apiGet("/api/auth/ws-token");
        if (closed) return;
        const wsBase = getBase().replace(/^http/, "ws");
        const ws = new WebSocket(`${wsBase}/api/ws/${chatId}?token=${token}`);
        wsRef.current = ws;
        ws.onmessage = (ev) => {
          try {
            const payload = JSON.parse(ev.data);
            if (payload.event === "message" || payload.event === "message_updated") {
              if (payload.data && payload.data.chat_id === chatId) {
                if (payload.data.deleted_at) {
                  setMessages((prev) => prev.filter((m) => m.id !== payload.data.id));
                } else {
                  upsertMessage(payload.data);
                }
              }
            }
          } catch {}
        };
      } catch {}
    })();
    return () => {
      closed = true;
      try {
        wsRef.current?.close();
      } catch {}
      wsRef.current = null;
    };
  }, [chatId, upsertMessage]);

  useEffect(() => {
    if (messages.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setText("");
    setSending(true);
    try {
      const msg = await apiPost(`/api/chats/${chatId}/messages`, {
        body,
        message_type: "text",
      });
      upsertMessage(msg);
    } catch (e: any) {
      setText(body);
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const agent = isAgent(item.sender_id);
    const mine = item.sender_id === user?.id;
    const sender = members[item.sender_id];
    const isSystemEvent = item.metadata?.event;

    if (isSystemEvent) {
      return (
        <View style={styles.systemWrap}>
          <Text style={styles.systemText}>
            {(item.body || "").replace(/\*\*/g, "")}
          </Text>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.bubbleRow,
          mine ? styles.rowRight : styles.rowLeft,
        ]}
      >
        <View
          style={[
            styles.bubble,
            mine ? styles.bubbleMine : agent ? styles.bubbleAI : styles.bubbleOther,
          ]}
        >
          {!mine && (
            <Text style={[styles.senderName, agent && { color: colors.accent }]}>
              {agent ? agentLabel(item) : sender?.name || "Member"}
            </Text>
          )}
          <Markdown
            content={item.body || ""}
            color={mine ? "#faf7ef" : colors.textPrimary}
            size={15}
          />
          <Text style={styles.msgTime}>{shortTime(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  const title = chat?.type === "personal_ai" ? "My AI Assistant" : chat?.name || "Chat";
  const subtitle =
    chat?.type === "personal_ai"
      ? "Ask me anything with @ai"
      : `${(chat?.members || []).length} members`;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity testID="chat-back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        {chat?.linked_dev_project ? (
          <View style={styles.devPill}>
            <Ionicons name="hammer" size={12} color={colors.accent} />
            <Text style={styles.devPillText}>Dev OS</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.lg }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />
          <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
            <TextInput
              testID="chat-composer-input"
              value={text}
              onChangeText={setText}
              placeholder="Message · try @ai or @devmanager"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              multiline
            />
            <TouchableOpacity
              testID="chat-send-btn"
              onPress={send}
              disabled={!text.trim() || sending}
              style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            >
              {sending ? (
                <ActivityIndicator color="#09090b" size="small" />
              ) : (
                <Ionicons name="arrow-up" size={22} color="#09090b" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  backBtn: { padding: 2 },
  headerTitle: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "700" },
  headerSub: { color: colors.textMuted, fontSize: font.tiny },
  devPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accentDim,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  devPillText: { color: colors.accent, fontSize: font.tiny, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bubbleRow: { marginBottom: spacing.md, flexDirection: "row" },
  rowLeft: { justifyContent: "flex-start" },
  rowRight: { justifyContent: "flex-end" },
  bubble: { maxWidth: "84%", borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  bubbleMine: { backgroundColor: colors.bubbleMine, borderTopRightRadius: 4 },
  bubbleAI: { backgroundColor: colors.bubbleAI, borderWidth: 1, borderColor: colors.accentBorder, borderTopLeftRadius: 4 },
  bubbleOther: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: 4 },
  senderName: { fontSize: font.tiny, fontWeight: "700", color: colors.textSecondary, marginBottom: 3 },
  msgTime: { fontSize: 10, color: colors.textMuted, alignSelf: "flex-end", marginTop: 4 },
  systemWrap: { alignItems: "center", marginVertical: spacing.sm },
  systemText: {
    color: colors.textMuted,
    fontSize: font.tiny,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    overflow: "hidden",
    textAlign: "center",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 10,
    color: colors.textPrimary,
    fontSize: font.body,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
});
