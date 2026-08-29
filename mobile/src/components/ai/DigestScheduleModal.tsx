import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { apiGet, apiPut } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { colors, font, radius, spacing } from "@/src/theme";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = { visible: boolean; onClose: (saved?: boolean) => void };

/** Owner/admin control for the weekly AI-employee digest email: day, time
 *  (UTC) and recipients. Mirrors the web DigestScheduleModal. */
export default function DigestScheduleModal({ visible, onClose }: Props) {
  const { show } = useToast();
  const [s, setS] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setS(null);
    apiGet("/api/ai-employees/_/digest-settings")
      .then((d) => {
        const custom = Array.isArray(d.recipient_user_ids) && d.recipient_user_ids.length > 0;
        setS({
          enabled: d.enabled,
          day_of_week: d.day_of_week,
          hour_utc: d.hour_utc,
          mode: custom ? "custom" : "default",
          customIds: custom ? d.recipient_user_ids : d.default_recipient_ids || [],
          available: d.available_recipients || [],
        });
      })
      .catch(() => onClose());
  }, [visible]);

  const localHint = (h: number) => {
    const d = new Date();
    d.setUTCHours(h, 0, 0, 0);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const toggleId = (id: string) =>
    setS((p: any) => ({
      ...p,
      customIds: p.customIds.includes(id)
        ? p.customIds.filter((x: string) => x !== id)
        : [...p.customIds, id],
    }));

  const save = async () => {
    setSaving(true);
    try {
      await apiPut("/api/ai-employees/_/digest-settings", {
        enabled: s.enabled,
        day_of_week: s.day_of_week,
        hour_utc: s.hour_utc,
        recipient_user_ids: s.mode === "custom" ? s.customIds : null,
      });
      show("Digest schedule saved");
      onClose(true);
    } catch (e: any) {
      show(e?.message || "Couldn't save schedule", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => onClose()}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="digest-schedule-modal">
          <View style={styles.head}>
            <Text style={styles.title}>Weekly digest schedule</Text>
            <Pressable testID="digest-schedule-close" onPress={() => onClose()} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          {!s ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 44 }} />
          ) : (
            <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ paddingBottom: spacing.md }}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text style={styles.label}>Send weekly digest</Text>
                  <Text style={styles.help}>Turn the automatic email on or off.</Text>
                </View>
                <Switch
                  testID="digest-enabled-switch"
                  value={s.enabled}
                  onValueChange={(v) => setS((p: any) => ({ ...p, enabled: v }))}
                  trackColor={{ true: colors.accent, false: colors.border }}
                  thumbColor="#fff"
                />
              </View>

              <Text style={styles.label}>Day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {DAYS.map((d, i) => (
                  <Pressable
                    key={d}
                    testID={`digest-day-${i}`}
                    onPress={() => setS((p: any) => ({ ...p, day_of_week: i }))}
                    style={[styles.chip, s.day_of_week === i && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, s.day_of_week === i && styles.chipTextOn]}>{d}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.label}>
                Time · {String(s.hour_utc).padStart(2, "0")}:00 UTC
                <Text style={styles.help}>  ≈ {localHint(s.hour_utc)} your time</Text>
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {Array.from({ length: 24 }).map((_, h) => (
                  <Pressable
                    key={h}
                    testID={`digest-hour-${h}`}
                    onPress={() => setS((p: any) => ({ ...p, hour_utc: h }))}
                    style={[styles.chip, s.hour_utc === h && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, s.hour_utc === h && styles.chipTextOn]}>
                      {String(h).padStart(2, "0")}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.label}>Recipients</Text>
              <View style={styles.modeRow}>
                <Pressable
                  testID="digest-mode-default"
                  onPress={() => setS((p: any) => ({ ...p, mode: "default" }))}
                  style={[styles.modeBtn, s.mode === "default" && styles.modeOn]}
                >
                  <Text style={[styles.modeText, s.mode === "default" && styles.modeTextOn]}>
                    All owners &amp; admins
                  </Text>
                </Pressable>
                <Pressable
                  testID="digest-mode-custom"
                  onPress={() => setS((p: any) => ({ ...p, mode: "custom" }))}
                  style={[styles.modeBtn, s.mode === "custom" && styles.modeOn]}
                >
                  <Text style={[styles.modeText, s.mode === "custom" && styles.modeTextOn]}>Choose people</Text>
                </Pressable>
              </View>

              {s.mode === "custom" ? (
                <View style={{ marginTop: spacing.sm }}>
                  {s.available.map((m: any) => {
                    const on = s.customIds.includes(m.id);
                    return (
                      <Pressable
                        key={m.id}
                        testID={`digest-recipient-${m.id}`}
                        onPress={() => toggleId(m.id)}
                        style={styles.recRow}
                      >
                        <Ionicons
                          name={on ? "checkbox" : "square-outline"}
                          size={20}
                          color={on ? colors.accent : colors.textMuted}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.recName}>{m.name}</Text>
                          <Text style={styles.recEmail} numberOfLines={1}>
                            {m.email} · {m.role}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </ScrollView>
          )}

          <Pressable
            testID="digest-schedule-save"
            onPress={save}
            disabled={!s || saving}
            style={[styles.saveBtn, (!s || saving) && { opacity: 0.6 }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#09090b" />
            ) : (
              <Text style={styles.saveText}>Save schedule</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    paddingBottom: spacing.xl ?? spacing.lg,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  title: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  label: { color: colors.textPrimary, fontSize: font.small, fontWeight: "700", marginTop: spacing.md, marginBottom: spacing.sm },
  help: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "500" },
  chipRow: { gap: spacing.sm, paddingRight: spacing.md },
  chip: {
    flexShrink: 0,
    height: 36,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "700" },
  chipTextOn: { color: "#09090b" },
  modeRow: { flexDirection: "row", gap: spacing.sm },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  modeOn: { backgroundColor: colors.accentDim, borderColor: colors.accentBorder },
  modeText: { color: colors.textSecondary, fontSize: font.tiny, fontWeight: "700" },
  modeTextOn: { color: colors.accent },
  recRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  recName: { color: colors.textPrimary, fontSize: font.small, fontWeight: "700" },
  recEmail: { color: colors.textMuted, fontSize: font.tiny, marginTop: 1 },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: spacing.md,
  },
  saveText: { color: "#09090b", fontSize: font.small, fontWeight: "800" },
});
