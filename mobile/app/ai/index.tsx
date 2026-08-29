import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ResearchScreen from "@/app/(tabs)/research";
import AutomationsScreen from "@/app/automations/index";
import AIEmployeesPanel from "@/src/components/ai/AIEmployeesPanel";
import ActivityPanel from "@/src/components/ai/ActivityPanel";
import { colors, font, radius, spacing } from "@/src/theme";

const TABS = [
  { key: "research", label: "Research", icon: "sparkles", mode: "ASK" },
  { key: "employees", label: "Employees", icon: "people", mode: "DO" },
  { key: "automations", label: "Automations", icon: "flash", mode: "WATCH" },
  { key: "activity", label: "Activity", icon: "pulse", mode: "" },
] as const;

const LEGEND = [
  { m: "Ask", d: "research & analyze" },
  { m: "Do", d: "AI performs work" },
  { m: "Watch", d: "monitor over time" },
];

/** Mobile AI Hub — Ask / Do / Watch, mirroring the web /ai hub. Reached from
 *  Home + You (the Research bottom tab stays for fast access). */
export default function AIHubScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const initial = TABS.some((t) => t.key === params.tab) ? (params.tab as string) : "research";
  const [tab, setTab] = useState<string>(initial);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]} testID="mobile-ai-hub">
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>WORKSPACE / AI</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.back} testID="ai-hub-close" onPress={() => router.back()}>Done</Text>
      </View>
      <Text style={styles.h1}>AI</Text>
      <View style={styles.legend}>
        {LEGEND.map((x) => (
          <View key={x.m} style={styles.legendChip}>
            <Text style={styles.legendM}>{x.m}</Text>
            <Text style={styles.legendD}> · {x.d}</Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Text
              key={t.key}
              testID={`ai-tab-${t.key}`}
              onPress={() => setTab(t.key)}
              style={[styles.tab, on && styles.tabOn]}
            >
              <Ionicons name={t.icon as any} size={13} color={on ? colors.accent : colors.textMuted} />
              {`  ${t.label}`}
            </Text>
          );
        })}
      </ScrollView>

      <View style={{ flex: 1 }} testID={`ai-panel-${tab}`}>
        {tab === "research" ? <ResearchScreen embedded /> : null}
        {tab === "employees" ? <AIEmployeesPanel /> : null}
        {tab === "automations" ? <AutomationsScreen embedded /> : null}
        {tab === "activity" ? <ActivityPanel /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg },
  kicker: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1.5 },
  back: { color: colors.accent, fontSize: font.small, fontWeight: "700" },
  h1: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800", paddingHorizontal: spacing.lg, marginTop: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  legendChip: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  legendM: { color: colors.accent, fontSize: font.tiny, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  legendD: { color: colors.textMuted, fontSize: font.tiny },
  tabBar: { flexGrow: 0, marginTop: spacing.md, marginBottom: spacing.sm },
  tab: { color: colors.textMuted, fontSize: font.small, fontWeight: "700", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8, overflow: "hidden", backgroundColor: colors.bgElevated },
  tabOn: { color: colors.accent, borderColor: colors.accentBorder, backgroundColor: colors.accentDim },
});
