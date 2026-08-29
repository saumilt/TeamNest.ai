import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { apiGet, apiPost } from "@/src/api";
import { colors, font, radius, spacing } from "@/src/theme";

type Props = { entityType: "task" | "document" | "chat"; entityId: string; icon?: boolean; label?: string };

/** "Do this for me" — one-tap contextual AI actions (draft-only) for mobile. */
export default function DoThisForMe({ entityType, entityId, icon = false, label = "Do this for me" }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        testID={`do-this-for-me-${entityType}`}
        onPress={(e: any) => { e?.stopPropagation?.(); setOpen(true); }}
        hitSlop={8}
        style={icon ? styles.iconBtn : styles.pillBtn}
      >
        <Ionicons name="sparkles" size={14} color={colors.accent} />
        {!icon ? <Text style={styles.pillText}>{label}</Text> : null}
      </Pressable>
      {open ? <Sheet entityType={entityType} entityId={entityId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function Sheet({ entityType, entityId, onClose }: { entityType: string; entityId: string; onClose: () => void }) {
  const [actions, setActions] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [email, setEmail] = useState<any>(null);
  const [msg, setMsg] = useState("");

  const loadActions = useCallback(() => {
    apiGet(`/api/ai/do-actions?entity_type=${entityType}`).then((d) => setActions(d.actions || [])).catch(() => {});
  }, [entityType]);
  useEffect(() => { loadActions(); }, [loadActions]);

  const say = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 2000); };
  const reset = () => { setResult(null); setEmail(null); };

  const run = async (action: string) => {
    setRunning(true); reset();
    try {
      const d = await apiPost("/api/ai/do-action", { entity_type: entityType, entity_id: entityId, action });
      setResult(d);
    } catch (e: any) { say(e?.message || "Couldn't run that"); }
    finally { setRunning(false); }
  };

  const followup = async (f: any) => {
    if (f.kind === "copy") { await Clipboard.setStringAsync(result.result); say("Copied"); return; }
    if (f.kind === "automate") { onClose(); router.push(`/automations?prompt=${encodeURIComponent(f.prompt)}` as any); return; }
    if (f.kind === "draft_email") {
      setRunning(true);
      try { const d = await apiPost("/api/ai/draft-email", { content: f.content || result.result }); setEmail(d); }
      catch (e: any) { say(e?.message || "Draft failed"); }
      finally { setRunning(false); }
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay} testID="do-this-sheet">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
        <View style={styles.head}>
          <Text style={styles.title}>✦ Do this for me</Text>
          <Pressable testID="do-this-close" onPress={onClose} hitSlop={10}><Ionicons name="close" size={20} color={colors.textMuted} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
          {!result && !email ? (
            <>
              <Text style={styles.body}>Pick what TeamNest should do with this {entityType}.</Text>
              <View style={styles.actionsWrap}>
                {actions.map((a) => (
                  <Pressable key={a.key} testID={`do-action-${a.key}`} style={styles.actionChip} onPress={() => run(a.key)} disabled={running}>
                    <Text style={styles.actionText}>{a.label}</Text>
                  </Pressable>
                ))}
              </View>
              {running ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.md }} /> : null}
            </>
          ) : email ? (
            <View testID="do-this-email">
              <Pressable onPress={() => setEmail(null)}><Text style={styles.back}>← Back</Text></Pressable>
              <Text style={styles.metaLabel}>SUBJECT</Text>
              <Text style={styles.emailSubject}>{email.subject}</Text>
              <Text style={styles.metaLabel}>BODY</Text>
              <Text style={styles.resultText}>{email.body}</Text>
              <Pressable style={styles.copyBtn} onPress={async () => { await Clipboard.setStringAsync(`${email.subject}\n\n${email.body}`); say("Copied"); }}>
                <Ionicons name="copy-outline" size={14} color="#09090b" /><Text style={styles.copyText}>Copy email</Text>
              </Pressable>
            </View>
          ) : (
            <View testID="do-this-result">
              <Pressable onPress={reset}><Text style={styles.back}>← Try another</Text></Pressable>
              <Text style={styles.resultTitle}>{result.title}</Text>
              <Text style={styles.resultText}>{result.result}</Text>
              <View style={styles.followRow}>
                {result.followups.map((f: any, i: number) => (
                  <Pressable key={i} testID={`do-followup-${f.kind}`} style={styles.followBtn} onPress={() => followup(f)} disabled={running}>
                    <Ionicons name={f.kind === "copy" ? "copy-outline" : f.kind === "automate" ? "flash" : "mail-outline"} size={13} color={colors.textSecondary} />
                    <Text style={styles.followText}>{f.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {msg ? <Text style={styles.flash}>{msg}</Text> : null}
        </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  pillBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.accentBorder, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 6 },
  pillText: { color: colors.accent, fontWeight: "700", fontSize: font.small },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "85%", borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  title: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  body: { color: colors.textMuted, fontSize: font.small },
  actionsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  actionChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  actionText: { color: colors.textPrimary, fontSize: font.small, fontWeight: "600" },
  back: { color: colors.textMuted, fontSize: font.small, marginBottom: spacing.sm },
  resultTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800", marginBottom: spacing.sm },
  resultText: { color: colors.textSecondary, fontSize: font.small, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.md, lineHeight: 20 },
  followRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  followBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 6 },
  followText: { color: colors.textSecondary, fontSize: font.small, fontWeight: "600" },
  metaLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", letterSpacing: 1, marginTop: spacing.sm, marginBottom: 2 },
  emailSubject: { color: colors.textPrimary, fontSize: font.body, fontWeight: "700", marginBottom: spacing.sm },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.textPrimary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.md, alignSelf: "flex-start" },
  copyText: { color: "#09090b", fontWeight: "800", fontSize: font.small },
  flash: { color: colors.textSecondary, fontSize: font.small, marginTop: spacing.md, textAlign: "center" },
});
