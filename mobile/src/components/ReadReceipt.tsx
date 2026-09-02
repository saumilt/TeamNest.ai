import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Avatar } from "@/src/components/Avatar";
import { colors, radius, spacing } from "@/src/theme";

type Member = { id: string; name?: string; email?: string; avatar?: string | null };
type State = { read_at?: string | null; delivered_at?: string | null };

function fmt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * ReadReceipt — WhatsApp-style delivery/read ticks for the current user's own
 * messages. Single ✓ = sent, double ✓✓ = delivered, amber double ✓✓ = read by
 * everyone. In groups the tick is tappable → a "Read by" sheet.
 */
export function ReadReceipt({
  message,
  members,
  readState,
  myId,
}: {
  message: any;
  members: Member[];
  readState: Record<string, State>;
  myId?: string;
}) {
  const [open, setOpen] = useState(false);
  const created = message?.created_at || "";
  const others = (members || []).filter((m) => m.id !== myId && !String(m.id).startsWith("ai"));
  if (others.length === 0) return null;

  const readAt = (id: string) => readState?.[id]?.read_at || "";
  const delivAt = (id: string) => readState?.[id]?.delivered_at || readState?.[id]?.read_at || "";
  const readers = others.filter((m) => readAt(m.id) && readAt(m.id) >= created);
  const delivered = others.filter((m) => delivAt(m.id) && delivAt(m.id) >= created);
  const allRead = readers.length === others.length && others.length > 0;
  const anyDelivered = delivered.length > 0;

  const isGroup = others.length > 1;
  const iconName = allRead || anyDelivered ? "checkmark-done" : "checkmark";
  const color = allRead ? colors.accent : colors.textMuted;
  const state = allRead ? "read" : anyDelivered ? "delivered" : "sent";

  const tick = (
    <Ionicons name={iconName as any} size={14} color={color} testID={`receipt-${message.id}`} accessibilityLabel={state} />
  );

  if (!isGroup) return tick;

  const deliveredNotRead = delivered.filter((m) => !(readAt(m.id) && readAt(m.id) >= created));
  const notDelivered = others.filter((m) => !(delivAt(m.id) && delivAt(m.id) >= created));

  return (
    <>
      <TouchableOpacity testID={`receipt-btn-${message.id}`} onPress={() => setOpen(true)} hitSlop={8}>
        {tick}
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} testID={`read-by-${message.id}`}>
            <Text style={styles.title}>Message info</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <Section title={`Read · ${readers.length}`} people={readers} readState={readState} kind="read" amber />
              <Section title={`Delivered · ${deliveredNotRead.length}`} people={deliveredNotRead} readState={readState} kind="delivered" />
              <Section title={`Sent · ${notDelivered.length}`} people={notDelivered} />
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Section({
  title,
  people,
  readState,
  kind,
  amber,
}: {
  title: string;
  people: Member[];
  readState?: Record<string, State>;
  kind?: "read" | "delivered";
  amber?: boolean;
}) {
  if (!people || people.length === 0) return null;
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[styles.sectionTitle, amber && { color: colors.accent }]}>{title}</Text>
      {people.map((m) => (
        <View key={m.id} style={styles.personRow} testID={`read-by-person-${m.id}`}>
          <Avatar name={m.name || "?"} src={m.avatar} size={28} />
          <Text style={styles.personName} numberOfLines={1}>
            {m.name || m.email || "Member"}
          </Text>
          {kind && readState && (
            <Text style={styles.personTime}>
              {fmt(kind === "read" ? readState[m.id]?.read_at : readState[m.id]?.delivered_at)}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginBottom: spacing.md },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  personRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  personName: { color: colors.textPrimary, fontSize: 14, flex: 1 },
  personTime: { color: colors.textMuted, fontSize: 11 },
  closeBtn: { marginTop: spacing.sm, alignSelf: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.xl },
  closeText: { color: colors.accent, fontSize: 14, fontWeight: "700" },
});
