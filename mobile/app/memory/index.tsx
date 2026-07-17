import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

function MemoryGroup({ title, subtitle, scope, items, onChange }: any) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { await apiPost("/api/memory/learned", { text, scope }); setText(""); onChange(); }
    catch {} finally { setBusy(false); }
  };
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={styles.groupTitle}>{title}</Text>
      <Text style={styles.groupSub}>{subtitle}</Text>
      <View style={styles.addRow}>
        <TextInput value={text} onChangeText={setText} placeholder="Add something to remember…" placeholderTextColor={colors.textMuted}
          testID={`mem-add-input-${scope}`} style={styles.addInput} onSubmitEditing={add} returnKeyType="done" />
        <TouchableOpacity onPress={add} disabled={busy || !text.trim()} testID={`mem-add-btn-${scope}`}
          style={[styles.addBtn, (busy || !text.trim()) && { opacity: 0.4 }]}>
          {busy ? <ActivityIndicator color="#09090b" size="small" /> : <Ionicons name="add" size={20} color="#09090b" />}
        </TouchableOpacity>
      </View>
      {items.length === 0 ? (
        <Text style={styles.empty}>Nothing yet — the AI learns as you chat, or add items above.</Text>
      ) : items.map((m: any) => (
        <View key={m.id} style={[styles.item, !m.active && { opacity: 0.5 }]} testID={`mem-item-${m.id}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemText}>{m.text}</Text>
            <View style={styles.tagRow}>
              <View style={styles.tag}><Text style={styles.tagText}>{m.kind}</Text></View>
              <View style={styles.tag}><Text style={styles.tagText}>{m.source === "auto" ? "learned" : "added"}</Text></View>
            </View>
          </View>
          <Switch value={m.active} testID={`mem-toggle-${m.id}`}
            onValueChange={async () => { await apiPatch(`/api/memory/learned/${m.id}`, { active: !m.active }); onChange(); }}
            trackColor={{ true: colors.accent, false: colors.surfaceHover }} thumbColor="#fff" />
          <TouchableOpacity testID={`mem-forget-${m.id}`} onPress={async () => { await apiDelete(`/api/memory/learned/${m.id}`); onChange(); }} style={{ paddingLeft: spacing.sm }}>
            <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const load = useCallback(() => { apiGet("/api/memory/learned").then(setData).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { if (token) load(); }, [token, load]));

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg }}>
        <View style={styles.headerRow}>
          <TouchableOpacity testID="mem-back" onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={colors.textSecondary} /></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>AI Memory</Text>
            <Text style={styles.sub}>Learned from your chats · say &ldquo;@ai remember …&rdquo; to teach it</Text>
          </View>
          <Ionicons name="sparkles" size={18} color={colors.accent} />
        </View>
      </View>
      {!data ? <View style={styles.center}><ActivityIndicator color={colors.accent} /></View> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}>
          <MemoryGroup title="About you" subtitle="How you like the AI to work — applied to your answers." scope="personal" items={data.personal} onChange={load} />
          <MemoryGroup title="About your workspace" subtitle="Shared team facts the AI uses for everyone." scope="workspace" items={data.workspace} onChange={load} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  h1: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800" },
  sub: { color: colors.textSecondary, fontSize: font.tiny, marginTop: 2 },
  groupTitle: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800", marginTop: spacing.md },
  groupSub: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2, marginBottom: spacing.md },
  addRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  addInput: { flex: 1, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.textPrimary, fontSize: font.body },
  addBtn: { width: 44, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.textMuted, fontSize: font.small },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  itemText: { color: colors.textPrimary, fontSize: font.small, lineHeight: 20 },
  tagRow: { flexDirection: "row", gap: 4, marginTop: 6 },
  tag: { backgroundColor: colors.surfaceHover, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { color: colors.textMuted, fontSize: 10 },
});
