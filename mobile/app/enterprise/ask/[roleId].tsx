import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiPost } from "@/src/api";
import { colors, font, radius, spacing } from "@/src/theme";

const SUGGESTIONS = [
  "What are the most important recurring tasks in this role?",
  "How were approval exceptions handled?",
  "What are the top risks I should watch out for?",
];

export default function AskRole() {
  const { roleId } = useLocalSearchParams<{ roleId: string }>();
  const insets = useSafeAreaInsets();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = async (question?: string) => {
    const text = (question ?? q).trim();
    if (!text || busy) return;
    setQ(""); setBusy(true);
    setTurns((t) => [...t, { question: text, answer: null, citations: [] }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const r = await apiPost(`/api/enterprise/roles/${roleId}/ask`, { question: text, session_id: sessionId });
      setSessionId(r.session_id);
      setTurns((t) => t.map((x, i) => i === t.length - 1 ? { ...x, answer: r.answer, citations: r.citations || [] } : x));
    } catch (e: any) {
      setTurns((t) => t.map((x, i) => i === t.length - 1 ? { ...x, answer: e.message || "Failed to answer." } : x));
    } finally { setBusy(false); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }}>
        <View style={styles.headerRow}>
          <TouchableOpacity testID="ask-back" onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="chevron-back" size={22} color={colors.textSecondary} /></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Ask the role</Text>
            <Text style={styles.sub}>Grounded in approved knowledge · no personal identity shared</Text>
          </View>
          <Ionicons name="sparkles" size={18} color={colors.accent} />
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={insets.top}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 24 }}>
          {turns.length === 0 && (
            <View style={{ alignItems: "center", paddingTop: 30 }}>
              <Ionicons name="chatbubbles-outline" size={30} color={colors.textMuted} />
              <Text style={[styles.sub, { textAlign: "center", marginVertical: spacing.md }]}>Ask anything about how this role&apos;s work gets done.</Text>
              {SUGGESTIONS.map((s) => (
                <TouchableOpacity key={s} testID="ask-suggestion" onPress={() => send(s)} style={styles.suggestion}><Text style={styles.suggestionText}>{s}</Text></TouchableOpacity>
              ))}
            </View>
          )}
          {turns.map((t, i) => (
            <View key={i} style={{ marginBottom: spacing.md }}>
              <View style={styles.userBubble} testID="ask-question"><Text style={styles.userText}>{t.question}</Text></View>
              <View style={styles.aiBubble}>
                {t.answer === null ? <ActivityIndicator color={colors.accent} /> : (
                  <>
                    <Text style={styles.aiText} testID="ask-answer">{t.answer}</Text>
                    {t.citations?.length > 0 && (
                      <View style={styles.citeWrap}>
                        {t.citations.map((c: any) => <View key={c.n} style={styles.cite}><Text style={styles.citeText}>[S{c.n}] {c.title}</Text></View>)}
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={[styles.inputRow, { paddingBottom: insets.bottom + spacing.sm }]}>
          <TextInput testID="ask-input" value={q} onChangeText={setQ} placeholder="Ask about this role…" placeholderTextColor={colors.textMuted} style={styles.input} onSubmitEditing={() => send()} returnKeyType="send" />
          <TouchableOpacity testID="ask-send" onPress={() => send()} disabled={busy || !q.trim()} style={[styles.sendBtn, (busy || !q.trim()) && { opacity: 0.4 }]}>
            <Ionicons name="arrow-up" size={20} color="#09090b" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: { padding: 4 },
  h1: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  sub: { color: colors.textSecondary, fontSize: font.tiny, marginTop: 2 },
  suggestion: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: spacing.sm, width: "100%" },
  suggestionText: { color: colors.textSecondary, fontSize: font.small },
  userBubble: { alignSelf: "flex-end", maxWidth: "85%", backgroundColor: colors.accent, borderRadius: radius.lg, borderBottomRightRadius: 4, paddingHorizontal: spacing.md, paddingVertical: 9 },
  userText: { color: "#09090b", fontSize: font.small, fontWeight: "600" },
  aiBubble: { alignSelf: "flex-start", maxWidth: "92%", backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, borderBottomLeftRadius: 4, paddingHorizontal: spacing.md, paddingVertical: 10, marginTop: 6 },
  aiText: { color: colors.textPrimary, fontSize: font.small, lineHeight: 21 },
  citeWrap: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: spacing.sm },
  cite: { backgroundColor: colors.surfaceHover, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  citeText: { color: colors.textMuted, fontSize: 10 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  input: { flex: 1, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 11, color: colors.textPrimary, fontSize: font.body },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
});
