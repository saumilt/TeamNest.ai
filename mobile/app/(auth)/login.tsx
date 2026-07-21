import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link, router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

export default function Login() {
  const { login, demoLogin } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "login" | "demo">(null);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  const doLogin = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy("login");
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Login failed");
    } finally {
      setBusy(null);
    }
  };

  const doDemo = async () => {
    setError("");
    setBusy("demo");
    try {
      await demoLogin();
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Demo login failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 48 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandRow}>
          <View style={styles.mark}>
            <Text style={styles.markText}>TN</Text>
          </View>
          <Text style={styles.brand}>TeamNest.ai</Text>
        </View>
        <Text style={styles.tagline}>
          AI-native team chat, research & building — now in your pocket.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            testID="login-email-input"
            value={email}
            onChangeText={setEmail}
            placeholder="you@team.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            style={styles.input}
          />
          <Text style={[styles.label, { marginTop: spacing.md }]}>PASSWORD</Text>
          <View style={styles.pwWrap}>
            <TextInput
              testID="login-password-input"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="current-password"
              textContentType="password"
              style={[styles.input, styles.pwInput]}
            />
            <TouchableOpacity
              testID="login-toggle-password"
              onPress={() => setShowPw((v) => !v)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.pwToggle}
            >
              <Ionicons
                name={showPw ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          </View>

          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity testID="login-forgot-link" style={{ alignSelf: "flex-end", marginTop: spacing.sm }}>
              <Text style={{ color: colors.accent, fontSize: font.small, fontWeight: "700" }}>Forgot password?</Text>
            </TouchableOpacity>
          </Link>

          {error ? (
            <Text testID="login-error" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            testID="login-submit-btn"
            activeOpacity={0.85}
            onPress={doLogin}
            disabled={busy !== null}
            style={styles.primaryBtn}
          >
            {busy === "login" ? (
              <ActivityIndicator color="#09090b" />
            ) : (
              <Text style={styles.primaryBtnText}>Sign in</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          <TouchableOpacity
            testID="demo-login-btn"
            activeOpacity={0.85}
            onPress={doDemo}
            disabled={busy !== null}
            style={styles.ghostBtn}
          >
            {busy === "demo" ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <>
                <Ionicons name="flash" size={16} color={colors.accent} />
                <Text style={styles.ghostBtnText}>Try the live demo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Link href="/(auth)/redeem" asChild>
          <Pressable testID="have-invite-code-link" style={styles.inviteRow}>
            <Text style={styles.inviteText}>Have an invite code? </Text>
            <Text style={styles.inviteLink}>Redeem it →</Text>
          </Pressable>
        </Link>
      </ScrollView>
      <LinearGradient
        colors={["transparent", colors.bg]}
        style={[styles.bottomFade, { pointerEvents: "none" }]}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: 60 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  mark: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: { color: "#09090b", fontWeight: "800", fontSize: 18 },
  brand: { color: colors.textPrimary, fontSize: font.h2, fontWeight: "800" },
  tagline: {
    color: colors.textSecondary,
    fontSize: font.body,
    marginTop: spacing.lg,
    lineHeight: 22,
  },
  card: {
    marginTop: spacing.xxl,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  label: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: font.body,
  },
  pwWrap: { position: "relative", justifyContent: "center" },
  pwInput: { paddingRight: 48 },
  pwToggle: { position: "absolute", right: spacing.md, padding: 4 },
  error: { color: colors.danger, fontSize: font.small, marginTop: spacing.md },
  primaryBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#09090b", fontWeight: "800", fontSize: font.body },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.lg,
    gap: spacing.md,
  },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: font.small },
  ghostBtn: {
    flexDirection: "row",
    gap: spacing.sm,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentDim,
  },
  ghostBtnText: { color: colors.accent, fontWeight: "700", fontSize: font.body },
  inviteRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  inviteText: { color: colors.textSecondary, fontSize: font.body },
  inviteLink: { color: colors.accent, fontSize: font.body, fontWeight: "700" },
  bottomFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 40 },
});
