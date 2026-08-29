import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { apiGet, apiPost } from "@/src/api";
import { Markdown } from "@/src/markdown";
import { colors, font, radius, spacing } from "@/src/theme";

type Props = { chatId?: string; callId?: string; title?: string; icon?: boolean };

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

/** Quick preset start times for scheduling. */
function presets(): { label: string; iso: string }[] {
  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const tmrw = new Date(now); tmrw.setDate(tmrw.getDate() + 1); tmrw.setHours(9, 0, 0, 0);
  const mon = new Date(now); const day = mon.getDay(); const add = ((8 - day) % 7) || 7; mon.setDate(mon.getDate() + add); mon.setHours(9, 0, 0, 0);
  return [
    { label: "In 1 hour", iso: in1h.toISOString() },
    { label: "Tomorrow 9 AM", iso: tmrw.toISOString() },
    { label: "Next Mon 9 AM", iso: mon.toISOString() },
  ];
}

/** "Prepare me" — shows the next meeting, lets you schedule one, then briefs it. */
export default function MeetingPrepButton({ chatId, callId, title, icon = false }: Props) {
  const [open, setOpen] = useState(false);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [loadingUp, setLoadingUp] = useState(false);
  const [brief, setBrief] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [savingIso, setSavingIso] = useState<string | null>(null);

  const loadUpcoming = useCallback(async () => {
    setLoadingUp(true);
    try {
      const d = await apiGet(`/api/meetings/upcoming${chatId ? `?chat_id=${chatId}` : ""}`);
      setUpcoming(d.items || []);
    } catch { setUpcoming([]); } finally { setLoadingUp(false); }
  }, [chatId]);

  const openSheet = () => {
    setOpen(true); setBrief(null); setError(""); setFormTitle(title ? `${title} sync` : "");
    loadUpcoming();
  };

  const run = async () => {
    setLoading(true); setError(""); setBrief(null);
    try {
      const d = await apiPost("/api/ai/meeting-prep", { chat_id: chatId, call_id: callId });
      setBrief(d);
    } catch (e: any) { setError(e?.message || "Couldn't prepare a brief"); } finally { setLoading(false); }
  };

  const schedule = async (iso: string) => {
    if (!formTitle.trim()) { setError("Add a meeting title first"); return; }
    setSavingIso(iso); setError("");
    try {
      await apiPost("/api/meetings", { title: formTitle.trim(), start_at: iso, chat_id: chatId || null });
      setFormTitle("");
      await loadUpcoming();
    } catch (e: any) { setError(e?.message || "Couldn't schedule"); } finally { setSavingIso(null); }
  };

  const next = upcoming[0];

  return (
    <>
      <Pressable testID="meeting-prep-btn" onPress={openSheet} hitSlop={8} style={icon ? styles.iconBtn : styles.pill}>
        <Ionicons name="sparkles" size={icon ? 20 : 13} color={colors.accent} />
        {!icon ? <Text style={styles.pillText}>Prepare me</Text> : null}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={styles.overlay} testID="meeting-prep-dialog">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.head}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                <Ionicons name="sparkles" size={16} color={colors.accent} />
                <Text style={styles.title} numberOfLines={1}>Meeting prep{title ? ` · ${title}` : ""}</Text>
              </View>
              <Pressable testID="meeting-prep-close" onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
              {!brief ? (
                <>
                  <View style={styles.upcoming} testID="meeting-upcoming">
                    <Text style={styles.label}>NEXT MEETING</Text>
                    {loadingUp ? (
                      <ActivityIndicator color={colors.accent} style={{ marginTop: 6 }} />
                    ) : next ? (
                      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4 }}>
                        <Ionicons name="calendar" size={18} color={colors.accent} style={{ marginTop: 2 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.mtTitle}>{next.title}</Text>
                          <Text style={styles.mtWhen}>{fmt(next.start_at)}</Text>
                          {next.attendees?.length > 0 ? <Text style={styles.mtAtt}>{next.attendees.join(", ")}</Text> : null}
                        </View>
                      </View>
                    ) : (
                      <Text style={styles.dim}>No meeting scheduled yet — schedule one below or prep from the recent chat.</Text>
                    )}
                  </View>

                  <Text style={styles.label}>SCHEDULE A MEETING</Text>
                  <TextInput
                    testID="meeting-schedule-title"
                    value={formTitle}
                    onChangeText={setFormTitle}
                    placeholder="Meeting title"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                  />
                  <View style={styles.presetRow}>
                    {presets().map((p) => (
                      <Pressable key={p.label} testID={`meeting-preset-${p.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`} disabled={!!savingIso} onPress={() => schedule(p.iso)} style={styles.preset}>
                        {savingIso === p.iso ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={styles.presetText}>{p.label}</Text>}
                      </Pressable>
                    ))}
                  </View>

                  {error ? <Text style={styles.error}>{error}</Text> : null}
                  <Pressable testID="meeting-prep-run" onPress={run} disabled={loading} style={styles.primaryBtn}>
                    {loading ? <ActivityIndicator size="small" color="#09090b" /> : <><Ionicons name="sparkles" size={15} color="#09090b" /><Text style={styles.primaryText}>Prepare me</Text></>}
                  </Pressable>
                </>
              ) : (
                <View testID="meeting-prep-brief">
                  {brief.meeting ? (
                    <View style={styles.briefMeeting}>
                      <Ionicons name="calendar" size={14} color={colors.accent} />
                      <Text style={styles.briefMeetingText} numberOfLines={1}>{brief.meeting.title} · {fmt(brief.meeting.start_at)}</Text>
                    </View>
                  ) : null}
                  <Markdown content={brief.brief} />
                  <Pressable onPress={() => setBrief(null)} style={{ marginTop: spacing.md }}>
                    <Text style={styles.back}>← Back</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.accentBorder, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  pillText: { color: colors.accent, fontWeight: "700", fontSize: font.small },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "85%", borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  title: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800" },
  label: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1.2, marginTop: spacing.md, marginBottom: spacing.xs },
  upcoming: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  mtTitle: { color: colors.textPrimary, fontSize: font.small, fontWeight: "800" },
  mtWhen: { color: colors.textSecondary, fontSize: font.tiny, marginTop: 1 },
  mtAtt: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2 },
  input: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.textPrimary, fontSize: font.small },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  preset: { borderWidth: 1, borderColor: colors.accentBorder, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8, minWidth: 96, alignItems: "center" },
  presetText: { color: colors.accent, fontSize: font.tiny, fontWeight: "700" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: 12, marginTop: spacing.lg },
  primaryText: { color: "#09090b", fontSize: font.small, fontWeight: "800" },
  briefMeeting: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentBorder, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.md },
  briefMeetingText: { color: colors.textPrimary, fontSize: font.tiny, fontWeight: "700", flex: 1 },
  back: { color: colors.textMuted, fontSize: font.small },
  dim: { color: colors.textMuted, fontSize: font.small, marginTop: 4 },
  error: { color: colors.danger, fontSize: font.small, marginTop: spacing.sm },
});
