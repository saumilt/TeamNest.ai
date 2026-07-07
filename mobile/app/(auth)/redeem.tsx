import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
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
import { apiGet } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

export default function Redeem() {
  const { redeem } = useAuth();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [codeInfo, setCodeInfo] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const validate = async () => {
    const c = code.trim().toUpperCase();
    if (c.length < 4) return;
    setChecking(true);
    setError("");
    setCodeInfo(null);
    try {
      const info = await apiGet(`/api/launch/code/${c}`);
      setCodeInfo(info);
      if (info.state !== "valid") {
        setError(`This code is ${info.state}.`);
      }
    } catch (e: any) {
      setError(e.message || "Could not check that code");
    } finally {
      setChecking(false);
    }
  };

  const doRedeem = async () => {
    setError("");
    if (!code.trim() || !name.trim() || !email.trim() || password.length < 6) {
      setError("Fill every field. Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      await redeem({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        email: email.trim(),
        password,
      });
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Could not redeem this code");
    } finally {
      setBusy(false);
    }
  };

  const valid = codeInfo?.state === "valid";

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16 }]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          testID="redeem-back-btn"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
          <Text style={styles.backText}>Back to sign in</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Redeem your invite</Text>
        <Text style={styles.subtitle}>
          TeamNest is invite-only. Enter your code to create your workspace.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>INVITE CODE</Text>
          <View style={styles.codeRow}>
            <TextInput
              testID="redeem-code-input"
              value={code}
              onChangeText={(t) => {
                setCode(t.toUpperCase());
                setCodeInfo(null);
              }}
              onBlur={validate}
              placeholder="DEVOS100"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              style={[styles.input, styles.codeInput, valid && styles.codeValid]}
            />
            <TouchableOpacity
              testID="redeem-check-btn"
              onPress={validate}
              style={styles.checkBtn}
              disabled={checking}
            >
              {checking ? (
                <ActivityIndicator color={colors.accent} size="small" />
              ) : (
                <Text style={styles.checkBtnText}>Check</Text>
              )}
            </TouchableOpacity>
          </View>
          {valid ? (
            <View testID="redeem-code-valid" style={styles.validBanner}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.validText}>
                {codeInfo.access_name || "Access"} · {codeInfo.remaining} spots left
              </Text>
            </View>
          ) : null}

          <Text style={[styles.label, { marginTop: spacing.lg }]}>YOUR NAME</Text>
          <TextInput
            testID="redeem-name-input"
            value={name}
            onChangeText={setName}
            placeholder="Ada Lovelace"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Text style={[styles.label, { marginTop: spacing.md }]}>EMAIL</Text>
          <TextInput
            testID="redeem-email-input"
            value={email}
            onChangeText={setEmail}
            placeholder="you@team.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
          <Text style={[styles.label, { marginTop: spacing.md }]}>PASSWORD</Text>
          <TextInput
            testID="redeem-password-input"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            style={styles.input}
          />

          {error ? (
            <Text testID="redeem-error" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            testID="redeem-submit-btn"
            activeOpacity={0.85}
            onPress={doRedeem}
            disabled={busy}
            style={styles.primaryBtn}
          >
            {busy ? (
              <ActivityIndicator color="#09090b" />
            ) : (
              <Text style={styles.primaryBtnText}>Claim access</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: 60 },
  back: { flexDirection: "row", alignItems: "center", marginBottom: spacing.xl },
  backText: { color: colors.textSecondary, fontSize: font.body },
  title: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800" },
  subtitle: {
    color: colors.textSecondary,
    fontSize: font.body,
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  card: {
    marginTop: spacing.xl,
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
  codeRow: { flexDirection: "row", gap: spacing.sm },
  codeInput: { flex: 1, fontFamily: "monospace", letterSpacing: 2 },
  codeValid: { borderColor: colors.success },
  checkBtn: {
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentDim,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBtnText: { color: colors.accent, fontWeight: "700" },
  validBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  validText: { color: colors.success, fontSize: font.small, fontWeight: "600" },
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
});
