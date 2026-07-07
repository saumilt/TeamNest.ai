import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/src/components/Avatar";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

export default function YouScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  const activeWs =
    (user?.workspaces || []).find((w: any) => w.id === user?.workspace_id) ||
    (user?.workspaces || [])[0];

  const doLogout = async () => {
    setBusy(true);
    await logout();
    router.replace("/(auth)/login");
  };

  const Row = ({ icon, label, value }: { icon: any; label: string; value?: string }) => (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value || "—"}
      </Text>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: 60 }}
    >
      <Text style={styles.h1}>You</Text>

      <View style={styles.profileCard}>
        <Avatar name={user?.name} size={72} />
        <Text style={styles.name}>{user?.name || "TeamNest user"}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        {user?.role ? (
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user.role}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Row icon="business-outline" label="Workspace" value={activeWs?.name} />
        <View style={styles.divider} />
        <Row icon="mail-outline" label="Email" value={user?.email} />
        <View style={styles.divider} />
        <Row
          icon="people-outline"
          label="Workspaces"
          value={String((user?.workspaces || []).length)}
        />
        {user?.pro_boost_active ? (
          <>
            <View style={styles.divider} />
            <Row icon="flash-outline" label="Pro boost" value="Active ⚡" />
          </>
        ) : null}
      </View>

      <TouchableOpacity
        testID="logout-btn"
        onPress={doLogout}
        disabled={busy}
        style={styles.logoutBtn}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={styles.logoutText}>Sign out</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>TeamNest.ai · mobile</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800", marginBottom: spacing.lg },
  profileCard: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  name: { color: colors.textPrimary, fontSize: font.h2, fontWeight: "800", marginTop: spacing.sm },
  email: { color: colors.textSecondary, fontSize: font.body },
  roleBadge: {
    marginTop: spacing.xs,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  roleText: { color: colors.accent, fontSize: font.tiny, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  card: {
    marginTop: spacing.lg,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  infoLabel: { color: colors.textSecondary, fontSize: font.body, flex: 1 },
  infoValue: { color: colors.textPrimary, fontSize: font.body, fontWeight: "600", maxWidth: "50%" },
  divider: { height: 1, backgroundColor: colors.borderSubtle },
  logoutBtn: {
    marginTop: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 15,
  },
  logoutText: { color: colors.danger, fontSize: font.body, fontWeight: "700" },
  footer: { color: colors.textMuted, fontSize: font.tiny, textAlign: "center", marginTop: spacing.xl },
});
