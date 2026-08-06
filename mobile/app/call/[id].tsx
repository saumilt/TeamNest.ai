import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import CallScreen from "@/src/components/call/CallScreen";
import { colors, font, radius, spacing } from "@/src/theme";

// Full-screen call route. Joins the LiveKit room via the backend (which mints a
// short-lived participant token) then hands the credentials to the platform
// CallScreen (native LiveKit UI, or a web placeholder). Leaving ends the call.
export default function CallRoute() {
  const { id, mode, title } = useLocalSearchParams<{ id: string; mode?: string; title?: string }>();
  const callId = String(id);
  const { token, loading: authLoading } = useAuth();
  const [creds, setCreds] = useState<{ url: string; token: string } | null>(null);
  const [error, setError] = useState("");
  const leftRef = useRef(false);

  useEffect(() => {
    if (authLoading || !token) return;
    let active = true;
    (async () => {
      try {
        const res = await apiPost(`/api/calls/${callId}/join`, {});
        if (!active) return;
        if (!res?.token || !res?.url) {
          setError("This call isn't available anymore.");
          return;
        }
        setCreds({ url: res.url, token: res.token });
      } catch (e: any) {
        if (active) setError(e?.message || "Could not join the call.");
      }
    })();
    return () => {
      active = false;
    };
  }, [callId, authLoading, token]);

  const onLeave = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    apiPost(`/api/calls/${callId}/end`, {}).catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [callId]);

  if (error) {
    return (
      <View style={styles.center} testID="call-route-error">
        <Text style={styles.errText}>{error}</Text>
        <TouchableOpacity testID="call-error-back" onPress={onLeave} style={styles.btn}>
          <Text style={styles.btnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!creds) {
    return (
      <View style={styles.center} testID="call-route-loading">
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Connecting…</Text>
      </View>
    );
  }

  return (
    <CallScreen
      url={creds.url}
      token={creds.token}
      mode={mode === "video" ? "video" : "audio"}
      title={title ? String(title) : "TeamNest call"}
      onLeave={onLeave}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: spacing.lg, padding: spacing.xl },
  errText: { color: colors.textSecondary, fontSize: font.body, textAlign: "center" },
  loadingText: { color: colors.textMuted, fontSize: font.small },
  btn: { borderWidth: 1, borderColor: colors.accentBorder, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: 10 },
  btnText: { color: colors.accent, fontWeight: "700" },
});
