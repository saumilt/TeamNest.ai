import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

const RULES = [
  { key: "len", label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { key: "upper", label: "An uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { key: "lower", label: "A lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { key: "num", label: "A number", test: (p: string) => /[0-9]/.test(p) },
  { key: "special", label: "A special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

/** Blocking first-login screen for admin-provisioned users (must_change_password). */
export default function ForcePasswordChange() {
  const insets = useSafeAreaInsets();
  const { user, setUser, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const allPass = RULES.every((r) => r.test(password));
  const match = confirm.length > 0 && password === confirm;

  const submit = async () => {
    setError("");
    if (!allPass) {
      setError("Password does not meet the requirements.");
      return;
    }
    if (!match) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/me/set-initial-password", { new_password: password });
      try {
        const me = await apiGet("/api/auth/me");
        setUser(me);
      } catch {
        setUser({ ...(user || {}), must_change_password: false });
      }
    } catch (e: any) {
      setError(e.message || "Could not update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 48 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.badge}><Text style={styles.badgeText}>SECURE YOUR ACCOUNT</Text></View>
        <Text style={styles.title}>Set your password</Text>
        <Text style={styles.sub}>
          Welcome{user?.name ? `, ${user.name}` : ""}. For security, please replace your temporary
          password before continuing.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>NEW PASSWORD</Text>
          <TextInput
            testID="force-password-input" value={password} onChangeText={setPassword}
            placeholder="••••••••" placeholderTextColor={colors.textMuted} secureTextEntry style={styles.input}
          />
          <Text style={[styles.label, { marginTop: spacing.md }]}>CONFIRM PASSWORD</Text>
          <TextInput
            testID="force-password-confirm" value={confirm} onChangeText={setConfirm}
            placeholder="••••••••" placeholderTextColor={colors.textMuted} secureTextEntry style={styles.input}
          />
          <View style={styles.rules}>
            {RULES.map((r) => {
              const ok = r.test(password);
              return (
                <View key={r.key} style={styles.ruleRow}>
                  <Ionicons name={ok ? "checkmark-circle" : "ellipse-outline"} size={14} color={ok ? "#34d399" : colors.textMuted} />
                  <Text style={[styles.ruleText, ok && { color: "#34d399" }]}>{r.label}</Text>
                </View>
              );
            })}
          </View>
          {error ? <Text testID="force-password-error" style={styles.error}>{error}</Text> : null}
          <TouchableOpacity testID="force-password-submit" activeOpacity={0.85} onPress={submit} disabled={busy} style={styles.primaryBtn}>
            {busy ? <ActivityIndicator color="#09090b" /> : <Text style={styles.primaryBtnText}>Save & continue</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity testID="force-password-logout" onPress={logout} style={{ alignSelf: "center", marginTop: spacing.lg }}>
          <Text style={{ color: colors.textMuted, fontSize: font.small }}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 60 },
  badge: {
    alignSelf: "flex-start", backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentBorder,
    borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: spacing.md,
  },
  badgeText: { color: colors.accent, fontSize: font.tiny, fontWeight: "800", letterSpacing: 0.8 },
  title: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800" },
  sub: { color: colors.textSecondary, fontSize: font.body, marginTop: 6, marginBottom: spacing.xl, lineHeight: 21 },
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  label: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "800", letterSpacing: 1 },
  input: {
    marginTop: 6, height: 48, borderRadius: radius.md, backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, color: colors.textPrimary, fontSize: font.body,
  },
  rules: { marginTop: spacing.md, gap: 5 },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  ruleText: { color: colors.textMuted, fontSize: font.small },
  error: { color: "#f87171", fontSize: font.small, marginTop: spacing.sm },
  primaryBtn: {
    marginTop: spacing.lg, height: 50, borderRadius: radius.pill, backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center",
  },
  primaryBtnText: { color: "#09090b", fontSize: font.body, fontWeight: "800" },
});
