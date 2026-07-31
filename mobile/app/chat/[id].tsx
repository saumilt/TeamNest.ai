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
import { getItem, setItem } from "@/src/storage";
import { AI_MODELS, RECOMMENDED_MODEL } from "@/src/aiModels";
import { uploadZipChunked, MOBILE_MAX_SIZE } from "@/src/chunkedUpload";
import { AiDiscussionCard } from "@/src/components/AiDiscussionCard";
import { AiDiscussionsDashboard } from "@/src/components/AiDiscussionsDashboard";
import { AiComposeModal } from "@/src/components/AiComposeModal";
import { AiDiscussionDetail } from "@/src/components/AiDiscussionDetail";

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

const isAiTrigger = (t: string) => /^\s*@ai\b/i.test(t || "");

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = String(id);
  const insets = useSafeAreaInsets();
  const { user, token, loading: authLoading } = useAuth();
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
  const [msgAction, setMsgAction] = useState<any>(null);
  const [showMemory, setShowMemory] = useState(false);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [stoppedThreads, setStoppedThreads] = useState<Set<string>>(() => new Set());
  const [nextToTeam, setNextToTeam] = useState(false);
  // Dual views (Human | Combined | AI) + AI discussions.
  const [view, setView] = useState<"human" | "combined" | "ai">("human");
  const [discussions, setDiscussions] = useState<any[]>([]);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [composeCtx, setComposeCtx] = useState<any>(null);
  const [composing, setComposing] = useState(false);
  // Inline @ai model picker.
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [rememberModels, setRememberModels] = useState(true);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<"send" | "inline">("inline");
  const [pickerSel, setPickerSel] = useState<string[]>([RECOMMENDED_MODEL]);
  const [pickerRemember, setPickerRemember] = useState(true);
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

  // Clear the unread badge for this chat (chat list reloads on focus).
  const markRead = useCallback(() => {
    apiPost(`/api/chats/${chatId}/read`, {}).catch(() => {});
  }, [chatId]);

  // AI discussions (research threads) linked to this chat — powers the AI view
  // + the compact research cards shown in the Human view.
  const reloadDiscussions = useCallback(async () => {
    if (!chatId) return;
    try {
      const data = await apiGet(`/api/chats/${chatId}/ai-discussions`);
      setDiscussions(data.discussions || []);
    } catch {
      /* best-effort */
    }
  }, [chatId]);

  const changeView = useCallback(
    (v: "human" | "combined" | "ai") => {
      setView(v);
      if (user?.id && chatId) setItem(`tn:chatview:${user.id}:${chatId}`, v).catch(() => {});
    },
    [user?.id, chatId],
  );

  // Restore the per-user, per-chat view preference (Human is the default).
  useEffect(() => {
    setOpenThread(null);
    setComposeCtx(null);
    if (!chatId || !user?.id) return;
    (async () => {
      const saved = await getItem(`tn:chatview:${user.id}:${chatId}`);
      setView(saved === "combined" || saved === "ai" ? (saved as any) : "human");
    })();
  }, [chatId, user?.id]);

  // Submit a new AI discussion started from a specific human message.
  const submitCompose = useCallback(
    async (question: string, models: string[]) => {
      if (!composeCtx || !question) return;
      setComposing(true);
      try {
        const data = await apiPost("/api/ai/research", {
          chat_id: chatId,
          question,
          selected_models: models,
          memory_mode: "chat",
          linked_message_id: composeCtx.id,
        });
        setComposeCtx(null);
        reloadDiscussions();
        if (data?.thread?.id) setOpenThread(data.thread.id);
      } catch {
        Alert.alert("Error", "AI research failed");
      } finally {
        setComposing(false);
      }
    },
    [composeCtx, chatId, reloadDiscussions],
  );

  // Reload discussions on open + whenever a new AI answer lands.
  const aiAnswerCount = messages.filter((m) => m.message_type === "ai_answer").length;
  useEffect(() => {
    if (authLoading || !token) return;
    reloadDiscussions();
  }, [reloadDiscussions, aiAnswerCount, authLoading, token]);

  // Knowledge sources (uploaded ZIPs) attached to this chat — powers the header
  // "AI knows this ZIP" chip and lets @ai answer over the archive.
  const [chatKnowledge, setChatKnowledge] = useState<any[]>([]);
  const reloadChatKnowledge = useCallback(async () => {
    if (!chatId) return;
    try {
      const d = await apiGet(`/api/knowledge/sources?chat_id=${chatId}`);
      setChatKnowledge(d.sources || []);
    } catch {
      /* best-effort */
    }
  }, [chatId]);
  useEffect(() => {
    // Wait for the stored JWT to rehydrate, else a cold deep-link 401s and the
    // chip never renders.
    if (authLoading || !token) return;
    reloadChatKnowledge();
  }, [reloadChatKnowledge, authLoading, token]);
  useEffect(() => {
    if (!chatKnowledge.some((s) => s.status === "processing")) return;
    const t = setInterval(reloadChatKnowledge, 4000);
    return () => clearInterval(t);
  }, [chatKnowledge, reloadChatKnowledge]);

  // Reply to a specific message — capture a lightweight preview.
  const startReply = useCallback(
    (m: any) => {
      const name =
        m.sender_id === user?.id
          ? "yourself"
          : typeof m.sender_id === "string" && m.sender_id.startsWith("ai")
            ? "AI"
            : members[m.sender_id]?.name || "teammate";
      setReplyTo({ id: m.id, name, body: (m.body || "").replace(/[*#`>]/g, "").slice(0, 140) });
    },
    [user?.id, members],
  );

  // Stop an in-progress AI generation and discard the result.
  const stopAI = useCallback(async () => {
    // Optimistically mark running threads stopped so the indicator clears now.
    const pendingIds = messages
      .filter((m) => m.message_type === "ai_question" && !m.deleted_at && m.metadata?.thread_id)
      .map((m) => m.metadata.thread_id);
    if (pendingIds.length) {
      setStoppedThreads((prev) => new Set([...prev, ...pendingIds]));
    }
    try {
      await apiPost(`/api/chats/${chatId}/ai/stop`, {});
    } catch {}
  }, [chatId, messages]);

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

  const runMsgAction = useCallback(
    async (action: string) => {
      const m = msgAction;
      setMsgAction(null);
      if (!m) return;
      try {
        await apiPost(`/api/chats/${chatId}/messages/${m.id}/ai-action`, { action });
        setTimeout(refreshAiSession, 4500);
      } catch {
        Alert.alert("Error", "AI action failed");
      }
    },
    [chatId, msgAction, refreshAiSession],
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
    // Wait for the stored JWT to rehydrate before fetching, otherwise a cold
    // deep-link into a chat fires before setAuthToken() and 401s (leaving the
    // chat — incl. inline_ai_models — unhydrated).
    if (authLoading || !token) return;
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
        markRead();
      } catch {
        // leave empty
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [chatId, authLoading, token]);

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
                  if (payload.event === "message" && payload.data.sender_id !== user?.id) {
                    markRead();
                  }
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
  }, [chatId, upsertMessage, markRead, user?.id]);

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

  const uploadAsset = async (asset: { uri: string; name: string; type: string; size?: number }) => {
    setUploading(true);
    try {
      // ZIPs stream via the chunked path (the simple endpoint rejects .zip) and
      // become a chat-linked knowledge source so @ai can answer over them.
      if ((asset.name || "").toLowerCase().endsWith(".zip")) {
        if ((asset.size || 0) > MOBILE_MAX_SIZE) {
          Alert.alert(
            "File too large for mobile",
            `Phones are limited to ${Math.round(MOBILE_MAX_SIZE / 1024 / 1024)}MB. Upload larger archives from the web app.`,
          );
          return;
        }
        const data = await uploadZipChunked(asset as any, { chatId });
        setAttachments((prev) => [...prev, data]);
        apiPost("/api/knowledge/sources", { file_id: data.id, chat_id: chatId, name: data.filename })
          .then(() => { reloadChatKnowledge(); Alert.alert("Indexing ZIP", "@ai will be able to answer about this archive shortly."); })
          .catch((err: any) => Alert.alert("Indexing failed", err?.message || "Could not index that ZIP."));
        return;
      }
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
          size: a.size,
          // Preserve the Blob DocumentPicker returns on web; uploadZipChunked
          // needs it to take the web-slice path (blob: URIs aren't readable by
          // expo-file-system). Dropping it silently broke in-chat ZIP uploads.
          file: (a as any).file,
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

  const doSend = async (models: string[] | null, remember: boolean) => {
    const body = text.trim();
    const outAttachments = attachments;
    const outBody =
      body || (outAttachments.length ? `Sent ${outAttachments.length} file(s)` : "");
    const parentId = replyTo?.id || null;
    const forceRecipient = nextToTeam ? "team" : undefined;
    const metadata: any = outAttachments.length ? { attachments: outAttachments } : {};
    if (models && models.length) {
      metadata.selected_models = models;
      metadata.remember_models = !!remember;
    }
    setText("");
    setAttachments([]);
    setReplyTo(null);
    setNextToTeam(false);
    if (!remember) setAiModels([]);
    else if (models && models.length) setAiModels(models);
    setSending(true);
    try {
      const msg = await apiPost(`/api/chats/${chatId}/messages`, {
        body: outBody,
        message_type: "text",
        metadata,
        parent_message_id: parentId,
        force_recipient: forceRecipient,
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

  const openModelPicker = (mode: "send" | "inline") => {
    const seed = aiModels.length
      ? aiModels
      : chat?.inline_ai_models?.length
        ? chat.inline_ai_models
        : [RECOMMENDED_MODEL];
    setPickerMode(mode);
    setPickerSel(seed);
    setPickerRemember(rememberModels);
    setShowModelPicker(true);
  };

  const togglePickerModel = (key: string) => {
    setPickerSel((prev) => {
      if (prev.includes(key)) return prev.length > 1 ? prev.filter((k) => k !== key) : prev;
      return [...prev, key];
    });
  };

  const confirmModelPicker = () => {
    const models = [...pickerSel];
    setRememberModels(pickerRemember);
    setShowModelPicker(false);
    if (pickerMode === "send") {
      doSend(models, pickerRemember);
    } else {
      setAiModels(models);
    }
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && attachments.length === 0) || sending) return;
    const aiCmd = isAiTrigger(body);
    if (aiCmd && aiModels.length === 0 && !(chat?.inline_ai_models?.length)) {
      openModelPicker("send");
      return;
    }
    await doSend(aiModels.length ? aiModels : null, rememberModels);
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

  const msgById: Record<string, any> = {};
  for (const m of messages) msgById[m.id] = m;

  // Dual-view: index discussions by id + by linked human message, then build
  // the visible item list (Human view collapses each AI answer into one card).
  const threadById: Record<string, any> = {};
  for (const d of discussions) threadById[d.id] = d;
  const linkedByMsg: Record<string, any[]> = {};
  for (const d of discussions) {
    if (d.linked_human_message_id) {
      if (!linkedByMsg[d.linked_human_message_id]) linkedByMsg[d.linked_human_message_id] = [];
      linkedByMsg[d.linked_human_message_id].push(d);
    }
  }
  const visibleItems = (() => {
    const isHuman = view === "human";
    const seen = new Set<string>();
    const out: any[] = [];
    for (const m of messages) {
      if (m.deleted_at) continue;
      if (m.message_type === "ai_question") continue;
      if (isHuman && m.message_type === "ai_answer") {
        const tid = m.metadata?.thread_id;
        if (tid && !seen.has(tid)) {
          seen.add(tid);
          out.push({ __card: true, id: `card-${tid}`, thread_id: tid });
        }
        continue;
      }
      out.push(m);
    }
    return out;
  })();

  const renderItem = ({ item }: { item: any }) => {
    if (item.__card) {
      const d = threadById[item.thread_id] || { id: item.thread_id, title: "AI research" };
      return <AiDiscussionCard discussion={d} onPress={() => setOpenThread(item.thread_id)} />;
    }
    const agent = isAgent(item.sender_id);
    const mine = item.sender_id === user?.id;
    const sender = members[item.sender_id];
    const isSystemEvent = item.metadata?.event;

    if (isSystemEvent) {
      return (
        <View style={styles.systemWrap} testID={`message-${item.id}`}>
          <Text style={styles.systemText}>
            {(item.body || "").replace(/\*\*/g, "")}
          </Text>
        </View>
      );
    }

    // Quoted-reply preview (only user text replies render a quote).
    const parent =
      item.message_type === "text" && item.parent_message_id
        ? msgById[item.parent_message_id]
        : null;
    const parentName = parent
      ? parent.sender_id === user?.id
        ? "You"
        : typeof parent.sender_id === "string" && parent.sender_id.startsWith("ai")
          ? "AI"
          : members[parent.sender_id]?.name || "Member"
      : "";

    const linked = linkedByMsg[item.id];
    const pubThread = item.metadata?.ai_publication?.thread_id;
    return (
      <View>
        <View
          testID={`message-${item.id}`}
          style={[
            styles.bubbleRow,
            mine ? styles.rowRight : styles.rowLeft,
          ]}
        >
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={() => {
            if (item.body || item.metadata?.attachments?.length) setMsgAction(item);
          }}
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
          {parent && (
            <View style={styles.replyQuote} testID={`reply-quote-${item.id}`}>
              <Text style={styles.replyQuoteName} numberOfLines={1}>
                {parentName}
              </Text>
              <Text style={styles.replyQuoteBody} numberOfLines={2}>
                {(parent.body || "").replace(/[*#`>]/g, "") || "…"}
              </Text>
            </View>
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
        </TouchableOpacity>
        </View>
        {linked ? (
          <TouchableOpacity
            testID={`ai-linked-indicator-${item.id}`}
            onPress={() => setOpenThread(linked[0].id)}
            style={[styles.aiLinkChip, mine ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}
          >
            <Ionicons name="sparkles" size={11} color={colors.accent} />
            <Text style={styles.aiLinkChipText}>AI Research: {linked.length}</Text>
          </TouchableOpacity>
        ) : null}
        {pubThread ? (
          <TouchableOpacity
            testID={`ai-publication-open-${item.id}`}
            onPress={() => setOpenThread(pubThread)}
            style={[styles.aiLinkChip, mine ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}
          >
            <Ionicons name="sparkles" size={11} color={colors.accent} />
            <Text style={styles.aiLinkChipText}>Open Full Research</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const title = chat?.type === "personal_ai" ? "My AI Assistant" : chat?.name || "Chat";
  const subtitle =
    chat?.type === "personal_ai"
      ? "Ask me anything with @ai"
      : `${(chat?.members || []).length} members`;

  // "AI is thinking" = a running question placeholder with no matching answer yet.
  const answeredThreads = new Set(
    messages
      .filter((m) => m.message_type === "ai_answer" && m.metadata?.thread_id)
      .map((m) => m.metadata.thread_id),
  );
  const pendingAI = messages.some(
    (m) =>
      m.message_type === "ai_question" &&
      !m.deleted_at &&
      m.metadata?.thread_id &&
      !answeredThreads.has(m.metadata.thread_id) &&
      !stoppedThreads.has(m.metadata.thread_id),
  );

  const rememberedModels: string[] = chat?.inline_ai_models || [];
  const aiTriggerOn = isAiTrigger(text);
  const pillModels = aiModels.length
    ? aiModels
    : aiTriggerOn && rememberedModels.length
      ? rememberedModels
      : [];
  const pillIsRemembered = aiModels.length === 0 && rememberedModels.length > 0;

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
          {(() => {
            const ready = chatKnowledge.filter((s) => s.status === "ready").length;
            const processing = chatKnowledge.some((s) => s.status === "processing");
            if (!ready && !processing) return null;
            return (
              <TouchableOpacity
                testID="chat-knowledge-chip"
                onPress={() => router.push("/documents")}
                style={styles.kbChip}
                activeOpacity={0.8}
              >
                <Ionicons name={processing ? "sync" : "folder-open"} size={11} color={colors.accent} />
                <Text style={styles.kbChipText}>
                  {processing ? "Indexing ZIP…" : ready === 1 ? "AI knows this ZIP" : `AI knows ${ready} ZIPs`}
                </Text>
              </TouchableOpacity>
            );
          })()}
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

      {chat && chat.type !== "personal_ai" && (
        <View style={styles.viewSwitchBar}>
          <View style={styles.viewSwitch} testID="chat-view-switch">
            {(["human", "combined", "ai"] as const).map((v) => (
              <TouchableOpacity
                key={v}
                testID={`chat-view-${v}`}
                onPress={() => changeView(v)}
                style={[styles.viewChip, view === v && styles.viewChipOn]}
              >
                <Text style={[styles.viewChipText, view === v && styles.viewChipTextOn]}>
                  {v === "human" ? "Human" : v === "combined" ? "Combined" : "AI"}
                  {v === "ai" && discussions.length ? ` ${discussions.length}` : ""}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

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
          {view === "ai" ? (
            <AiDiscussionsDashboard
              discussions={discussions}
              userId={user?.id}
              onOpen={(tid) => setOpenThread(tid)}
            />
          ) : (
            <FlatList
              ref={listRef}
              data={visibleItems}
              keyExtractor={(m) => m.id}
              renderItem={renderItem}
              contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.lg }}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            />
          )}
          {pendingAI && (
            <View style={styles.thinkingRow} testID="ai-thinking-indicator">
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={styles.thinkingText}>AI is thinking…</Text>
              <TouchableOpacity testID="stop-ai-btn" style={styles.stopBtn} onPress={stopAI}>
                <Ionicons name="stop" size={12} color="#f87171" />
                <Text style={styles.stopText}>Stop</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
            {replyTo && (
              <View style={styles.replyBar} testID="reply-preview">
                <View style={{ flex: 1 }}>
                  <Text style={styles.replyBarName}>Replying to {replyTo.name}</Text>
                  <Text style={styles.replyBarBody} numberOfLines={1}>
                    {replyTo.body || "…"}
                  </Text>
                </View>
                <TouchableOpacity
                  testID="cancel-reply-btn"
                  onPress={() => setReplyTo(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            {aiSession?.active && (
              <View>
                <View
                  style={[styles.aiIndicator, nextToTeam && styles.aiIndicatorTeam]}
                  testID="ai-conversation-indicator"
                >
                  <View style={styles.aiIndicatorLeft}>
                    {nextToTeam ? (
                      <>
                        <Ionicons name="people" size={14} color={colors.textMuted} />
                        <Text style={styles.aiIndicatorText} testID="recipient-label">
                          Next message → your team
                        </Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="arrow-redo" size={14} color={colors.accent} />
                        <Text style={styles.aiIndicatorText} testID="recipient-label">
                          Continuing with {aiSession.assistant_label || "@ai"}
                        </Text>
                      </>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {nextToTeam ? (
                      <TouchableOpacity
                        testID="target-continue-ai"
                        onPress={() => setNextToTeam(false)}
                        style={[styles.aiIndicatorExit, styles.targetAiBtn]}
                      >
                        <Ionicons name="sparkles" size={13} color={colors.accent} />
                        <Text style={[styles.aiIndicatorExitText, { color: colors.accent }]}>AI</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        testID="target-send-team"
                        onPress={() => setNextToTeam(true)}
                        style={styles.aiIndicatorExit}
                      >
                        <Ionicons name="people-outline" size={13} color={colors.textMuted} />
                        <Text style={styles.aiIndicatorExitText}>Team</Text>
                      </TouchableOpacity>
                    )}
                    {aiSession.context_summary ? (
                      <TouchableOpacity testID="ai-memory-toggle" onPress={() => setShowMemory((v) => !v)} style={styles.aiIndicatorExit}>
                        <Ionicons name="bulb-outline" size={13} color={colors.textMuted} />
                        <Text style={styles.aiIndicatorExitText}>Memory</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity testID="ai-conversation-exit" onPress={exitAiSession} style={styles.aiIndicatorExit}>
                      <Ionicons name="close" size={13} color={colors.textMuted} />
                      <Text style={styles.aiIndicatorExitText}>Exit AI</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {showMemory && aiSession.context_summary ? (
                  <View style={styles.memoryPanel} testID="ai-memory-panel">
                    <Text style={styles.memoryTitle}>Conversation memory</Text>
                    <Text style={styles.memoryText}>{aiSession.context_summary}</Text>
                  </View>
                ) : null}
              </View>
            )}
            {!aiSession?.active && !aiTriggerOn && pillModels.length === 0 && (
              <View style={styles.destPill} testID="composer-destination">
                <Ionicons name="people-outline" size={13} color={colors.textMuted} />
                <Text style={styles.destText}>
                  To: <Text style={styles.destStrong}>Everyone</Text> · human chat
                </Text>
                <TouchableOpacity
                  testID="composer-switch-ai"
                  style={styles.destAskAi}
                  onPress={() => setText(text ? `@ai ${text}` : "@ai ")}
                >
                  <Ionicons name="sparkles" size={12} color={colors.accent} />
                  <Text style={styles.destAskAiText}>Ask AI</Text>
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
            {aiTriggerOn && aiModels.length === 0 && rememberedModels.length === 0 && (
              <TouchableOpacity
                testID="ai-model-inline-suggestion"
                style={styles.aiModelBanner}
                onPress={() => openModelPicker("inline")}
                activeOpacity={0.8}
              >
                <Ionicons name="sparkles" size={13} color={colors.accent} />
                <Text style={styles.aiModelBannerText}>
                  Choose which AI model answers · tap to pick
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            )}
            {pillModels.length > 0 && (
              <View testID="ai-model-pill" style={styles.aiModelPill}>
                <Ionicons name="sparkles" size={13} color={colors.accent} />
                <Text style={styles.aiModelPillText} numberOfLines={1}>
                  {pillIsRemembered ? "Using: " : "AI: "}
                  {pillModels
                    .map((k) => AI_MODELS.find((m) => m.key === k)?.name || k)
                    .join(", ")}
                  {(rememberModels || pillIsRemembered) ? " · remembered" : ""}
                </Text>
                <TouchableOpacity
                  testID="ai-model-edit"
                  onPress={() => openModelPicker("inline")}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="pencil" size={14} color={colors.textMuted} />
                </TouchableOpacity>
                {!pillIsRemembered && (
                  <TouchableOpacity
                    testID="ai-model-clear"
                    onPress={() => setAiModels([])}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
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
                    ? nextToTeam
                      ? "Message your team…"
                      : "Ask a follow-up…"
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

      <Modal visible={!!msgAction} transparent animationType="fade" onRequestClose={() => setMsgAction(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setMsgAction(null)}>
          <View style={styles.modalCard} testID="msg-action-modal">
            <Text style={styles.modalTitle}>Message actions</Text>
            <Text style={styles.modalSub} numberOfLines={2}>{msgAction?.body}</Text>
            <TouchableOpacity
              testID="msg-action-reply"
              style={styles.roleRow}
              onPress={() => {
                const m = msgAction;
                setMsgAction(null);
                if (m) startReply(m);
              }}
            >
              <Ionicons name="arrow-undo-outline" size={16} color={colors.accent} />
              <Text style={styles.roleName}>Reply</Text>
            </TouchableOpacity>
            {msgAction?.message_type === "text" && (
              <TouchableOpacity
                testID="msg-action-ask_about"
                style={styles.roleRow}
                onPress={() => {
                  const m = msgAction;
                  setMsgAction(null);
                  if (m) {
                    setOpenThread(null);
                    setComposeCtx(m);
                  }
                }}
              >
                <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
                <Text style={styles.roleName}>Ask AI about this</Text>
              </TouchableOpacity>
            )}
            {msgAction?.message_type === "text" &&
              [
                ["summarize_thread", "Summarize thread"],
                ["continue_ai", "Continue with AI"],
                ["draft_response", "Draft response"],
                ["explain_decision", "Explain decision"],
              ].map(([action, label]) => (
                <TouchableOpacity key={action} testID={`msg-action-${action}`} style={styles.roleRow} onPress={() => runMsgAction(action)}>
                  <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
                  <Text style={styles.roleName}>{label}</Text>
                </TouchableOpacity>
              ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showModelPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModelPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowModelPicker(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalCard} testID="ai-model-picker">
            <Text style={styles.modalTitle}>Ask AI with…</Text>
            <Text style={styles.modalSub}>Pick one or more models to answer your @ai message.</Text>
            <View style={styles.modelGrid}>
              {AI_MODELS.map((m) => {
                const on = pickerSel.includes(m.key);
                return (
                  <TouchableOpacity
                    key={m.key}
                    testID={`ai-model-option-${m.key}`}
                    onPress={() => togglePickerModel(m.key)}
                    style={[styles.modelChip, on && styles.modelChipOn]}
                    activeOpacity={0.8}
                  >
                    {m.fast && (
                      <Ionicons name="flash" size={11} color={on ? "#09090b" : colors.accent} />
                    )}
                    <Text style={[styles.modelChipText, on && styles.modelChipTextOn]}>
                      {m.name}
                    </Text>
                    {on && <Ionicons name="checkmark" size={12} color="#09090b" />}
                    {m.recommended && (
                      <Text
                        testID={`ai-model-recommended-badge-${m.key}`}
                        style={[styles.recBadge, on && styles.recBadgeOn]}
                      >
                        REC
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              testID="ai-model-remember-toggle"
              style={styles.rememberRow}
              onPress={() => setPickerRemember((v) => !v)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={pickerRemember ? "checkbox" : "square-outline"}
                size={18}
                color={pickerRemember ? colors.accent : colors.textMuted}
              />
              <Text style={styles.rememberText}>Remember for this chat</Text>
            </TouchableOpacity>
            <View style={styles.pickerActions}>
              <TouchableOpacity
                testID="ai-model-cancel"
                style={styles.pickerCancel}
                onPress={() => setShowModelPicker(false)}
              >
                <Text style={styles.pickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="ai-model-confirm"
                style={styles.pickerConfirm}
                onPress={confirmModelPicker}
                disabled={pickerSel.length === 0}
              >
                <Ionicons name="sparkles" size={14} color="#09090b" />
                <Text style={styles.pickerConfirmText}>Ask AI</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <AiComposeModal
        visible={!!composeCtx}
        contextMessage={composeCtx}
        senderName={
          composeCtx?.sender_id === user?.id
            ? "You"
            : members[composeCtx?.sender_id]?.name || "Teammate"
        }
        defaultModels={chat?.inline_ai_models || []}
        submitting={composing}
        onSubmit={submitCompose}
        onCancel={() => setComposeCtx(null)}
      />

      <AiDiscussionDetail
        visible={!!openThread}
        threadId={openThread}
        currentUserId={user?.id}
        members={Object.values(members)
          .filter((m: any) => m.id !== user?.id)
          .map((m: any) => ({ id: m.id, name: m.name }))}
        onClose={() => setOpenThread(null)}
        onChanged={reloadDiscussions}
        onPublished={() => {
          reloadDiscussions();
          setOpenThread(null);
        }}
      />
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
  aiModelBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: spacing.sm,
  },
  aiModelBannerText: { flex: 1, color: colors.textPrimary, fontSize: font.small, fontWeight: "600" },
  aiModelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.pill,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    marginBottom: spacing.sm,
  },
  aiModelPillText: { flex: 1, color: colors.textPrimary, fontSize: font.small },
  modelGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  modelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modelChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  modelChipText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  modelChipTextOn: { color: "#09090b" },
  recBadge: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.accent,
    backgroundColor: "rgba(251,191,36,0.15)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: "hidden",
  },
  recBadgeOn: { color: "#09090b", backgroundColor: "rgba(0,0,0,0.2)" },
  rememberRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4, marginBottom: spacing.sm },
  rememberText: { color: colors.textSecondary, fontSize: font.small },
  pickerActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  pickerCancel: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill },
  pickerCancelText: { color: colors.textMuted, fontSize: font.small, fontWeight: "600" },
  pickerConfirm: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  pickerConfirmText: { color: "#09090b", fontSize: font.small, fontWeight: "800" },
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
  replyQuote: {
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    backgroundColor: "rgba(0,0,0,0.15)",
    borderRadius: 6,
    paddingLeft: 8,
    paddingRight: 8,
    paddingVertical: 4,
    marginBottom: 6,
  },
  replyQuoteName: { color: colors.accent, fontSize: 11, fontWeight: "700" },
  replyQuoteBody: { color: colors.textSecondary, fontSize: 11 },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 6,
    marginBottom: 8,
  },
  replyBarName: { color: colors.accent, fontSize: 11, fontWeight: "700" },
  replyBarBody: { color: colors.textSecondary, fontSize: 12 },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.pill,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
  },
  thinkingText: { color: colors.accent, fontSize: 12, fontWeight: "600" },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(248,113,113,0.15)",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stopText: { color: "#f87171", fontSize: 11, fontWeight: "800" },
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
  aiIndicatorTeam: { borderColor: colors.border, backgroundColor: colors.bgElevated },
  targetAiBtn: { borderColor: colors.accentBorder, backgroundColor: colors.accentDim },
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
  memoryPanel: { marginTop: 6, marginBottom: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 10 },
  memoryTitle: { color: colors.accent, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  memoryText: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
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
  viewSwitchBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgElevated,
    alignItems: "flex-start",
  },
  viewSwitch: {
    flexDirection: "row",
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    padding: 2,
    gap: 2,
  },
  viewChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  viewChipOn: { backgroundColor: colors.accent },
  viewChipText: { color: colors.textSecondary, fontSize: font.tiny, fontWeight: "700" },
  viewChipTextOn: { color: "#09090b" },
  aiLinkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accentDim,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: -4,
    marginBottom: spacing.sm,
  },
  aiLinkChipText: { color: colors.accent, fontSize: font.tiny, fontWeight: "700" },
  destPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 5,
    marginBottom: spacing.sm,
  },
  destText: { color: colors.textSecondary, fontSize: font.tiny },
  destStrong: { color: colors.textPrimary, fontWeight: "700" },
  destAskAi: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.accentDim,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  destAskAiText: { color: colors.accent, fontSize: font.tiny, fontWeight: "700" },
  kbChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: colors.accentDim,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 3,
  },
  kbChipText: { color: colors.accent, fontSize: font.tiny, fontWeight: "700" },
});
