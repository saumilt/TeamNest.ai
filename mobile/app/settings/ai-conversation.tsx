import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost, apiPut } from "@/src/api";
import { colors, font, radius, spacing } from "@/src/theme";

const TIMEOUTS = [
  { value: null, label: "Inherit" },
  { value: 10, label: "10m" },
  { value: 30, label: "30m" },
  { value: 60, label: "1h" },
  { value: 0, label: "Until exit" },
];
const THRESHOLDS = [
  { value: null, label: "Inherit" },
  { value: 0.6, label: "Relaxed" },
  { value: 0.75, label: "Balanced" },
  { value: 0.9, label: "Strict" },
];

function Row({ label, hint, value, onValueChange, testID }: any) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: spacing.md }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Switch
        testID={testID}
        value={!!value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.accent, false: colors.border }}
        thumbColor="#fff"
      />
    </View>
  );
}

function Pills({ label, options, value, onSelect, testID }: any) {
  return (
    <View style={{ marginTop: spacing.sm }}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.pillRow}>
        {options.map((o: any) => {
          const on = value === o.value;
          return (
            <TouchableOpacity
              key={String(o.value)}
              testID={`${testID}-${o.value}`}
              onPress={() => onSelect(o.value)}
              style={[styles.pill, on && styles.pillOn]}
            >
              <Text style={[styles.pillText, on && styles.pillTextOn]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function AIConversationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<any>(null);
  const [ws, setWs] = useState<any>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [sec, setSec] = useState<any>(null);
  const [accounts, setAccounts] = useState<any>(null);

  const load = async () => {
    try {
      const p = await apiGet("/api/ai-conversation/preferences");
      setPrefs(p.preferences);
      const wsr = await apiGet("/api/ai-conversation/workspace-settings");
      setWs(wsr.ai_conversation);
      setCanEdit(!!wsr.can_edit);
      if (wsr.can_edit) {
        setSec(await apiGet("/api/admin/security-settings"));
        setAccounts(await apiGet("/api/admin/provisioned-accounts"));
      }
    } catch {
      Alert.alert("Error", "Failed to load settings");
    }
  };
  useEffect(() => { load(); }, []);

  const savePrefs = async () => {
    try {
      await apiPut("/api/ai-conversation/preferences", prefs);
      Alert.alert("Saved", "Preferences updated");
    } catch { Alert.alert("Error", "Failed to save"); }
  };
  const saveWs = async () => {
    try {
      await apiPut("/api/ai-conversation/workspace-settings", ws);
      Alert.alert("Saved", "Workspace defaults updated");
    } catch { Alert.alert("Error", "Failed to save"); }
  };
  const saveSec = async () => {
    try {
      await apiPut("/api/admin/security-settings", { temp_password_expiry_days: sec.temp_password_expiry_days });
      Alert.alert("Saved", "Security settings updated");
      load();
    } catch { Alert.alert("Error", "Failed to save"); }
  };
  const rotate = async (a: any) => {
    try {
      const r = await apiPost(`/api/admin/provisioned-accounts/${a.id}/rotate`, {});
      Alert.alert("New temporary password", `${r.email}\n\n${r.temporary_password}\n\nShare this securely.`);
      load();
    } catch { Alert.alert("Error", "Failed to rotate"); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity testID="ai-conv-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Conversation Mode</Text>
      </View>
      {!prefs ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your preferences</Text>
            <Text style={styles.cardSub}>Mention AI once, then continue naturally.</Text>
            <Row testID="pref-auto-continue" label="Continue automatically"
              hint="Follow-ups continue with AI without another @ai."
              value={prefs.auto_continue_enabled}
              onValueChange={(v: boolean) => setPrefs({ ...prefs, auto_continue_enabled: v })} />
            <Row testID="pref-ask-ambiguous" label="Ask when uncertain"
              hint="Show a small choice for borderline messages."
              value={prefs.ask_when_ambiguous}
              onValueChange={(v: boolean) => setPrefs({ ...prefs, ask_when_ambiguous: v })} />
            <Row testID="pref-show-indicator" label="Show 'Continuing with @ai' indicator"
              value={prefs.show_recipient_indicator}
              onValueChange={(v: boolean) => setPrefs({ ...prefs, show_recipient_indicator: v })} />
            <Pills testID="pref-timeout" label="Keep AI mode active for" options={TIMEOUTS}
              value={prefs.session_timeout_minutes}
              onSelect={(v: any) => setPrefs({ ...prefs, session_timeout_minutes: v })} />
            <Pills testID="pref-threshold" label="Follow-up sensitivity" options={THRESHOLDS}
              value={prefs.follow_up_threshold}
              onSelect={(v: any) => setPrefs({ ...prefs, follow_up_threshold: v })} />
            <TouchableOpacity testID="pref-save" onPress={savePrefs} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Save preferences</Text>
            </TouchableOpacity>
          </View>

          {canEdit && ws && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Workspace defaults (admin)</Text>
              <Row testID="ws-enabled" label="Enable AI Conversation Mode"
                value={ws.enabled} onValueChange={(v: boolean) => setWs({ ...ws, enabled: v })} />
              <Row testID="ws-allow-group" label="Allow AI follow-ups in group chats"
                value={ws.allow_in_group_chats} onValueChange={(v: boolean) => setWs({ ...ws, allow_in_group_chats: v })} />
              <Pills testID="ws-timeout" label="Default timeout" options={TIMEOUTS.filter((t) => t.value !== null)}
                value={ws.default_timeout_minutes} onSelect={(v: any) => setWs({ ...ws, default_timeout_minutes: v })} />
              <Pills testID="ws-threshold" label="Default sensitivity" options={THRESHOLDS.filter((t) => t.value !== null)}
                value={ws.follow_up_threshold} onSelect={(v: any) => setWs({ ...ws, follow_up_threshold: v })} />
              <TouchableOpacity testID="ws-save" onPress={saveWs} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>Save workspace defaults</Text>
              </TouchableOpacity>
            </View>
          )}

          {canEdit && sec && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Temporary password expiry (admin)</Text>
              <Text style={styles.cardSub}>Provisioned accounts lose their temp password after this many days (0 = never).</Text>
              <View style={styles.expiryRow}>
                <TextInput testID="sec-expiry-days" keyboardType="number-pad"
                  value={String(sec.temp_password_expiry_days)}
                  onChangeText={(t) => setSec({ ...sec, temp_password_expiry_days: Number(t) || 0 })}
                  style={styles.expiryInput} />
                <Text style={styles.rowLabel}>days</Text>
              </View>
              <TouchableOpacity testID="sec-save" onPress={saveSec} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
              <Text style={[styles.rowLabel, { marginTop: spacing.md, marginBottom: spacing.sm }]}>Provisioned accounts</Text>
              {!accounts || accounts.accounts.length === 0 ? (
                <Text style={styles.rowHint}>No pending provisioned accounts.</Text>
              ) : (
                accounts.accounts.map((a: any) => (
                  <View key={a.id} style={styles.acctRow} testID={`provisioned-${a.id}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel} numberOfLines={1}>{a.email}</Text>
                      <Text style={[styles.badge, a.expired && styles.badgeExpired]}>{a.expired ? "Expired" : "Active"}</Text>
                    </View>
                    <TouchableOpacity testID={`rotate-${a.id}`} onPress={() => rotate(a)} style={styles.rotateBtn}>
                      <Ionicons name="refresh" size={14} color={colors.textSecondary} />
                      <Text style={styles.rotateText}>Re-issue</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: 4 },
  headerTitle: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  cardTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800", marginBottom: 2 },
  cardSub: { color: colors.textMuted, fontSize: font.small, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm },
  rowLabel: { color: colors.textPrimary, fontSize: font.small, fontWeight: "600" },
  rowHint: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  pill: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  pillOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  pillTextOn: { color: "#09090b" },
  saveBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 10, alignItems: "center", marginTop: spacing.md },
  saveBtnText: { color: "#09090b", fontWeight: "800", fontSize: font.small },
  expiryRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  expiryInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, color: colors.textPrimary, width: 70, textAlign: "center" },
  acctRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, marginBottom: 6 },
  badge: { alignSelf: "flex-start", marginTop: 4, fontSize: 10, color: colors.textMuted, backgroundColor: colors.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, overflow: "hidden" },
  badgeExpired: { color: "#f87171", backgroundColor: "rgba(248,113,113,0.12)" },
  rotateBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  rotateText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
});
