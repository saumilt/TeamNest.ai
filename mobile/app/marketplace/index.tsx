import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "@/src/api";
import { iapConsumablesAvailable, purchaseConsumableIap } from "@/src/lib/iap";
import { colors, font, radius, spacing } from "@/src/theme";

const TABS = [{ id: "browse", label: "Browse" }, { id: "mine", label: "My listings" }, { id: "installed", label: "Installed" }];

export default function Marketplace() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState("browse");
  const [detailId, setDetailId] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg }}>
        <View style={styles.headerRow}>
          <TouchableOpacity testID="mb-mkt-back" onPress={() => router.back()} style={{ padding: 4 }}>
            <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Marketplace</Text>
            <Text style={styles.sub}>Discover & install AI employees.</Text>
          </View>
        </View>
        <View style={styles.tabRow}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.id} testID={`mb-mkt-tab-${t.id}`} onPress={() => setTab(t.id)} style={[styles.tab, tab === t.id && styles.tabOn]}>
              <Text style={[styles.tabText, tab === t.id && styles.tabTextOn]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {tab === "browse" && <Browse onOpen={setDetailId} />}
      {tab === "mine" && <Mine />}
      {tab === "installed" && <Installed />}

      {detailId && <ListingModal id={detailId} onClose={() => setDetailId(null)} />}
    </View>
  );
}

function Browse({ onOpen }: any) {
  const [listings, setListings] = useState<any[] | null>(null);
  const [cats, setCats] = useState<string[]>(["All"]);
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const load = () => {
    let path = "/api/ai-builder/marketplace";
    const params: string[] = [];
    if (cat !== "All") params.push(`category=${encodeURIComponent(cat)}`);
    if (q) params.push(`q=${encodeURIComponent(q)}`);
    if (params.length) path += `?${params.join("&")}`;
    apiGet(path).then((d) => setListings(d.listings)).catch(() => setListings([]));
  };
  useEffect(() => { apiGet("/api/ai-builder/marketplace/categories").then((d) => setCats(["All", ...d.categories])).catch(() => {}); }, []);
  useEffect(load, [cat]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput testID="mb-mkt-search" value={q} onChangeText={setQ} onSubmitEditing={load} placeholder="Search…" placeholderTextColor={colors.textMuted} style={styles.searchInput} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.md }} contentContainerStyle={{ gap: spacing.xs }}>
        {cats.map((c) => (
          <TouchableOpacity key={c} testID={`mb-mkt-cat-${c}`} onPress={() => setCat(c)} style={[styles.chip, cat === c && styles.chipOn]}>
            <Text style={[styles.chipText, cat === c && styles.chipTextOn]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {listings === null ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : listings.length === 0 ? (
        <Text style={styles.empty}>No listings yet.</Text>
      ) : listings.map((l) => (
        <TouchableOpacity key={l.id} testID={`mb-mkt-listing-${l.id}`} onPress={() => onOpen(l.id)} style={styles.listingCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listingTitle}>{l.title}{l.installed ? "  ✓" : ""}</Text>
            <Text style={styles.listingTag} numberOfLines={1}>{l.tagline || l.description}</Text>
            <View style={styles.listingMeta}>
              <View style={styles.catPill}><Text style={styles.catPillText}>{l.category}</Text></View>
              <Ionicons name="download-outline" size={12} color={colors.textMuted} /><Text style={styles.metaText}>{l.install_count || 0}</Text>
              <Text style={styles.price}>{l.price_usd > 0 ? `$${l.price_usd}` : "Free"}</Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function Mine() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { apiGet("/api/ai-builder/marketplace/mine").then(setData).catch(() => setData({ listings: [], summary: {} })); }, []);
  if (!data) return <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />;
  const s = data.summary || {};
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
      <View style={styles.statsRow}>
        {[["Listings", s.total_listings || 0], ["Installs", s.total_installs || 0], ["Revenue", `$${s.total_revenue_usd || 0}`]].map(([l, v]) => (
          <View key={l as string} style={styles.statCard} testID={`mb-mkt-stat-${l}`}><Text style={styles.statVal}>{v as any}</Text><Text style={styles.statLabel}>{l as string}</Text></View>
        ))}
      </View>
      {data.listings.length === 0 ? (
        <Text style={styles.empty}>No listings yet. Publish from an employee's Deploy section.</Text>
      ) : data.listings.map((l: any) => (
        <View key={l.id} style={styles.listingCard} testID={`mb-mkt-mine-${l.id}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listingTitle}>{l.title}</Text>
            <Text style={styles.listingTag}>{l.category} · {l.price_usd > 0 ? `$${l.price_usd}` : "Free"} · {l.install_count || 0} installs</Text>
          </View>
          <View style={[styles.catPill, l.status === "Published" && { backgroundColor: "rgba(74,222,128,0.15)" }]}><Text style={styles.catPillText}>{l.status}</Text></View>
        </View>
      ))}
    </ScrollView>
  );
}

function Installed() {
  const [installs, setInstalls] = useState<any[] | null>(null);
  useEffect(() => { apiGet("/api/ai-builder/marketplace/installs").then((d) => setInstalls(d.installs)).catch(() => setInstalls([])); }, []);
  if (installs === null) return <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />;
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
      {installs.length === 0 ? <Text style={styles.empty}>No installed AI employees yet.</Text> : installs.map((i) => (
        <TouchableOpacity key={i.id} testID={`mb-mkt-install-${i.id}`} onPress={() => router.push(`/builder/${i.installed_employee_id}`)} style={styles.listingCard}>
          <Ionicons name="cube-outline" size={18} color={colors.accent} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.listingTitle}>{i.listing_title}</Text>
            <Text style={styles.listingTag}>Installed · {i.price_paid > 0 ? `$${i.price_paid}` : "Free"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function ListingModal({ id, onClose }: any) {
  const [l, setL] = useState<any>(null);
  const [installing, setInstalling] = useState(false);
  useEffect(() => { apiGet(`/api/ai-builder/marketplace/${id}`).then(setL).catch(() => { onClose(); }); }, [id]);
  const install = async () => {
    setInstalling(true);
    try {
      const paid = (l?.price_usd || 0) > 0;
      // Paid listings on a native build must be bought via App Store IAP
      // (pending-order pattern). Free listings — and the web preview — install
      // directly through the backend.
      if (paid && iapConsumablesAvailable()) {
        const r = await purchaseConsumableIap("marketplace_install", id);
        onClose();
        if (r.fulfilled && r.result?.employee_id) {
          router.push(`/builder/${r.result.employee_id}`);
        } else {
          router.push("/marketplace");
        }
      } else {
        const d = await apiPost(`/api/ai-builder/marketplace/${id}/install`);
        onClose();
        router.push(`/builder/${d.employee_id}`);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
      setInstalling(false);
    }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderText}>Listing</Text>
            <TouchableOpacity testID="mb-mkt-modal-close" onPress={onClose}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
          </View>
          {!l ? <ActivityIndicator color={colors.accent} style={{ margin: spacing.xl }} /> : (
            <>
              <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={[styles.h1, { flex: 1, fontSize: font.h2 }]}>{l.title}</Text>
                  <Text style={styles.price}>{l.price_usd > 0 ? `$${l.price_usd}` : "Free"}</Text>
                </View>
                {l.tagline ? <Text style={styles.sub}>{l.tagline}</Text> : null}
                {l.description ? <Text style={styles.desc}>{l.description}</Text> : null}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>What you get</Text>
                  <Text style={styles.wgt}>Permission: {l.preview?.permission_level || "—"}</Text>
                  {l.preview?.tools?.length ? <Text style={styles.wgt}>Tools: {l.preview.tools.join(", ")}</Text> : null}
                  {l.preview?.escalation_count ? <Text style={styles.wgt}>{l.preview.escalation_count} escalation rule(s)</Text> : null}
                  {l.preview?.has_style_profile ? <Text style={styles.wgt}>Trained voice / style profile</Text> : null}
                  <Text style={styles.wgt}>{l.preview?.shares_knowledge ? `Includes ${l.preview.document_count} doc(s) + ${l.preview.example_count} example(s)` : "Profile & settings only"}</Text>
                </View>
              </ScrollView>
              <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}>
                {l.installed ? (
                  <View style={styles.installedTag}><Ionicons name="checkmark-circle" size={16} color={colors.success} /><Text style={{ color: colors.success, fontWeight: "700" }}>Installed</Text></View>
                ) : l.is_mine ? (
                  <Text style={{ color: colors.textMuted, textAlign: "center" }}>This is your own listing.</Text>
                ) : (
                  <TouchableOpacity testID="mb-mkt-install-btn" onPress={install} disabled={installing} style={[styles.installBtn, installing && { opacity: 0.5 }]}>
                    {installing ? <ActivityIndicator color="#09090b" size="small" /> : <Text style={styles.installText}>{l.price_usd > 0 ? `Install · $${l.price_usd}` : "Install for free"}</Text>}
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  h1: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800" },
  sub: { color: colors.textSecondary, fontSize: font.small, marginTop: 2 },
  desc: { color: colors.textPrimary, fontSize: font.small, lineHeight: 20 },
  tabRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.md, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: "center" },
  tabOn: { backgroundColor: colors.accent },
  tabText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "700" },
  tabTextOn: { color: "#09090b" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.bgElevated, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: font.body, paddingVertical: 10 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  chipTextOn: { color: "#09090b" },
  empty: { color: colors.textMuted, fontSize: font.small, textAlign: "center", marginTop: spacing.xl },
  listingCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.sm },
  listingTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  listingTag: { color: colors.textSecondary, fontSize: font.small, marginTop: 2 },
  listingMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  catPill: { backgroundColor: colors.surfaceHover, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  catPillText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
  metaText: { color: colors.textMuted, fontSize: font.tiny },
  price: { color: colors.accent, fontSize: font.small, fontWeight: "800", marginLeft: "auto" },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  statCard: { flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  statVal: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  statLabel: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "88%", borderWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalHeaderText: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700" },
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4 },
  cardTitle: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  wgt: { color: colors.textPrimary, fontSize: font.small },
  installBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center" },
  installText: { color: "#09090b", fontWeight: "800", fontSize: font.body },
  installedTag: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
});
