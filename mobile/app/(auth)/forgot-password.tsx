import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
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

export default function ForgotPassword() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!email.trim()) {
      setError("Enter your account email.");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/auth/forgot-password", { email: email.trim().toLowerCase() });
      setSent(true);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 56 }]} keyboardShouldPersistTaps="handled">
        <TouchableOpacity testID="forgot-back" onPress={() => router.back()} style={styles.back} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          <Text style={styles.backText}>Back to sign in</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.sub}>Enter your account email and we&apos;ll send a single-use reset link.</Text>

        <View style={styles.card}>
          {sent ? (
            <View testID="forgot-sent" style={{ gap: spacing.sm }}>
              <Ionicons name="mail-outline" size={28} color={colors.accent} />
              <Text style={styles.sentTitle}>Check your email</Text>
              <Text style={styles.sentBody}>
                If an account exists for {email.trim().toLowerCase()}, a reset link is on its way. The
                link opens a secure page where you can set a new password.
              </Text>
              <TouchableOpacity testID="forgot-have-code" onPress={() => router.push("/(auth)/reset-password")} style={styles.linkBtn}>
                <Text style={styles.linkBtnText}>I already have a reset code</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.label}>EMAIL</Text>
              <TextInput
                testID="forgot-email-input"
                value={email}
                onChangeText={setEmail}
                placeholder="you@team.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
              {error ? <Text testID="forgot-error" style={styles.error}>{error}</Text> : null}
              <TouchableOpacity testID="forgot-submit" activeOpacity={0.85} onPress={submit} disabled={busy} style={styles.primaryBtn}>
                {busy ? <ActivityIndicator color="#09090b" /> : <Text style={styles.primaryBtnText}>Send reset link</Text>}
              </TouchableOpacity>
              <Link href="/(auth)/reset-password" asChild>
                <TouchableOpacity testID="forgot-have-code-link" style={styles.linkBtn}>
                  <Text style={styles.linkBtnText}>I already have a reset code</Text>
                </TouchableOpacity>
              </Link>
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
  error: { color: "#f87171", fontSize: font.small, marginTop: spacing.sm },
  primaryBtn: {
    marginTop: spacing.lg, height: 50, borderRadius: radius.pill, backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center",
  },
  primaryBtnText: { color: "#09090b", fontSize: font.body, fontWeight: "800" },
  linkBtn: { marginTop: spacing.md, alignItems: "center" },
  linkBtnText: { color: colors.accent, fontSize: font.small, fontWeight: "700" },
  sentTitle: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  sentBody: { color: colors.textSecondary, fontSize: font.small, lineHeight: 20 },
});
