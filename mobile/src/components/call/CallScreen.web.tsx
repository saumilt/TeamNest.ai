// WEB placeholder for the call screen. The Expo web preview (Metro web) resolves
// this file instead of CallScreen.tsx, so @livekit/react-native (native WebRTC)
// is never bundled for web and the preview keeps building. Real calling happens
// in the native iOS/Android build produced by Emergent Publish.
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, font, radius, spacing } from "@/src/theme";

export type CallScreenProps = {
  url: string;
  token: string;
  mode: "audio" | "video";
  title?: string;
  onLeave: () => void;
};

export default function CallScreen({ title, onLeave }: CallScreenProps) {
  return (
    <View style={styles.container} testID="call-screen-web-placeholder">
      <View style={styles.icon}>
        <Ionicons name="videocam-outline" size={36} color={colors.accent} />
      </View>
      <Text style={styles.title}>{title || "TeamNest call"}</Text>
      <Text style={styles.body}>
        Live audio, video &amp; screen-share calls run in the TeamNest iOS/Android
        app. The web preview shows this placeholder — build the app via Publish to
        make a real call.
      </Text>
      <TouchableOpacity testID="call-leave-btn" onPress={onLeave} style={styles.leaveBtn}>
        <Ionicons name="close" size={18} color="#fff" />
        <Text style={styles.leaveText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  icon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accentDim, alignItems: "center", justifyContent: "center" },
  title: { color: colors.textPrimary, fontSize: font.h2, fontWeight: "800" },
  body: { color: colors.textSecondary, fontSize: font.body, textAlign: "center", lineHeight: 22, maxWidth: 420 },
  leaveBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.danger, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: 12, marginTop: spacing.md },
  leaveText: { color: "#fff", fontWeight: "800", fontSize: font.body },
});
