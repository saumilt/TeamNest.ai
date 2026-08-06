import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
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
import { apiGet, apiPatch, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

type PersonaId = "personal" | "student" | "team" | "business" | "enterprise" | "other";

const PERSONAS: { id: PersonaId; icon: any; title: string; sub: string }[] = [
  { id: "personal", icon: "person", title: "Personal research", sub: "Organize research & projects for yourself" },
  { id: "student", icon: "school", title: "Student / school project", sub: "Collaborate on group assignments" },
  { id: "team", icon: "people", title: "Team collaboration", sub: "Run projects with your team" },
  { id: "business", icon: "business", title: "Business", sub: "Company knowledge & workflows" },
  { id: "enterprise", icon: "library", title: "Enterprise", sub: "Org-wide, governed AI collaboration" },
  { id: "other", icon: "sparkles", title: "Something else", sub: "Just exploring" },
];

const PERSONAL_TEMPLATES = [
  "Research Topic", "Personal Plan", "Business Idea", "Purchase Comparison", "Trip Planning",
];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const { user, loading, setUser } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [persona, setPersona] = useState<PersonaId | null>(null);
  const [projectName, setProjectName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [template, setTemplate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/(auth)/login");
    else if (user.onboarding_completed) router.replace("/(tabs)");
  }, [user, loading]);

  const markUser = async () => {
    try {
      const me = await apiGet("/api/auth/me");
      if (me) setUser(me);
    } catch {
      if (user) setUser({ ...user, onboarding_completed: true });
    }
  };

  const choosePersona = async (id: PersonaId) => {
    setPersona(id);
    apiPatch("/api/user/onboarding", { persona: id, completed: false }).catch(() => {});
    if (id === "enterprise" || id === "other") {
      await finish(id, null);
    } else {
      setStep(2);
    }
  };

  const finish = async (personaId: PersonaId, firstChatName: string | null) => {
    setBusy(true);
    try {
      let created: any = null;
      if (firstChatName) {
        created = await apiPost("/api/chats", {
          type: "group",
          name: firstChatName,
          description: dueDate ? `Due ${dueDate}` : "",
          member_ids: [],
          default_models: ["chatgpt", "claude", "gemini"],
          posting_policy: "all",
        });
      }
      await apiPatch("/api/user/onboarding", { persona: personaId, completed: true });
      await markUser();
      if (created?.id) router.replace(`/chat/${created.id}`);
      else router.replace("/(tabs)");
    } catch {
      router.replace("/(tabs)");
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    await apiPatch("/api/user/onboarding", { persona: persona || "other", completed: true }).catch(() => {});
    await markUser();
    router.replace("/(tabs)");
  };

  const canContinue =
    persona === "personal"
      ? !!template
      : ["student", "team", "business"].includes(persona || "")
        ? !!projectName.trim()
        : true;

  const submitStep2 = () => {
    if (persona === "personal") return finish(persona, template);
    return finish(persona as PersonaId, projectName.trim());
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.brandRow}>
          <View style={styles.mark}><Text style={styles.markText}>TN</Text></View>
          <Text style={styles.brand}>TeamNest.ai</Text>
        </View>
        <TouchableOpacity testID="onboarding-skip" onPress={skip} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {step === 1 ? (
            <View testID="onboarding-step-persona">
              <Text style={styles.kicker}>Welcome{user?.name ? `, ${user.name}` : ""}</Text>
              <Text style={styles.h1}>How will you use TeamNest?</Text>
              <Text style={styles.lead}>We&apos;ll tailor your first step. You can change this anytime.</Text>
              <View style={styles.personaList}>
                {PERSONAS.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    testID={`persona-${p.id}`}
                    activeOpacity={0.8}
                    onPress={() => choosePersona(p.id)}
                    disabled={busy}
                    style={styles.personaCard}
                  >
                    <View style={styles.personaIcon}>
                      <Ionicons name={p.icon} size={20} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.personaTitle}>{p.title}</Text>
                      <Text style={styles.personaSub} numberOfLines={1}>{p.sub}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <View testID="onboarding-step-first">
              <TouchableOpacity onPress={() => setStep(1)} style={styles.backRow} testID="onboarding-back">
                <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
              <Text style={styles.h1}>
                {persona === "personal" ? "Start your first workspace" : "Create your first project"}
              </Text>

              {persona === "personal" ? (
                <View style={styles.templateWrap}>
                  {PERSONAL_TEMPLATES.map((t) => {
                    const on = template === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        testID={`template-${t.replace(/\s+/g, "-").toLowerCase()}`}
                        onPress={() => setTemplate(t)}
                        style={[styles.templateChip, on && styles.templateChipOn]}
                      >
                        {on ? <Ionicons name="checkmark" size={14} color={colors.accent} /> : null}
                        <Text style={[styles.templateText, on && styles.templateTextOn]}>{t}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.formWrap}>
                  <Text style={styles.label}>
                    {persona === "student" ? "PROJECT NAME" : persona === "team" ? "TEAM / PROJECT NAME" : "WORKSPACE / PROJECT NAME"}
                  </Text>
                  <TextInput
                    testID="onboarding-project-name"
                    value={projectName}
                    onChangeText={setProjectName}
                    placeholder={persona === "student" ? "e.g. History group project" : "e.g. Q3 Launch"}
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                  />
                  {persona === "student" ? (
                    <>
                      <Text style={[styles.label, { marginTop: spacing.md }]}>DUE DATE (OPTIONAL)</Text>
                      <TextInput
                        testID="onboarding-due-date"
                        value={dueDate}
                        onChangeText={setDueDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={colors.textMuted}
                        style={styles.input}
                      />
                    </>
                  ) : null}
                  <Text style={styles.hint}>
                    You can invite {persona === "student" ? "classmates" : "members"} from inside the project once it&apos;s created.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                testID="onboarding-finish"
                onPress={submitStep2}
                disabled={!canContinue || busy}
                style={[styles.primaryBtn, (!canContinue || busy) && { opacity: 0.5 }]}
              >
                {busy ? <ActivityIndicator color="#09090b" /> : <Text style={styles.primaryBtnText}>Create &amp; continue</Text>}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  mark: { width: 30, height: 30, borderRadius: radius.sm, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  markText: { color: "#09090b", fontWeight: "800", fontSize: 13 },
  brand: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800" },
  skipBtn: { padding: 6 },
  skipText: { color: colors.textMuted, fontSize: font.small, fontWeight: "600" },
  scroll: { padding: spacing.xl, paddingBottom: 60 },
  kicker: { color: colors.accent, fontSize: font.tiny, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: spacing.sm },
  h1: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800", letterSpacing: -0.5 },
  lead: { color: colors.textSecondary, fontSize: font.body, marginTop: spacing.sm, lineHeight: 21 },
  personaList: { marginTop: spacing.xl, gap: spacing.md },
  personaCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  personaIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accentDim, alignItems: "center", justifyContent: "center" },
  personaTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  personaSub: { color: colors.textMuted, fontSize: font.small, marginTop: 1 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: spacing.lg },
  backText: { color: colors.textMuted, fontSize: font.small, fontWeight: "600" },
  templateWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xl },
  templateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  templateChipOn: { borderColor: colors.accentBorder, backgroundColor: colors.accentDim },
  templateText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  templateTextOn: { color: colors.textPrimary },
  formWrap: { marginTop: spacing.xl, gap: spacing.sm },
  label: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1.2, marginBottom: 6 },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    color: colors.textPrimary,
    fontSize: font.body,
  },
  hint: { color: colors.textMuted, fontSize: font.small, marginTop: spacing.sm },
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
