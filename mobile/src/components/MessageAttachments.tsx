import { Ionicons } from "@expo/vector-icons";
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { fileUrl } from "../api";
import { colors, font, radius, spacing } from "../theme";

type Att = { id?: string; file_id?: string; filename?: string; is_image?: boolean; content_type?: string };

function iconFor(name?: string, ct?: string) {
  const ext = (name || "").split(".").pop()?.toLowerCase() || "";
  if (["pdf"].includes(ext)) return "document-text";
  if (["xlsx", "xls", "csv"].includes(ext)) return "grid";
  if (["docx", "doc"].includes(ext)) return "document";
  if (["pptx", "ppt"].includes(ext)) return "easel";
  if (ct?.startsWith("image/")) return "image";
  return "attach";
}

// Renders a message's attachments: image thumbnails + tappable file chips.
export function MessageAttachments({ attachments }: { attachments?: Att[] }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {attachments.map((a, i) => {
        const id = a.id || a.file_id || "";
        if (a.is_image || a.content_type?.startsWith("image/")) {
          return (
            <Image
              key={id || i}
              testID={`attachment-image-${id}`}
              source={{ uri: fileUrl(id) }}
              style={styles.thumb}
              resizeMode="cover"
            />
          );
        }
        return (
          <TouchableOpacity
            key={id || i}
            testID={`attachment-file-${id}`}
            style={styles.chip}
            onPress={() => id && Linking.openURL(fileUrl(id)).catch(() => {})}
          >
            <Ionicons name={iconFor(a.filename, a.content_type) as any} size={16} color={colors.accent} />
            <Text style={styles.chipText} numberOfLines={1}>
              {a.filename || "file"}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.sm },
  thumb: { width: 180, height: 130, borderRadius: radius.md, backgroundColor: colors.surfaceHover },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: 240,
  },
  chipText: { color: colors.textPrimary, fontSize: font.small, fontWeight: "600", flexShrink: 1 },
});
