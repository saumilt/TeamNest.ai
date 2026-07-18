import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
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
import { apiPost } from "@/src/api";
import { colors, font, radius, spacing } from "@/src/theme";

const POLICY = "At least 8 characters with an uppercase, lowercase, number and special character.";

function complexityError(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters long.";
  if (!/[A-Z]/.test(pw)) return "Add at least one uppercase letter.";
  if (!/[a-z]/.test(pw)) return "Add at least one lowercase letter.";
  if (!/[0-9]/.test(pw)) return "Add at least one number.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Add at least one special character.";
  return null;
}

export default function ResetPassword() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState((params.token as string) || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError("");
    if (!token.trim()) {
      setError("Paste the reset code from your email.");
      return;
    }
    const pwErr = complexityError(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/auth/reset-password", { token: token.trim(), password });
      setDone(true);
    } catch (e: any) {
      setError(e.message || "Reset failed — the code may be expired.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 56 }]} keyboardShouldPersistTaps="handled">
        <TouchableOpacity testID="reset-back" onPress={() => router.replace("/(auth)/login")} style={styles.back} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          <Text style={styles.backText}>Back to sign in</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.sub}>Paste the code from your reset email, then choose a new password.</Text>

        <View style={styles.card}>
          {done ? (
            <View testID="reset-done" style={{ gap: spacing.sm }}>
              <Ionicons name="checkmark-circle" size={30} color={colors.accent} />
              <Text style={styles.sentTitle}>Password updated</Text>
              <Text style={styles.sentBody}>You can now sign in with your new password.</Text>
              <TouchableOpacity testID="reset-goto-login" onPress={() => router.replace("/(auth)/login")} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Go to sign in</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.label}>RESET CODE</Text>
              <TextInput
                testID="reset-token-input"
                value={token}
                onChangeText={setToken}
                placeholder="Paste code from email"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={styles.input}
              />
              <Text style={[styles.label, { marginTop: spacing.md }]}>NEW PASSWORD</Text>
              <TextInput
                testID="reset-password-input"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                style={styles.input}
              />
              <Text style={styles.policy}>{POLICY}</Text>
              {error ? <Text testID="reset-error" style={styles.error}>{error}</Text> : null}
              <TouchableOpacity testID="reset-submit" activeOpacity={0.85} onPress={submit} disabled={busy} style={styles.primaryBtn}>
                {busy ? <ActivityIndicator color="#09090b" /> : <Text style={styles.primaryBtnText}>Update password</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 60 },
  back: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: spacing.xl },
  backText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  title: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800" },
  sub: { color: colors.textSecondary, fontSize: font.body, marginTop: 6, marginBottom: spacing.xl },
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  label: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "800", letterSpacing: 1 },
  input: {
    marginTop: 6, height: 48, borderRadius: radius.md, backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, color: colors.textPrimary, fontSize: font.body,
  },
  policy: { color: colors.textMuted, fontSize: font.tiny, marginTop: 8 },
  error: { color: "#f87171", fontSize: font.small, marginTop: spacing.sm },
  primaryBtn: {
    marginTop: spacing.lg, height: 50, borderRadius: radius.pill, backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center",
  },
  primaryBtnText: { color: "#09090b", fontSize: font.body, fontWeight: "800" },
  sentTitle: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  sentBody: { color: colors.textSecondary, fontSize: font.small, lineHeight: 20 },
});
