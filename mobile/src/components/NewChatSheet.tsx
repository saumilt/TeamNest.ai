import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import * as Crypto from "expo-crypto";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "@/src/api";
import { Avatar } from "@/src/components/Avatar";
import { GroupAvatarPicker, GroupAvatarValue } from "@/src/components/GroupAvatarPicker";
import { colors, font, radius, spacing } from "@/src/theme";

type Member = { id: string; name: string; email?: string; phone?: string; avatar?: string | null };
type Match = { user_id: string; name: string; avatar?: string | null; phone?: string };

const APP_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

// Privacy-preserving contact matching — mirrors web/lib/contactsHash.js + the
// backend so hashes line up. The server only ever sees SHA-256 hashes.
const HASH_PEPPER = "teamnest.v1.contact-match";
function normalizePhone(raw?: string): string {
  let s = String(raw || "").replace(/[^\d+]/g, "");
  if (!s) return "";
  if (!s.startsWith("+")) s = "+" + s;
  return s;
}
async function hashPhone(norm: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${HASH_PEPPER}|${norm}`);
}

/**
 * WhatsApp-style "New chat" sheet (mobile parity with the web sheet):
 * Development project · New group · New contact · Invite via SMS/WhatsApp ·
 * Find friends from contacts — plus a searchable member list for 1:1 chats.
 */
export function NewChatSheet({
  visible,
  onClose,
  onChatCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onChatCreated: (chat: any) => void;
}) {
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<"home" | "invite" | "group" | "contacts">("home");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");

  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<Member[]>([]);

  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("+");

  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [groupAvatar, setGroupAvatar] = useState<GroupAvatarValue>({});

  const [matches, setMatches] = useState<Match[]>([]);
  const [contactsErr, setContactsErr] = useState("");
  const [contactsBlocked, setContactsBlocked] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setView("home"); setQuery(""); setInviteName(""); setInvitePhone("+");
    setGroupName(""); setSelected([]); setGroupAvatar({}); setMatches([]); setContactsErr(""); setContactsBlocked(false);
    apiGet("/api/workspace/members")
      .then((m) => setMembers(Array.isArray(m) ? m : m?.members || []))
      .catch(() => setMembers([]));
  }, [visible]);

  const say = (t: string) => { setFlash(t); setTimeout(() => setFlash(""), 2600); };

  const filtered = useMemo(() => {
    if (!query.trim()) return members;
    const q = query.toLowerCase();
    return members.filter(
      (m) => (m.name || "").toLowerCase().includes(q) ||
        (m.email || "").toLowerCase().includes(q) ||
        (m.phone || "").includes(q),
    );
  }, [members, query]);

  const startDirect = async (m: Member) => {
    setBusy(true);
    try {
      const chat = await apiPost("/api/chats", { name: m.name, type: "direct", member_ids: [m.id], default_models: [] });
      onChatCreated(chat); onClose();
    } catch (e: any) { say(e?.message || "Could not start chat"); }
    finally { setBusy(false); }
  };

  const startDirectByUserId = async (uid: string, name: string) => {
    setBusy(true);
    try {
      const chat = await apiPost("/api/chats", { name, type: "direct", member_ids: [uid], default_models: [] });
      onChatCreated(chat); onClose();
    } catch (e: any) { say(e?.message || "Could not start chat"); }
    finally { setBusy(false); }
  };

  const createDev = async () => {
    setBusy(true);
    try {
      const res = await apiPost("/api/chats/dev", { name: "New Development Project" });
      onChatCreated(res.chat); onClose();
    } catch (e: any) { say(e?.message || "Could not create dev chat"); }
    finally { setBusy(false); }
  };

  const createGroup = async () => {
    if (!groupName.trim() || selected.length === 0) return;
    setBusy(true);
    try {
      const chat = await apiPost("/api/chats", {
        name: groupName.trim(),
        type: "group",
        member_ids: selected,
        default_models: [],
        avatar_icon: groupAvatar.avatar_icon || null,
        avatar_color: groupAvatar.avatar_color || null,
        avatar_url: groupAvatar.avatar_url || null,
      });
      onChatCreated(chat); onClose();
    } catch (e: any) { say(e?.message || "Could not create group"); }
    finally { setBusy(false); }
  };

  const sendInvite = async (method: "whatsapp" | "sms") => {
    if (!invitePhone || invitePhone.length < 5) return say("Enter a phone number with country code (e.g. +1…)");
    setBusy(true);
    try {
      const data = await apiPost("/api/invites/phone", {
        phone: invitePhone.trim(), name: inviteName.trim() || null, method, share_url_base: APP_BASE,
      });
      if (data.open_url) { Linking.openURL(data.open_url).catch(() => {}); }
      if (data.method === "whatsapp") say("Opening WhatsApp…");
      else if (data.method === "local_sms") say("Opening your SMS app…");
      else if (data.method === "sms") say(data.twilio_mode === "test" ? "Test mode — no real SMS sent" : `SMS sent · ${data.twilio_status || "queued"}`);
      else say("Invite sent");
      setView("home"); setInvitePhone("+"); setInviteName("");
    } catch (e: any) { say(e?.message || "Could not send invite"); }
    finally { setBusy(false); }
  };

  const findFriends = async () => {
    setView("contacts");
    setContactsErr(""); setContactsBlocked(false); setContactsLoading(true);
    try {
      let perm = await Contacts.getPermissionsAsync();
      if (perm.status !== "granted" && perm.canAskAgain) perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== "granted") {
        setContactsBlocked(!perm.canAskAgain);
        setContactsErr(perm.canAskAgain ? "Contacts access is needed to find friends." : "Contacts access is blocked. Turn it on in Settings.");
        setContactsLoading(false);
        return;
      }
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name] });
      const norms = new Set<string>();
      for (const c of data) {
        for (const p of c.phoneNumbers || []) {
          const n = normalizePhone(p.number);
          if (n && n.length >= 8) norms.add(n);
        }
      }
      if (norms.size === 0) { setContactsErr("No phone numbers found in your contacts."); setContactsLoading(false); return; }
      const hashes = await Promise.all([...norms].slice(0, 2000).map(hashPhone));
      const res = await apiPost("/api/contacts/match", { hashes });
      setMatches(res.matches || []);
    } catch {
      setContactsErr("Could not read your contacts.");
    } finally { setContactsLoading(false); }
  };

  const header = view === "home" ? "New chat"
    : view === "invite" ? "New contact · invite by phone"
    : view === "group" ? "New group" : "Find friends from contacts";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="new-chat-sheet">
          <View style={styles.grab} />
          <View style={styles.header}>
            {view !== "home" ? (
              <TouchableOpacity testID="new-chat-back" onPress={() => setView("home")} style={styles.iconBtn}>
                <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            ) : <View style={styles.iconBtn} />}
            <Text style={styles.headerTitle}>{header}</Text>
            <TouchableOpacity testID="new-chat-close" onPress={onClose} style={styles.iconBtn}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {flash ? <Text style={styles.flash} testID="new-chat-flash">{flash}</Text> : null}

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }}>
            {view === "home" && (
              <View>
                <Action testID="new-chat-action-development" icon="rocket" color="#fbbf24" title="Development project" sub="Collaborative dev chat · AI Dev Manager" onPress={createDev} />
                <Action testID="new-chat-action-group" icon="people" color="#34d399" title="New group" sub="Chat with multiple teammates" onPress={() => setView("group")} />
                <Action testID="new-chat-action-new-contact" icon="person-add" color="#a78bfa" title="New contact" sub="Add someone by phone number" onPress={() => setView("invite")} />
                <Action testID="new-chat-action-invite-phone" icon="chatbubble-ellipses" color="#fbbf24" title="Invite via SMS / WhatsApp" sub="Send a join link to any phone" onPress={() => setView("invite")} />
                <Action testID="new-chat-action-import-contacts" icon="book" color="#60a5fa" title="Find friends from contacts" sub="Match your address book against TeamNest" onPress={findFriends} />

                <View style={styles.searchWrap}>
                  <Ionicons name="search" size={16} color={colors.textMuted} />
                  <TextInput
                    testID="new-chat-search"
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search name or phone…"
                    placeholderTextColor={colors.textMuted}
                    style={styles.searchInput}
                  />
                </View>
                <Text style={styles.sectionLabel}>Contacts on TeamNest · {filtered.length}</Text>
                {filtered.map((m) => (
                  <TouchableOpacity key={m.id} testID={`new-chat-member-${m.id}`} style={styles.memberRow} onPress={() => startDirect(m)} disabled={busy}>
                    <Avatar name={m.name} size={40} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
                      <Text style={styles.memberSub} numberOfLines={1}>{m.email || m.phone || "Workspace member"}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
                {filtered.length === 0 ? (
                  <Text style={styles.emptyNote}>No matching contacts. Use “Invite via SMS / WhatsApp”.</Text>
                ) : null}
              </View>
            )}

            {view === "group" && (
              <View style={styles.pad}>
                <Text style={styles.label}>GROUP PHOTO</Text>
                <GroupAvatarPicker
                  value={groupAvatar}
                  name={groupName || "Group"}
                  onChange={setGroupAvatar}
                  onError={say}
                />
                <Text style={[styles.label, { marginTop: spacing.lg }]}>GROUP NAME</Text>
                <TextInput testID="group-name-input" value={groupName} onChangeText={setGroupName} placeholder="Design team" placeholderTextColor={colors.textMuted} style={styles.input} />
                <Text style={[styles.label, { marginTop: spacing.lg }]}>ADD MEMBERS · {selected.length}</Text>
                {members.map((m) => {
                  const on = selected.includes(m.id);
                  return (
                    <TouchableOpacity key={m.id} testID={`group-member-${m.id}`} style={styles.memberRow}
                      onPress={() => setSelected((s) => on ? s.filter((x) => x !== m.id) : [...s, m.id])}>
                      <Avatar name={m.name} size={36} />
                      <Text style={[styles.memberName, { flex: 1 }]} numberOfLines={1}>{m.name}</Text>
                      <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={22} color={on ? colors.accent : colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity testID="group-create-btn" onPress={createGroup} disabled={busy || !groupName.trim() || !selected.length}
                  style={[styles.primaryBtn, (busy || !groupName.trim() || !selected.length) && { opacity: 0.4 }]}>
                  {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryBtnText}>Create group</Text>}
                </TouchableOpacity>
              </View>
            )}

            {view === "invite" && (
              <View style={styles.pad}>
                <Text style={styles.note}>We&apos;ll generate a workspace join link and message it to this number — no app install needed.</Text>
                <Text style={styles.label}>THEIR NAME (OPTIONAL)</Text>
                <TextInput testID="invite-name-input" value={inviteName} onChangeText={setInviteName} placeholder="Sarah" placeholderTextColor={colors.textMuted} style={styles.input} />
                <Text style={[styles.label, { marginTop: spacing.md }]}>PHONE (WITH COUNTRY CODE)</Text>
                <TextInput testID="invite-phone-input" value={invitePhone} onChangeText={setInvitePhone} placeholder="+14155551234" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" style={styles.input} />
                <View style={styles.inviteBtns}>
                  <TouchableOpacity testID="invite-send-whatsapp" onPress={() => sendInvite("whatsapp")} disabled={busy} style={[styles.waBtn, busy && { opacity: 0.6 }]}>
                    <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                    <Text style={styles.waText}>WhatsApp</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID="invite-send-sms" onPress={() => sendInvite("sms")} disabled={busy} style={[styles.smsBtn, busy && { opacity: 0.6 }]}>
                    <Ionicons name="chatbubble" size={15} color="#000" />
                    <Text style={styles.smsText}>SMS</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {view === "contacts" && (
              <View style={styles.pad}>
                {contactsLoading ? (
                  <View style={styles.contactsCenter}><ActivityIndicator color={colors.accent} /><Text style={styles.note}>Matching your contacts…</Text></View>
                ) : contactsErr ? (
                  <View style={styles.contactsCenter}>
                    <Ionicons name="book-outline" size={32} color={colors.textMuted} />
                    <Text style={styles.note}>{contactsErr}</Text>
                    {contactsBlocked ? (
                      <TouchableOpacity testID="contacts-open-settings" onPress={() => Linking.openSettings()} style={styles.secondaryBtn}>
                        <Text style={styles.secondaryBtnText}>Open Settings</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity testID="contacts-retry" onPress={findFriends} style={styles.secondaryBtn}>
                        <Text style={styles.secondaryBtnText}>Try again</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : matches.length === 0 ? (
                  <View style={styles.contactsCenter}>
                    <Ionicons name="people-outline" size={32} color={colors.textMuted} />
                    <Text style={styles.note}>None of your contacts are on TeamNest yet. Invite them via SMS / WhatsApp.</Text>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.sectionLabel}>On TeamNest · {matches.length}</Text>
                    {matches.map((m) => (
                      <TouchableOpacity key={m.user_id} testID={`contact-match-${m.user_id}`} style={styles.memberRow} onPress={() => startDirectByUserId(m.user_id, m.name)} disabled={busy}>
                        <Avatar name={m.name} size={40} />
                        <Text style={[styles.memberName, { flex: 1 }]} numberOfLines={1}>{m.name}</Text>
                        <Ionicons name="chatbubble-outline" size={18} color={colors.accent} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Action({ testID, icon, color, title, sub, onPress }: any) {
  return (
    <TouchableOpacity testID={testID} style={styles.action} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.actionIcon, { borderColor: color + "55" }]}>
        <Ionicons name={icon} size={19} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSub} numberOfLines={1}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  grab: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  iconBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800", flex: 1, textAlign: "center" },
  flash: { color: colors.accent, backgroundColor: colors.accentDim, textAlign: "center", paddingVertical: 6, borderRadius: radius.sm, marginBottom: spacing.sm, fontSize: font.small },
  action: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  actionIcon: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  actionTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "600" },
  actionSub: { color: colors.textMuted, fontSize: font.small, marginTop: 1 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, marginTop: spacing.md },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: font.body, paddingVertical: 10 },
  sectionLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.md, marginBottom: 4 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10 },
  memberName: { color: colors.textPrimary, fontSize: font.body, fontWeight: "600" },
  memberSub: { color: colors.textMuted, fontSize: font.small, marginTop: 1 },
  emptyNote: { color: colors.textMuted, fontStyle: "italic", fontSize: font.small, paddingVertical: spacing.md },
  pad: { paddingVertical: spacing.md },
  note: { color: colors.textSecondary, fontSize: font.small, lineHeight: 19, marginBottom: spacing.md },
  label: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1.2, marginBottom: 6 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, color: colors.textPrimary, fontSize: font.body },
  primaryBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", marginTop: spacing.lg },
  primaryBtnText: { color: "#000", fontWeight: "800", fontSize: font.body },
  inviteBtns: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  waBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#22c55e", borderRadius: radius.md, paddingVertical: 13 },
  waText: { color: "#fff", fontWeight: "800", fontSize: font.small },
  smsBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13 },
  smsText: { color: "#000", fontWeight: "800", fontSize: font.small },
  contactsCenter: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl },
  secondaryBtn: { borderWidth: 1, borderColor: colors.accentBorder, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  secondaryBtnText: { color: colors.accent, fontWeight: "700", fontSize: font.small },
});
