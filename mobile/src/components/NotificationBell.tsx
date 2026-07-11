import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { apiGet } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors } from "@/src/theme";

/**
 * NotificationBell — header icon showing the unread notification count.
 * Refreshes the unread count whenever the hosting screen regains focus and
 * routes to the full notifications feed on press.
 */
export function NotificationBell() {
  const { token } = useAuth();
  const [unread, setUnread] = useState(0);

  const load = useCallback(() => {
    apiGet("/api/notifications")
      .then((d) => setUnread(d.unread_count || 0))
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (token) load();
    }, [token, load]),
  );

  return (
    <TouchableOpacity
      testID="notif-bell"
      activeOpacity={0.7}
      onPress={() => router.push("/notifications")}
      style={styles.btn}
    >
      <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
      {unread > 0 && (
        <View style={styles.badge} testID="notif-bell-badge">
          <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
});
