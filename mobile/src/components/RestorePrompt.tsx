import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import {
  IAP_SUPPORTED,
  getCustomerInfo,
  iapAvailable,
  restorePurchases,
} from "@/src/lib/revenuecat";
import { getItem, setItem } from "@/src/storage";
import { colors, font, radius, spacing } from "@/src/theme";

const SEEN_KEY = "tn_restore_prompt_seen";

// First-launch one-tap nudge for returning users: if they have no active
// entitlement on this device (e.g. reinstalled, new device), offer to restore
// their App Store purchase. Native-only (no-op in Expo Go / web preview).
export function RestorePrompt() {
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!IAP_SUPPORTED || !iapAvailable() || !user?.id || !token) return;
    let active = true;
    (async () => {
      const seen = await getItem(SEEN_KEY);
      if (seen) return;
      const info = await getCustomerInfo().catch(() => null);
      const activeEnts = info?.entitlements?.active || {};
      const hasActive = Object.keys(activeEnts).length > 0;
      if (active && !hasActive) setShow(true);
    })();
    return () => {
      active = false;
    };
  }, [user?.id, token]);

  const dismiss = async () => {
    await setItem(SEEN_KEY, "1");
    setShow(false);
  };

  const restore = async () => {
    setBusy(true);
    try {
      await restorePurchases();
      await apiPost("/api/billing/iap/sync", {}).catch(() => {});
    } catch {
      /* nothing to restore — silently dismiss */
    }
    await setItem(SEEN_KEY, "1");
    setBusy(false);
    setShow(false);
  };

  if (!show) return null;
  return (
    <View
      testID="restore-prompt"
      style={[styles.wrap, { paddingBottom: insets.bottom + spacing.md }]}
    >
      <View style={styles.card}>
        <View style={styles.top}>
          <Ionicons name="refresh-circle" size={24} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Already subscribed?</Text>
            <Text style={styles.sub}>Restore your purchase to unlock your plan on this device.</Text>
          </View>
        </View>
        <View style={styles.row}>
          <TouchableOpacity testID="restore-prompt-dismiss" onPress={dismiss} style={styles.ghostBtn}>
            <Text style={styles.ghostText}>Not now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="restore-prompt-restore"
            onPress={restore}
            disabled={busy}
            style={styles.primaryBtn}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#09090b" />
            ) : (
              <Text style={styles.primaryText}>Restore</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    padding: spacing.md,
    gap: spacing.md,
  },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800" },
  sub: { color: colors.textSecondary, fontSize: font.small, marginTop: 2 },
  row: { flexDirection: "row", gap: spacing.sm },
  ghostBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghostText: { color: colors.textSecondary, fontWeight: "700", fontSize: font.small },
  primaryBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  primaryText: { color: "#09090b", fontWeight: "800", fontSize: font.small },
});
