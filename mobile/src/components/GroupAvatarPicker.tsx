import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Avatar } from "@/src/components/Avatar";
import { GROUP_COLORS, groupAvatarProps } from "@/src/components/groupAvatarPresets";
import { colors, font, radius, spacing } from "@/src/theme";

export type GroupAvatarValue = {
  avatar_icon?: string | null;
  avatar_color?: string | null;
  avatar_url?: string | null;
};

/**
 * Group-avatar chooser (mobile): a preset color swatch OR an optional uploaded
 * photo. Photos are downscaled to a tiny 256px square JPEG data URL (mirrors
 * the web picker) so they ride cheaply inside chat-list payloads.
 * Controlled — `value` = { avatar_icon, avatar_color, avatar_url }.
 */
export function GroupAvatarPicker({
  value,
  name = "Group",
  onChange,
  onError,
}: {
  value: GroupAvatarValue;
  name?: string;
  onChange: (next: GroupAvatarValue) => void;
  onError?: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const activeColor = value.avatar_color || GROUP_COLORS[0];
  const set = (patch: Partial<GroupAvatarValue>) => onChange({ ...value, ...patch });

  const pickPhoto = async () => {
    try {
      // Contextual photo-library permission flow.
      let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (perm.status !== "granted" && perm.canAskAgain) {
        perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }
      if (perm.status !== "granted") {
        if (perm.canAskAgain) {
          onError?.("Photo access is needed to set a group photo.");
        } else {
          onError?.("Photo access is blocked — enable it in Settings.");
          Linking.openSettings().catch(() => {});
        }
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (res.canceled || !res.assets?.length) return;
      setBusy(true);
      const out = await ImageManipulator.manipulateAsync(
        res.assets[0].uri,
        [{ resize: { width: 256, height: 256 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (out.base64) {
        set({ avatar_url: `data:image/jpeg;base64,${out.base64}`, avatar_icon: null });
      }
    } catch (e: any) {
      onError?.(e?.message || "Could not set that photo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap} testID="group-avatar-picker">
      <View style={styles.previewRow}>
        <Avatar {...groupAvatarProps(value)} name={name} size={64} />
        <View style={styles.previewBtns}>
          <TouchableOpacity
            testID="group-avatar-upload"
            onPress={pickPhoto}
            disabled={busy}
            style={styles.btn}
            activeOpacity={0.7}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="image-outline" size={16} color={colors.textSecondary} />
            )}
            <Text style={styles.btnText}>{busy ? "Processing…" : "Upload photo"}</Text>
          </TouchableOpacity>
          {value.avatar_url || value.avatar_icon ? (
            <TouchableOpacity
              testID="group-avatar-clear"
              onPress={() => set({ avatar_url: null, avatar_icon: null, avatar_color: null })}
              style={styles.btn}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={16} color={colors.textSecondary} />
              <Text style={styles.btnText}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {!value.avatar_url ? (
        <View style={styles.swatchRow} testID="group-color-row">
          {GROUP_COLORS.map((c) => {
            const on = activeColor === c && !!value.avatar_icon;
            return (
              <TouchableOpacity
                key={c}
                testID={`group-color-${c}`}
                onPress={() => set({ avatar_color: c, avatar_icon: value.avatar_icon || "users", avatar_url: null })}
                style={[styles.swatch, { backgroundColor: c }, on && styles.swatchOn]}
                activeOpacity={0.8}
              >
                {on ? <Ionicons name="checkmark" size={16} color="#09090b" /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  previewRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  previewBtns: { flex: 1, gap: spacing.sm, alignItems: "flex-start" },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  btnText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchOn: { borderColor: colors.textPrimary },
});
