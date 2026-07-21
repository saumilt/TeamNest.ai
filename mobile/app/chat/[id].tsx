import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost, apiUpload, getBase } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Markdown } from "@/src/markdown";
import { MessageAttachments } from "@/src/components/MessageAttachments";
import { shortTime } from "@/src/format";
import { colors, font, radius, spacing } from "@/src/theme";

function isAgent(senderId: string) {
  return senderId?.startsWith("ai-");
}

function agentLabel(msg: any) {
  const role = msg?.metadata?.role_label;
  if (role) return role;
  if (msg.message_type === "ai_answer") return "AI Answer";
  if (msg.message_type === "ai_question") return "Question";
  if (msg.sender_id === "ai-system") return "System";
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
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [aiSession, setAiSession] = useState<any>({ active: false });
  const [saveRoleOpen, setSaveRoleOpen] = useState(false);
  const [roles, setRoles] = useState<any[]>([]);
  const listRef = useRef<FlatList>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isPersonalAI = chat?.type === "personal_ai";

  const refreshAiSession = useCallback(async () => {
    try {
      const s = await apiGet(`/api/chats/${chatId}/ai-session`);
      setAiSession(s || { active: false });
    } catch {
      /* best-effort */
    }
  }, [chatId]);

  const exitAiSession = useCallback(async () => {
    try {
      await apiPost(`/api/chats/${chatId}/ai-session/exit`, {});
    } catch {}
    setAiSession({ active: false });
  }, [chatId]);

  const onFollowUp = useCallback(
    async (label: string, _msg: any) => {
      try {
        const m = await apiPost(`/api/chats/${chatId}/messages`, {
          body: label,
          message_type: "text",
          metadata: {},
        });
        upsertMessage(m);
        setTimeout(refreshAiSession, 4500);
      } catch {}
    },
    [chatId, refreshAiSession],
  );

  const onRouteChoice = useCallback(
    async (messageId: string, to: "ai" | "chat") => {
      try {
        await apiPost(`/api/chats/${chatId}/ai-session/route`, {
          message_id: messageId,
          to,
        });
        if (to === "ai") setTimeout(refreshAiSession, 4500);
      } catch {}
    },
    [chatId, refreshAiSession],
  );

  const openSaveRole = useCallback(async () => {
    try {
      const r = await apiGet("/api/ai-conversation/roles");
      setRoles(r.roles || []);
      setSaveRoleOpen(true);
    } catch {
      Alert.alert("Error", "Failed to load roles");
    }
  }, []);

  const saveToRole = useCallback(
    async (roleId: string) => {
      setSaveRoleOpen(false);
      try {
        const r = await apiPost(`/api/chats/${chatId}/save-to-role`, { role_id: roleId });
        if (r.proposed > 0) {
          Alert.alert("Sent for review", `${r.proposed} item(s) sent to Role Intelligence.`);
        } else {
          Alert.alert("Nothing to save", r.note || "No durable knowledge was found.");
        }
      } catch (e: any) {
        Alert.alert("Error", e?.message || "Failed to save");
      }
    },
    [chatId],
  );

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
        refreshAiSession();
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

  // Polling safety-net (mirrors web): WebSocket delivery can be blocked in some
  // deployed environments, so poll the open chat and reconcile so new/edited
  // messages appear without a manual refresh. No-op when WS is already healthy.
  useEffect(() => {
    let closed = false;
    const tick = async () => {
      try {
        const msgs = await apiGet(`/api/chats/${chatId}/messages?limit=200`);
        if (closed || !Array.isArray(msgs)) return;
        const next = msgs.filter((m: any) => !m.deleted_at);
        setMessages((prev) => {
          const a = prev[prev.length - 1];
          const b = next[next.length - 1];
          const unchanged =
            prev.length === next.length &&
            ((!a && !b) || (a && b && a.id === b.id && a.edited_at === b.edited_at));
          return unchanged ? prev : next;
        });
      } catch {}
    };
    const iv = setInterval(tick, 4000);
    return () => {
      closed = true;
      clearInterval(iv);
    };
  }, [chatId]);


  useEffect(() => {
    if (messages.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  const uploadAsset = async (asset: { uri: string; name: string; type: string }) => {
    setUploading(true);
    try {
      const data = await apiUpload("/api/uploads", asset, { chat_id: chatId });
      setAttachments((prev) => [...prev, data]);
    } catch (e: any) {
      Alert.alert("Upload failed", e.message || "Could not upload that file.");
    } finally {
      setUploading(false);
    }
  };

  const pickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      for (const a of res.assets.slice(0, 30)) {
        await uploadAsset({
          uri: a.uri,
          name: a.name || "file",
          type: a.mimeType || "application/octet-stream",
        });
      }
    } catch (e: any) {
      Alert.alert("Could not pick file", e.message || "");
    }
  };

  const pickImage = async () => {
    // Contextual permission flow for the photo library.
    let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (perm.status !== "granted" && perm.canAskAgain) {
      perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }
    if (perm.status !== "granted") {
      Alert.alert(
        "Photo access needed",
        "Allow photo access to attach images for the AI to analyze.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (res.canceled) return;
    for (const a of res.assets) {
      const name = a.fileName || a.uri.split("/").pop() || "photo.jpg";
      await uploadAsset({ uri: a.uri, name, type: a.mimeType || "image/jpeg" });
    }
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && attachments.length === 0) || sending) return;
    const outAttachments = attachments;
    const outBody =
      body || (outAttachments.length ? `Sent ${outAttachments.length} file(s)` : "");
    setText("");
    setAttachments([]);
    setSending(true);
    try {
      const msg = await apiPost(`/api/chats/${chatId}/messages`, {
        body: outBody,
        message_type: "text",
        metadata: outAttachments.length ? { attachments: outAttachments } : {},
      });
      upsertMessage(msg);
    } catch (e: any) {
      setText(body);
      setAttachments(outAttachments);
    } finally {
      setSending(false);
    }
    setTimeout(refreshAiSession, 4500);
  };

  // One-tap document action: send immediately with a preset @ai prompt.
  const sendQuick = async (prompt: string) => {
    if (attachments.length === 0 || sending) return;
    const outAttachments = attachments;
    setAttachments([]);
    setSending(true);
    try {
      const msg = await apiPost(`/api/chats/${chatId}/messages`, {
        body: prompt,
        message_type: "text",
        metadata: { attachments: outAttachments },
      });
      upsertMessage(msg);
    } catch {
      setAttachments(outAttachments);
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
          <MessageAttachments attachments={item.metadata?.attachments} />
          <Markdown
            content={item.body || ""}
            color={mine ? "#faf7ef" : colors.textPrimary}
            size={15}
          />
          <Text style={styles.msgTime}>{shortTime(item.created_at)}</Text>

          {/* AI Conversation Mode — follow-up chips under AI answers */}
          {item.message_type === "ai_answer" &&
            Array.isArray(item.metadata?.follow_up_suggestions) && (
              <View style={styles.followRow} testID={`followups-${item.id}`}>
                {item.metadata.follow_up_suggestions.map((s: string) => (
                  <TouchableOpacity
                    key={s}
                    testID={`followup-${s.toLowerCase().replace(/\s+/g, "-")}`}
                    style={styles.followChip}
                    onPress={() => onFollowUp(s, item)}
                  >
                    <Text style={styles.followChipText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

          {/* AI Conversation Mode — inline "Continue with AI?" for ambiguous msg */}
          {mine && item.metadata?.pending_ai_route && (
            <View style={styles.routeChoice} testID={`route-choice-${item.id}`}>
              <Text style={styles.routeChoiceLabel}>Continue with AI?</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TouchableOpacity
                  testID={`route-ai-${item.id}`}
                  style={styles.routeYes}
                  onPress={() => onRouteChoice(item.id, "ai")}
                >
                  <Text style={styles.routeYesText}>Yes, ask AI</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`route-chat-${item.id}`}
                  style={styles.routeNo}
                  onPress={() => onRouteChoice(item.id, "chat")}
                >
                  <Text style={styles.routeNoText}>Send to chat</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
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
        <TouchableOpacity
          testID="chat-save-to-role-btn"
          onPress={openSaveRole}
          style={styles.backBtn}
          accessibilityLabel="Save to Role Intelligence"
        >
          <Ionicons name="bookmark-outline" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
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
            data={messages.filter((m) => m.message_type !== "ai_question")}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.lg }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />
          <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
            {aiSession?.active && (
              <View style={styles.aiIndicator} testID="ai-conversation-indicator">
                <View style={styles.aiIndicatorLeft}>
                  <Ionicons name="sparkles" size={14} color={colors.accent} />
                  <Text style={styles.aiIndicatorText}>Continuing with @ai</Text>
                </View>
                <TouchableOpacity
                  testID="ai-conversation-exit"
                  onPress={exitAiSession}
                  style={styles.aiIndicatorExit}
                >
                  <Ionicons name="close" size={13} color={colors.textMuted} />
                  <Text style={styles.aiIndicatorExitText}>Exit AI</Text>
                </TouchableOpacity>
              </View>
            )}
            {attachments.length > 0 && (
              <View style={styles.quickRow} testID="file-quick-actions">
                <TouchableOpacity
                  testID="quick-action-summarize"
                  style={styles.quickChip}
                  onPress={() =>
                    sendQuick("@ai Summarize the attached file(s) in a few clear bullet points.")
                  }
                >
                  <Ionicons name="sparkles" size={13} color={colors.accent} />
                  <Text style={styles.quickChipText}>Summarize</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="quick-action-action-items"
                  style={styles.quickChip}
                  onPress={() =>
                    sendQuick(
                      "@ai Extract the action items, owners and key decisions from the attached file(s) as a checklist.",
                    )
                  }
                >
                  <Ionicons name="checkbox-outline" size={13} color={colors.accent} />
                  <Text style={styles.quickChipText}>Extract action items</Text>
                </TouchableOpacity>
              </View>
            )}
            {attachments.length > 0 && (
              <View style={styles.chipsRow} testID="composer-attachments">
                {attachments.map((a, i) => (
                  <View key={a.id || i} style={styles.attChip}>
                    <Ionicons
                      name={a.is_image ? "image" : "document-text"}
                      size={14}
                      color={colors.accent}
                    />
                    <Text style={styles.attChipText} numberOfLines={1}>
                      {a.filename}
                    </Text>
                    <TouchableOpacity
                      testID={`remove-attachment-${a.id}`}
                      onPress={() =>
                        setAttachments((prev) => prev.filter((x) => x.id !== a.id))
                      }
                    >
                      <Ionicons name="close" size={15} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.composerRow}>
              <TouchableOpacity
                testID="attach-doc-btn"
                onPress={pickDocument}
                disabled={uploading}
                style={styles.attachBtn}
              >
                {uploading ? (
                  <ActivityIndicator color={colors.accent} size="small" />
                ) : (
                  <Ionicons name="attach" size={23} color={colors.textSecondary} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                testID="attach-image-btn"
                onPress={pickImage}
                disabled={uploading}
                style={styles.attachBtn}
              >
                <Ionicons name="image-outline" size={21} color={colors.textSecondary} />
              </TouchableOpacity>
              <TextInput
                testID="chat-composer-input"
                value={text}
                onChangeText={setText}
                placeholder={
                  aiSession?.active
                    ? "Ask a follow-up…"
                    : isPersonalAI
                      ? "Attach a file or ask anything…"
                      : "Message · try @ai or @devmanager"
                }
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                multiline
              />
              <TouchableOpacity
                testID="chat-send-btn"
                onPress={send}
                disabled={(!text.trim() && attachments.length === 0) || sending}
                style={[
                  styles.sendBtn,
                  ((!text.trim() && attachments.length === 0) || sending) &&
                    styles.sendBtnDisabled,
                ]}
              >
                {sending ? (
                  <ActivityIndicator color="#09090b" size="small" />
                ) : (
                  <Ionicons name="arrow-up" size={22} color="#09090b" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      <Modal visible={saveRoleOpen} transparent animationType="fade" onRequestClose={() => setSaveRoleOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSaveRoleOpen(false)}>
          <View style={styles.modalCard} testID="save-to-role-modal">
            <Text style={styles.modalTitle}>Save to Role Intelligence</Text>
            <Text style={styles.modalSub}>Staged for owner review before it&apos;s added to the role.</Text>
            {roles.length === 0 ? (
              <Text style={styles.rolesEmpty}>No roles defined yet.</Text>
            ) : (
              roles.map((r) => (
                <TouchableOpacity key={r.id} testID={`save-role-${r.id}`} style={styles.roleRow} onPress={() => saveToRole(r.id)}>
                  <Ionicons name="business-outline" size={16} color={colors.accent} />
                  <Text style={styles.roleName}>{r.role_name}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </TouchableOpacity>
      </Modal>
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
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.lg },
  modalCard: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  modalTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800" },
  modalSub: { color: colors.textMuted, fontSize: font.small, marginTop: 2, marginBottom: spacing.md },
  rolesEmpty: { color: colors.textMuted, fontSize: font.small, paddingVertical: spacing.md },
  roleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  roleName: { color: colors.textPrimary, fontSize: font.small, fontWeight: "600" },
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
  followRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  followChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.bg,
  },
  followChipText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  routeChoice: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentDim,
    borderRadius: radius.md,
    padding: 8,
    gap: 6,
  },
  routeChoiceLabel: { color: colors.textSecondary, fontSize: 11 },
  routeYes: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  routeYesText: { color: "#09090b", fontWeight: "800", fontSize: 11 },
  routeNo: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  routeNoText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  aiIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentDim,
    borderRadius: radius.pill,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    marginBottom: 8,
  },
  aiIndicatorLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiIndicatorText: { color: colors.textPrimary, fontSize: 12, fontWeight: "600" },
  aiIndicatorExit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  aiIndicatorExitText: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  quickChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  quickChipText: { color: colors.accent, fontSize: font.tiny, fontWeight: "700" },
  attChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: 6,
    maxWidth: 200,
  },
  attChipText: { color: colors.textPrimary, fontSize: font.tiny, flexShrink: 1 },
  attachBtn: {
    width: 40,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
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
