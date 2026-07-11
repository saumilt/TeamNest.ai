import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [items, setItems] = useState<any[] | null>(null);
  const [unread, setUnread] = useState(0);

  const load = useCallback(() => {
    apiGet("/api/notifications").then((d) => { setItems(d.items); setUnread(d.unread_count); }).catch(() => setItems([]));
  }, []);
  useFocusEffect(useCallback(() => { if (token) load(); }, [token, load]));

  const open = async (n: any) => {
    if (!n.read) { apiPost(`/api/notifications/${n.id}/read`).catch(() => {}); setItems((p) => (p || []).map((x) => x.id === n.id ? { ...x, read: true } : x)); setUnread((u) => Math.max(0, u - 1)); }
    if (n.meta?.chat_id) router.push(`/chat/${n.meta.chat_id}`);
  };
  const readAll = async () => { await apiPost("/api/notifications/read-all").catch(() => {}); setItems((p) => (p || []).map((x) => ({ ...x, read: true }))); setUnread(0); };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: 60 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity testID="mb-notif-back" onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={colors.textSecondary} /></TouchableOpacity>
          <Text style={styles.h1}>Notifications</Text>
          {unread > 0 && <TouchableOpacity testID="mb-notif-read-all" onPress={readAll}><Text style={styles.link}>Mark all read</Text></TouchableOpacity>}
        </View>
        {items === null ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : items.length === 0 ? (
          <Text style={styles.empty}>You're all caught up.</Text>
        ) : items.map((n) => (
          <TouchableOpacity key={n.id} testID={`mb-notif-${n.id}`} onPress={() => open(n)} style={[styles.row, !n.read && styles.rowUnread]}>
            <Ionicons name={n.type === "escalation" ? "warning" : "checkmark-circle"} size={18} color={n.type === "escalation" ? colors.accent : colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{n.title}</Text>
              <Text style={styles.body} numberOfLines={2}>{n.body}</Text>
            </View>
            {!n.read && <View style={styles.dot} />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  h1: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800", flex: 1 },
  link: { color: colors.accent, fontSize: font.small, fontWeight: "600" },
  empty: { color: colors.textMuted, fontSize: font.small, textAlign: "center", marginTop: spacing.xl },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.sm },
  rowUnread: { borderColor: colors.accentBorder, backgroundColor: colors.accentDim },
  title: { color: colors.textPrimary, fontSize: font.small, fontWeight: "700" },
  body: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2, lineHeight: 17 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger, marginTop: 4 },
});
