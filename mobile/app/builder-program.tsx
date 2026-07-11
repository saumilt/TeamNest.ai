import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "@/src/api";
import { colors, font, radius, spacing } from "@/src/theme";

const PERKS = [
  ["sparkles", "Design", "Craft unique agentic AI employees for real jobs."],
  ["rocket", "Publish", "List them on the marketplace for other teams."],
  ["cash", "Earn", "Get paid every time a team licenses your AI employee."],
];

export default function BuilderProgramScreen() {
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<any>(null);
  const [f, setF] = useState({ full_name: "", company: "", website: "", motivation: "", value_prop: "", agent_ideas: "" });
  const [busy, setBusy] = useState(false);

  const load = () => apiGet("/api/builder-program/me").then(setMe).catch(() => setMe({ builder_access: false }));
  useEffect(() => { load(); }, []);

  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    setBusy(true);
    try { await apiPost("/api/builder-program/apply", f); Alert.alert("Submitted", "Your application is under review."); await load(); }
    catch (e: any) { Alert.alert("Error", e.message); }
    setBusy(false);
  };

  if (!me) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  const app = me.application;
  const submitted = app && (app.status === "pending" || app.status === "approved");
  const valid = f.full_name.trim().length >= 2 && f.motivation.trim().length >= 10 && f.value_prop.trim().length >= 10 && f.agent_ideas.trim().length >= 10;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <TouchableOpacity testID="mb-bp-back" onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={colors.textSecondary} /></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Builder Program</Text>
            <Text style={styles.sub}>Build, publish & earn from AI employees.  ✦ Beta</Text>
          </View>
        </View>

        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {PERKS.map(([icon, t, d]) => (
            <View key={t} style={styles.perkRow}>
              <Ionicons name={`${icon}-outline` as any} size={18} color={colors.accent} />
              <View style={{ flex: 1 }}><Text style={styles.perkTitle}>{t}</Text><Text style={styles.perkBody}>{d}</Text></View>
            </View>
          ))}
        </View>

        {me.builder_access ? (
          <View style={[styles.card, { borderColor: colors.success, marginTop: spacing.lg }]} testID="mb-bp-approved">
            <Text style={{ color: colors.success, fontWeight: "800" }}>You're an approved builder</Text>
            <Text style={styles.cardBody}>You have full access to the AI Employee Builder{me.reason === "team_plan" ? " via your Team plan" : ""}.</Text>
            <TouchableOpacity testID="mb-bp-open" onPress={() => router.replace("/builder")} style={styles.primaryBtn}><Text style={styles.primaryBtnText}>Open the Builder</Text></TouchableOpacity>
          </View>
        ) : submitted ? (
          <View style={[styles.card, { borderColor: colors.accentBorder, marginTop: spacing.lg }]} testID="mb-bp-pending">
            <Text style={{ color: colors.accent, fontWeight: "800" }}>Application under review</Text>
            <Text style={styles.cardBody}>Thanks for applying! We'll grant access here once approved.</Text>
          </View>
        ) : (
          <View style={[styles.card, { marginTop: spacing.lg, gap: spacing.md }]} testID="mb-bp-form">
            <Text style={styles.cardTitle}>Tell us about you</Text>
            {[["full_name", "Full name"], ["company", "Company (optional)"], ["website", "Website (optional)"]].map(([k, label]) => (
              <TextInput key={k} testID={`mb-bp-${k}`} value={(f as any)[k]} onChangeText={set(k)} placeholder={label} placeholderTextColor={colors.textMuted} style={styles.input} />
            ))}
            {[["motivation", "Why do you want to build AI employees?"], ["value_prop", "How will you add value?"], ["agent_ideas", "What unique AI employees would you design?"]].map(([k, label]) => (
              <TextInput key={k} testID={`mb-bp-${k}`} value={(f as any)[k]} onChangeText={set(k)} placeholder={label} placeholderTextColor={colors.textMuted} multiline style={[styles.input, { minHeight: 70 }]} />
            ))}
            <TouchableOpacity testID="mb-bp-submit" onPress={submit} disabled={busy || !valid} style={[styles.primaryBtn, (busy || !valid) && { opacity: 0.4 }]}>
              {busy ? <ActivityIndicator color="#09090b" size="small" /> : <Text style={styles.primaryBtnText}>Submit application</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  h1: { color: colors.textPrimary, fontSize: font.h2, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: font.small, marginTop: 2 },
  perkRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  perkTitle: { color: colors.textPrimary, fontSize: font.small, fontWeight: "700" },
  perkBody: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2, lineHeight: 17 },
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  cardTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  cardBody: { color: colors.textSecondary, fontSize: font.small, marginTop: 4, lineHeight: 19 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 11, color: colors.textPrimary, fontSize: font.body },
  primaryBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center", marginTop: spacing.sm },
  primaryBtnText: { color: "#09090b", fontWeight: "800", fontSize: font.body },
});
