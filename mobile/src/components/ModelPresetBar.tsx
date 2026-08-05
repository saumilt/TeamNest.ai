import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { apiDelete, apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

type Preset = {
  id: string;
  name: string;
  models: string[];
  is_default?: boolean;
  created_by?: string | null;
};

/**
 * Workspace-shared AI model presets ("Deep dive = Opus + Sonnet"). Tap to apply
 * a combo; owners/admins/members can save the current selection as a preset.
 */
export function ModelPresetBar({
  selected,
  onApply,
}: {
  selected: string[];
  onApply: (models: string[]) => void;
}) {
  const { user } = useAuth();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const canManage = ["owner", "admin", "member"].includes((user as any)?.role);

  const load = () =>
    apiGet("/api/workspace/model-presets").then(setPresets).catch(() => {});
  useEffect(() => { load(); }, []);

  const isActive = (p: Preset) =>
    p.models.length === selected.length && p.models.every((m) => selected.includes(m));

  const save = async () => {
    const n = name.trim();
    if (!n || saving) return;
    setSaving(true);
    try {
      await apiPost("/api/workspace/model-presets", { name: n, models: selected });
      setName(""); setShowSave(false); load();
    } catch {
      /* surfaced via disabled state; keep the picker uncluttered */
    } finally { setSaving(false); }
  };

  const del = async (p: Preset) => {
    try { await apiDelete(`/api/workspace/model-presets/${p.id}`); load(); } catch { /* noop */ }
  };

  if (!presets.length && !canManage) return null;

  return (
    <View style={styles.wrap} testID="model-preset-bar">
      <View style={styles.head}>
        <Ionicons name="bookmark-outline" size={12} color={colors.textMuted} />
        <Text style={styles.headText}>PRESETS</Text>
      </View>
      <View style={styles.row}>
        {presets.map((p) => {
          const active = isActive(p);
          return (
            <View key={p.id} style={[styles.chip, active && styles.chipActive]}>
              <TouchableOpacity
                testID={`model-preset-${p.id}`}
                onPress={() => onApply(p.models)}
                style={styles.chipMain}
                activeOpacity={0.8}
              >
                {active && <Ionicons name="checkmark" size={12} color={colors.accent} />}
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.name}</Text>
                <Text style={styles.chipCount}>· {p.models.length}</Text>
              </TouchableOpacity>
              {canManage && (
                <TouchableOpacity
                  testID={`model-preset-delete-${p.id}`}
                  onPress={() => del(p)}
                  style={styles.chipDel}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                >
                  <Ionicons name="close" size={12} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        {canManage && !showSave && (
          <TouchableOpacity
            testID="model-preset-save-open"
            onPress={() => setShowSave(true)}
            disabled={!selected.length}
            style={[styles.saveChip, !selected.length && { opacity: 0.4 }]}
          >
            <Ionicons name="add" size={13} color={colors.textSecondary} />
            <Text style={styles.saveChipText}>Save</Text>
          </TouchableOpacity>
        )}
        {canManage && showSave && (
          <View style={styles.saveRow}>
            <TextInput
              testID="model-preset-name-input"
              value={name}
              onChangeText={setName}
              placeholder="Preset name"
              placeholderTextColor={colors.textMuted}
              maxLength={40}
              autoFocus
              style={styles.input}
              onSubmitEditing={save}
            />
            <TouchableOpacity
              testID="model-preset-save-confirm"
              onPress={save}
              disabled={saving || !name.trim()}
              style={[styles.saveBtn, (saving || !name.trim()) && { opacity: 0.4 }]}
            >
              {saving ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  head: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  headText: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
  chipActive: { borderColor: colors.accentBorder, backgroundColor: colors.accentDim },
  chipMain: { flexDirection: "row", alignItems: "center", gap: 3, paddingLeft: 10, paddingRight: 6, paddingVertical: 6 },
  chipText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  chipTextActive: { color: colors.accent },
  chipCount: { color: colors.textMuted, fontSize: font.tiny },
  chipDel: { paddingRight: 8, paddingLeft: 2, paddingVertical: 6 },
  saveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  saveChipText: { color: colors.textSecondary, fontSize: font.small },
  saveRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  input: {
    minWidth: 110,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    color: colors.textPrimary,
    fontSize: font.small,
    backgroundColor: colors.bg,
  },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  saveBtnText: { color: "#000", fontWeight: "800", fontSize: font.small },
});
