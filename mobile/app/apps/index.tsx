import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { apiGet, apiPost, getBase } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, font, radius, spacing } from "@/src/theme";

const CAT_ICON: Record<string, any> = {
  Email: "mail",
  CRM: "business",
  Chat: "chatbubbles",
  Files: "folder-open",
  Automation: "flash",
};

export default function AppsScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const isAdmin = ["owner", "admin"].includes(user?.role);
  const [apps, setApps] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [loading, setLoading] = useState(true);
  const [zapOpen, setZapOpen] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    apiGet("/api/apps")
      .then((d) => { setApps(d.apps || []); setCategories(d.categories || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    load();
  }, [token, load]);

  const say = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 2600); };

  const connect = async (app: any) => {
    if (app.key === "zapier") { setZapOpen(true); return; }
    if (app.connected) { router.push("/team"); return; }
    say(`${app.name} connects on the web app for now`);
  };

  const filtered = apps.filter((a) => {
    if (cat !== "All" && a.category !== cat) return false;
    if (q.trim()) {
      const ql = q.toLowerCase();
      return a.name.toLowerCase().includes(ql) || a.description.toLowerCase().includes(ql);
    }
    return true;
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="apps-back" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Apps</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} testID="mobile-apps">
        <Text style={styles.sub}>Connect the tools your team uses. TeamNest asks in plain English what it can read and act on.</Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            testID="apps-search"
            value={q}
            onChangeText={setQ}
            placeholder="Search apps…"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ marginBottom: spacing.md }}>
          {["All", ...categories].map((c) => (
            <Pressable key={c} testID={`apps-cat-${c.toLowerCase()}`} onPress={() => setCat(c)} style={[styles.chip, cat === c && styles.chipActive]}>
              <Text style={[styles.chipText, cat === c && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <Text style={styles.empty} testID="apps-empty">No apps match that search.</Text>
        ) : (
          filtered.map((app) => (
            <View key={app.key} style={styles.card} testID={`app-${app.key}`}>
              <View style={styles.cardHead}>
                <Ionicons name={CAT_ICON[app.category] || "cube"} size={16} color={colors.accent} />
                <Text style={styles.cardName}>{app.name}</Text>
                <View style={[styles.kind, app.kind === "partner" && styles.kindPartner]}>
                  <Text style={[styles.kindText, app.kind === "partner" && styles.kindTextPartner]}>{app.kind}</Text>
                </View>
                {app.connected ? <Ionicons name="checkmark-circle" size={16} color={colors.success} style={{ marginLeft: "auto" }} /> : null}
              </View>
              <Text style={styles.cardDesc}>{app.description}</Text>
              <View style={styles.permRow}>
                {app.permissions.map((p: any, i: number) => (
                  <View key={i} style={[styles.perm, p.type === "act" ? styles.permAct : styles.permRead]} testID={`perm-${p.type}`}>
                    <Ionicons name={p.type === "act" ? "create-outline" : "eye-outline"} size={11} color={p.type === "act" ? "#f59e0b" : "#38bdf8"} />
                    <Text style={[styles.permText, { color: p.type === "act" ? "#f59e0b" : "#38bdf8" }]}>{p.type === "act" ? "Act" : "Read"}</Text>
                  </View>
                ))}
              </View>
              {app.connected ? (
                <Pressable testID={`app-manage-${app.key}`} style={styles.secondaryBtn} onPress={() => connect(app)}>
                  <Text style={styles.secondaryText}>Manage</Text>
                </Pressable>
              ) : app.live ? (
                <Pressable testID={`app-connect-${app.key}`} style={styles.primaryBtn} onPress={() => connect(app)}>
                  <Ionicons name="link" size={14} color="#09090b" />
                  <Text style={styles.primaryText}>Connect</Text>
                </Pressable>
              ) : (
                <View style={styles.disabledBtn} testID={`app-connect-${app.key}`}>
                  <Text style={styles.disabledText}>Coming soon</Text>
                </View>
              )}
            </View>
          ))
        )}

        {msg ? <Text style={styles.flash} testID="apps-flash">{msg}</Text> : null}
      </ScrollView>

      {zapOpen ? <ZapierSheet isAdmin={isAdmin} onClose={() => { setZapOpen(false); load(); }} say={say} /> : null}
    </View>
  );
}

function ZapierSheet({ isAdmin, onClose, say }: { isAdmin: boolean; onClose: () => void; say: (t: string) => void }) {
  const [conn, setConn] = useState<any>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    apiGet("/api/apps/zapier").then((d) => { setConn(d); setUrl(d.outbound_url || ""); }).catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const save = async () => {
    setBusy(true);
    try {
      const d = await apiPost("/api/apps/zapier/connect", { catch_hook_url: url || null });
      setConn(d);
      say("Zapier connected");
    } catch (e: any) {
      say(e?.message || "Couldn't connect");
    } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    try { await apiPost("/api/apps/zapier/test", {}); say("Test event sent"); refresh(); }
    catch (e: any) { say(e?.message || "Test failed"); } finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true);
    try { await apiPost("/api/apps/zapier/disconnect", {}); say("Disconnected"); onClose(); }
    catch { say("Failed"); } finally { setBusy(false); }
  };

  const inboundAbs = conn?.inbound_path ? `${getBase()}${conn.inbound_path}` : "";

  return (
    <View style={styles.sheetOverlay} testID="zapier-sheet">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>⚡ Zapier</Text>
          <Pressable testID="zapier-close" onPress={onClose} hitSlop={10}><Ionicons name="close" size={20} color={colors.textMuted} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Text style={styles.sheetBody}>Connect TeamNest to 6,000+ apps — no API keys, just a Zapier account. (“Webhooks by Zapier” is a Zapier premium app on Starter+.)</Text>
          {!isAdmin ? <Text style={styles.adminWarn}>Only an owner or admin can connect Zapier.</Text> : null}

          <Text style={styles.permLabel}>ACT — SEND EVENTS OUT</Text>
          <Text style={styles.hint}>In Zapier, make a Zap with a “Webhooks by Zapier → Catch Hook” trigger, copy its URL, and paste it here.</Text>
          <TextInput
            testID="zapier-catch-url"
            value={url}
            onChangeText={setUrl}
            editable={isAdmin}
            autoCapitalize="none"
            placeholder="https://hooks.zapier.com/hooks/catch/…"
            placeholderTextColor={colors.textMuted}
            style={styles.sheetInput}
          />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pressable testID="zapier-save" style={[styles.primaryBtn, (!isAdmin || busy) && styles.disabled]} onPress={save} disabled={!isAdmin || busy}>
              <Text style={styles.primaryText}>{conn?.connected ? "Update" : "Connect"}</Text>
            </Pressable>
            {conn?.has_outbound ? (
              <Pressable testID="zapier-test" style={styles.secondaryBtn} onPress={test} disabled={busy}>
                <Text style={styles.secondaryText}>Send test</Text>
              </Pressable>
            ) : null}
          </View>

          {conn?.connected && conn?.inbound_path ? (
            <>
              <Text style={styles.permLabel}>READ — RECEIVE EVENTS IN</Text>
              <Text style={styles.hint}>In Zapier, add a “Webhooks by Zapier → POST” action pointing at this URL. Messages land in your AI Assistant chat.</Text>
              <Pressable
                testID="zapier-copy-inbound"
                style={styles.copyRow}
                onPress={async () => { await Clipboard.setStringAsync(inboundAbs); say("Copied"); }}
              >
                <Text style={styles.copyText} numberOfLines={1} testID="zapier-inbound-url">{inboundAbs}</Text>
                <Ionicons name="copy-outline" size={15} color={colors.textSecondary} />
              </Pressable>
            </>
          ) : null}

          {conn?.connected ? (
            <View style={styles.statsRow} testID="zapier-stats">
              <Text style={styles.statsText}>Connected · {conn.events_sent} sent · {conn.events_received} received</Text>
              {isAdmin ? <Pressable testID="zapier-disconnect" onPress={disconnect} disabled={busy}><Text style={styles.disconnectText}>Disconnect</Text></Pressable> : null}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  headerTitle: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: font.body, marginBottom: spacing.md },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bgElevated,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.md,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: font.body, paddingVertical: spacing.md },
  chipRow: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: { flexShrink: 0, height: 34, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "700" },
  chipTextActive: { color: "#09090b" },
  empty: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.xl, textAlign: "center" },
  card: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardName: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800" },
  kind: { borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  kindPartner: { borderColor: "rgba(232,121,249,0.4)", backgroundColor: "rgba(232,121,249,0.12)" },
  kindText: { color: colors.textMuted, fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  kindTextPartner: { color: "#e879f9" },
  cardDesc: { color: colors.textMuted, fontSize: font.small, marginTop: 4 },
  permRow: { flexDirection: "row", gap: 6, marginTop: spacing.sm, flexWrap: "wrap" },
  perm: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  permRead: { borderColor: "rgba(56,189,248,0.3)", backgroundColor: "rgba(56,189,248,0.1)" },
  permAct: { borderColor: "rgba(245,158,11,0.3)", backgroundColor: "rgba(245,158,11,0.1)" },
  permText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.md, alignSelf: "flex-start" },
  primaryText: { color: "#09090b", fontWeight: "800", fontSize: font.small },
  secondaryBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.md, alignSelf: "flex-start" },
  secondaryText: { color: colors.textSecondary, fontWeight: "700", fontSize: font.small },
  disabledBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.md, alignSelf: "flex-start", opacity: 0.5 },
  disabledText: { color: colors.textMuted, fontWeight: "700", fontSize: font.small },
  disabled: { opacity: 0.5 },
  flash: { color: colors.textSecondary, fontSize: font.small, marginTop: spacing.md, textAlign: "center" },
  // sheet
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "85%", borderWidth: 1, borderColor: colors.border },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  sheetTitle: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  sheetBody: { color: colors.textMuted, fontSize: font.small },
  adminWarn: { color: "#f59e0b", fontSize: font.tiny, backgroundColor: "rgba(245,158,11,0.1)", borderRadius: radius.sm, padding: spacing.sm },
  permLabel: { color: colors.textSecondary, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1, marginTop: spacing.sm },
  hint: { color: colors.textMuted, fontSize: font.tiny },
  sheetInput: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.md, color: colors.textPrimary, fontSize: font.small },
  copyRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.md },
  copyText: { flex: 1, color: colors.textSecondary, fontSize: font.tiny },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  statsText: { color: colors.textMuted, fontSize: font.tiny },
  disconnectText: { color: colors.danger, fontSize: font.tiny, fontWeight: "700" },
});
