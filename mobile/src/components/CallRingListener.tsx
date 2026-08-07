import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import Animated, { SlideInUp, SlideOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, getBase } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

type Incoming = {
  call_id: string;
  chat_id: string;
  chat_name: string;
  mode: "audio" | "video";
  from_id: string;
  from_name: string;
};

// App-wide incoming-call ringer. Keeps a user WebSocket open while logged in and
// shows a ring banner (with vibration) the moment someone starts a call in a
// chat you're in. Foreground/in-app only — background ringing needs push + a
// native build. Mounted once at the root, overlaying every screen.
export function CallRingListener() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token) return;
    let closed = false;
    let retry: any = null;

    const connect = async () => {
      try {
        const { token: wsToken } = await apiGet("/api/auth/ws-token");
        if (closed) return;
        const wsBase = getBase().replace(/^http/, "ws");
        const ws = new WebSocket(`${wsBase}/api/ws/user?token=${wsToken}`);
        wsRef.current = ws;
        ws.onmessage = (ev) => {
          try {
            const payload = JSON.parse(ev.data);
            if (payload.event === "incoming_call" && payload.data) {
              setIncoming(payload.data);
              Vibration.vibrate([0, 600, 500, 600, 500], true);
            } else if (payload.event === "call_unring" && payload.data) {
              setIncoming((cur) => {
                if (cur && cur.call_id === payload.data.call_id) {
                  Vibration.cancel();
                  return null;
                }
                return cur;
              });
            }
          } catch {
            /* ignore */
          }
        };
        ws.onclose = () => {
          wsRef.current = null;
          if (!closed) retry = setTimeout(connect, 3000);
        };
        ws.onerror = () => {
          try { ws.close(); } catch { /* ignore */ }
        };
      } catch {
        if (!closed) retry = setTimeout(connect, 4000);
      }
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      Vibration.cancel();
      try { wsRef.current?.close(); } catch { /* ignore */ }
      wsRef.current = null;
    };
  }, [token]);

  const dismiss = () => {
    Vibration.cancel();
    setIncoming(null);
  };

  const accept = () => {
    if (!incoming) return;
    Vibration.cancel();
    const inc = incoming;
    setIncoming(null);
    router.push(`/call/${inc.call_id}?mode=${inc.mode}&title=${encodeURIComponent(inc.chat_name)}`);
  };

  if (!incoming) return null;

  return (
    <Animated.View
      entering={SlideInUp.springify().damping(16)}
      exiting={SlideOutUp}
      style={[styles.banner, { paddingTop: insets.top + 8 }]}
      testID="incoming-call-banner"
    >
      <View style={styles.callIcon}>
        <Ionicons name={incoming.mode === "video" ? "videocam" : "call"} size={22} color="#09090b" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1} testID="incoming-call-from">
          {incoming.from_name} is calling
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {incoming.chat_name} · {incoming.mode === "video" ? "Video" : "Audio"} call
        </Text>
      </View>
      <Pressable testID="incoming-call-decline" onPress={dismiss} style={[styles.actionBtn, styles.decline]}>
        <Ionicons name="close" size={22} color="#fff" />
      </Pressable>
      <Pressable testID="incoming-call-accept" onPress={accept} style={[styles.actionBtn, styles.accept]}>
        <Ionicons name="call" size={20} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.accentBorder,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    ...Platform.select({
      default: { elevation: 12 },
    }),
  },
  callIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  name: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: font.small, marginTop: 1 },
  actionBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  decline: { backgroundColor: colors.danger },
  accept: { backgroundColor: "#22c55e" },
});
