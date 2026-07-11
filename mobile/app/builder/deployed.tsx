import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

export default function DeployedDirectory() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [rows, setRows] = useState<any[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    apiGet("/api/ai-builder/deployments").then((d) => { setRows(d.deployments); setDenied(false); })
      .catch((e) => { if (String(e.message).includes("403") || String(e.message).toLowerCase().includes("admin")) setDenied(true); setRows([]); });
  }, []);
  useFocusEffect(useCallback(() => { if (token) load(); }, [token, load]));

  const undeploy = async (eid: string) => {
    setBusy(eid);
    try { await apiPost(`/api/ai-builder/employees/${eid}/undeploy`); load(); }
    catch (e: any) { Alert.alert("Error", e.message); }
    setBusy("");
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: 60 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity testID="mb-dd-back" onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={colors.textSecondary} /></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Deployed</Text>
            <Text style={styles.sub}>Live AI employees in this workspace.</Text>
          </View>
        </View>
        {denied ? (
          <View style={styles.empty} testID="mb-dd-denied"><Ionicons name="shield-outline" size={24} color={colors.textMuted} /><Text style={styles.emptyText}>Admins only.</Text></View>
        ) : rows === null ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : rows.length === 0 ? (
          <View style={styles.empty} testID="mb-dd-empty"><Ionicons name="rocket-outline" size={24} color={colors.textMuted} /><Text style={styles.emptyText}>No AI employees deployed yet.</Text></View>
        ) : rows.map((d) => (
          <View key={d.id} style={styles.row} testID={`mb-dd-row-${d.employee_id}`}>
            <TouchableOpacity onPress={() => router.push(`/builder/${d.employee_id}`)} style={{ flex: 1 }}>
              <Text style={styles.name}>{d.employee?.name || "(deleted)"}</Text>
              <Text style={styles.meta}>@{d.handle} · {d.channel === "chat" ? (d.chat_name || "a chat") : "@mention"}</Text>
            </TouchableOpacity>
            <TouchableOpacity testID={`mb-dd-undeploy-${d.employee_id}`} onPress={() => undeploy(d.employee_id)} disabled={busy === d.employee_id} style={styles.undeployBtn}>
              {busy === d.employee_id ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={styles.undeployText}>Undeploy</Text>}
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  h1: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800" },
  sub: { color: colors.textSecondary, fontSize: font.small, marginTop: 2 },
  empty: { alignItems: "center", gap: spacing.sm, padding: spacing.xl, backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginTop: spacing.lg },
  emptyText: { color: colors.textMuted, fontSize: font.small },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.sm },
  name: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  meta: { color: colors.textMuted, fontSize: font.small, marginTop: 2 },
  undeployBtn: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceHover },
  undeployText: { color: colors.danger, fontSize: font.small, fontWeight: "700" },
});
