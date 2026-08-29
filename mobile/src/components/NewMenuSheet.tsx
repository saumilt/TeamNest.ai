import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing } from "@/src/theme";

export type NewOption = {
  key: string;
  label: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

/** Global "+ New" bottom sheet — "What do you want to create?".
 *  Each option deep-links into an existing mobile flow. */
export function NewMenuSheet({
  visible,
  onClose,
  options,
}: {
  visible: boolean;
  onClose: () => void;
  options: NewOption[];
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} testID="new-menu-overlay">
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
          onPress={(e) => e.stopPropagation()}
          testID="new-menu-sheet"
        >
          <View style={styles.grip} />
          <Text style={styles.title}>What do you want to create?</Text>
          {options.map((o) => (
            <Pressable
              key={o.key}
              testID={`new-opt-${o.key}`}
              style={styles.row}
              onPress={() => {
                onClose();
                o.onPress();
              }}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={o.icon} size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowLabel}>{o.label}</Text>
                <Text style={styles.rowDesc} numberOfLines={1}>{o.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  grip: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  title: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  iconWrap: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accentDim, alignItems: "center", justifyContent: "center" },
  rowLabel: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  rowDesc: { color: colors.textMuted, fontSize: font.small, marginTop: 1 },
});
