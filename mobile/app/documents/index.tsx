import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiDelete, apiGet, apiPost } from "@/src/api";
import DoThisForMe from "@/src/components/DoThisForMe";
import { useAuth } from "@/src/auth";
import { MOBILE_MAX_SIZE, uploadZipChunked } from "@/src/chunkedUpload";
import { Markdown } from "@/src/markdown";
import { colors, font, radius, spacing } from "@/src/theme";

const ASK_MODELS = [
  { key: "claude", label: "Claude Sonnet 5" },
  { key: "chatgpt", label: "ChatGPT 5.6" },
];
const STATUS_COLOR: Record<string, string> = {
  processing: "#fbbf24",
  ready: "#34d399",
  failed: "#f87171",
};

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const { token, loading: authLoading } = useAuth();
  const [sources, setSources] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  const load = useCallback(async () => {
    try {
      const d = await apiGet("/api/knowledge/sources");
      setSources(d.sources || []);
    } catch {
      /* noop */
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (authLoading || !token) return;
    load();
    const anyProcessing = sources.some((s) => s.status === "processing");
    if (!anyProcessing) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, sources.length, authLoading, token]));

  const pickAndUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/zip", "application/x-zip-compressed"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      if (!(asset.name || "").toLowerCase().endsWith(".zip")) {
        Alert.alert("Unsupported", "Please pick a .zip archive.");
        return;
      }
      if ((asset.size || 0) > MOBILE_MAX_SIZE) {
        Alert.alert(
          "File too large for mobile",
          `Phones are limited to ${Math.round(MOBILE_MAX_SIZE / 1024 / 1024)}MB. For bigger archives, upload from the web app.`,
        );
        return;
      }
      setUploading(true);
      setUploadPct(0);
      const uploaded = await uploadZipChunked(asset as any, { onProgress: setUploadPct });
      const src = await apiPost("/api/knowledge/sources", { file_id: uploaded.id, name: asset.name });
      await load();
      setSelected(src);
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message || "Could not upload that file.");
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  const openSource = async (id: string) => {
    try {
      const d = await apiGet(`/api/knowledge/sources/${id}`);
      setSelected(d.source);
    } catch {
      /* noop */
    }
  };

  const remove = (id: string) => {
    Alert.alert("Delete source", "Remove this document source and its index?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try { await apiDelete(`/api/knowledge/sources/${id}`); load(); }
          catch { Alert.alert("Error", "Delete failed"); }
        },
      },
    ]);
  };

  if (selected) {
    return (
      <SourceDetail
        sourceId={selected.id}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        onBack={() => { setSelected(null); load(); }}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity testID="documents-back" onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Documents</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <Text style={styles.intro}>
          Upload a ZIP — TeamNest parses PDFs, Word, Excel/CSV, text, code and images
          (OCR), then answers questions with citations.
        </Text>
        <View style={styles.note}>
          <Ionicons name="phone-portrait-outline" size={13} color={colors.textMuted} />
          <Text style={styles.noteText}>
            On phones, ZIPs are limited to {Math.round(MOBILE_MAX_SIZE / 1024 / 1024)}MB. Use the web app for larger archives.
          </Text>
        </View>

        <TouchableOpacity
          testID="documents-upload-btn"
          disabled={uploading}
          onPress={pickAndUpload}
          style={[styles.uploadBtn, uploading && { opacity: 0.6 }]}
        >
          {uploading ? (
            <><ActivityIndicator color="#09090b" size="small" /><Text style={styles.uploadText}>Uploading {uploadPct}%</Text></>
          ) : (
            <><Ionicons name="cloud-upload-outline" size={18} color="#09090b" /><Text style={styles.uploadText}>Upload ZIP</Text></>
          )}
        </TouchableOpacity>

        {sources.length === 0 ? (
          <Text style={styles.empty} testID="documents-empty">No documents yet. Upload a ZIP to get started.</Text>
        ) : (
          sources.map((s) => (
            <TouchableOpacity
              key={s.id}
              testID={`documents-source-${s.id}`}
              onPress={() => openSource(s.id)}
              style={styles.card}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{s.name}</Text>
                <View style={styles.statusRow}>
                  <View style={[styles.dot, { backgroundColor: STATUS_COLOR[s.status] || colors.textMuted }]} />
                  <Text style={styles.statusText}>
                    {s.status === "processing" ? `Indexing ${s.progress || 0}%`
                      : s.status === "ready" ? `Ready · ${s.file_count} files · ${s.chunk_count} chunks`
                      : `Failed`}
                  </Text>
                </View>
              </View>
              <TouchableOpacity testID={`documents-delete-${s.id}`} onPress={() => remove(s.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function SourceDetail({ sourceId, insetsTop, insetsBottom, onBack }: any) {
  const [data, setData] = useState<any>(null);
  const [question, setQuestion] = useState("");
  const [model, setModel] = useState("claude");
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<any>(null);

  const load = useCallback(async () => {
    try { setData(await apiGet(`/api/knowledge/sources/${sourceId}`)); }
    catch { /* noop */ }
  }, [sourceId]);

  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(() => {
      if (data?.source?.status === "processing") load();
    }, 3000);
    return () => clearInterval(t);
  }, [load, data?.source?.status]));

  const src = data?.source;
  const files = data?.files || [];

  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    setResult(null);
    try {
      const r = await apiPost(`/api/knowledge/sources/${sourceId}/ask`, { question: q, model });
      setResult(r);
    } catch (e: any) {
      Alert.alert("Ask failed", e?.message || "");
    } finally {
      setAsking(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insetsTop }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity testID="documents-detail-back" onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{src?.name || "Document"}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insetsBottom + 40 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.detailMeta}>
          {src?.status === "ready" ? `${src.file_count} files · ${src.indexed_file_count} indexed · ${src.chunk_count} chunks`
            : src?.status === "failed" ? `Failed: ${src?.error || "unknown"}`
            : `Indexing ${src?.progress || 0}%…`}
        </Text>

        {src?.status === "ready" ? (
          <View style={{ marginTop: spacing.sm, alignSelf: "flex-start" }}>
            <DoThisForMe entityType="document" entityId={src.id} />
          </View>
        ) : null}

        {/* Ask box */}
        <View style={styles.askBox}>
          <TextInput
            testID="documents-ask-input"
            value={question}
            onChangeText={setQuestion}
            editable={src?.status === "ready"}
            placeholder={src?.status === "ready" ? "Ask about these documents…" : "Available once indexing completes"}
            placeholderTextColor={colors.textMuted}
            multiline
            style={styles.askInput}
          />
          <View style={styles.askActions}>
            <View style={styles.modelRow}>
              {ASK_MODELS.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  testID={`documents-model-${m.key}`}
                  onPress={() => setModel(m.key)}
                  style={[styles.modelChip, model === m.key && styles.modelChipOn]}
                >
                  <Text style={[styles.modelChipText, model === m.key && styles.modelChipTextOn]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              testID="documents-ask-btn"
              disabled={src?.status !== "ready" || asking || !question.trim()}
              onPress={ask}
              style={[styles.askBtn, (src?.status !== "ready" || asking || !question.trim()) && { opacity: 0.4 }]}
            >
              {asking ? <ActivityIndicator color="#09090b" size="small" /> : <Ionicons name="send" size={15} color="#09090b" />}
            </TouchableOpacity>
          </View>
        </View>

        {result && (
          <View style={styles.answer} testID="documents-answer">
            <View style={styles.answerHead}>
              <Ionicons name="sparkles" size={13} color={colors.accent} />
              <Text style={styles.answerHeadText}>
                Answer · {ASK_MODELS.find((m) => m.key === result.model)?.label || result.model}
              </Text>
            </View>
            <Markdown content={result.answer} size={14} />
            {result.citations?.length > 0 && (
              <View style={styles.citations} testID="documents-citations">
                {[...new Set(result.citations.map((c: any) => c.file_path))].map((fp: any) => (
                  <View key={fp} style={styles.citation}><Text style={styles.citationText}>{fp}</Text></View>
                ))}
              </View>
            )}
          </View>
        )}

        <Text style={styles.filesLabel}>FILES ({files.length})</Text>
        {files.map((f: any) => (
          <View key={f.id} style={styles.fileRow}>
            <Ionicons name="document-text-outline" size={14} color={f.indexed ? "#34d399" : colors.textMuted} />
            <Text style={styles.fileName} numberOfLines={1}>{f.path}</Text>
            <Text style={styles.fileMeta}>{f.indexed ? `${f.text_len}c` : (f.skipped_reason || "skip")}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "800", flex: 1, textAlign: "center" },
  intro: { color: colors.textMuted, fontSize: font.small, lineHeight: 19, marginBottom: spacing.sm },
  note: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md },
  noteText: { color: colors.textMuted, fontSize: font.tiny, flex: 1 },
  uploadBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, marginBottom: spacing.lg,
  },
  uploadText: { color: "#09090b", fontSize: font.body, fontWeight: "800" },
  empty: { color: colors.textMuted, fontSize: font.small, textAlign: "center", paddingVertical: spacing.xxl },
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  cardTitle: { color: colors.textPrimary, fontSize: font.small, fontWeight: "700" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: colors.textMuted, fontSize: font.tiny },
  detailMeta: { color: colors.textMuted, fontSize: font.tiny, marginBottom: spacing.md },
  askBox: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  askInput: { color: colors.textPrimary, fontSize: font.body, minHeight: 44, textAlignVertical: "top" },
  askActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, gap: spacing.sm },
  modelRow: { flexDirection: "row", gap: 6, flex: 1, flexWrap: "wrap" },
  modelChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  modelChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  modelChipText: { color: colors.textSecondary, fontSize: font.tiny, fontWeight: "600" },
  modelChipTextOn: { color: "#09090b" },
  askBtn: { backgroundColor: colors.accent, width: 40, height: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  answer: { borderWidth: 1, borderColor: colors.accentBorder, backgroundColor: colors.accentDim, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  answerHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  answerHeadText: { color: colors.accent, fontSize: font.tiny, fontWeight: "700" },
  citations: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  citation: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  citationText: { color: colors.textSecondary, fontSize: font.tiny },
  filesLabel: { color: colors.textMuted, fontSize: font.tiny, letterSpacing: 0.8, marginBottom: spacing.sm },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  fileName: { color: colors.textSecondary, fontSize: font.small, flex: 1 },
  fileMeta: { color: colors.textMuted, fontSize: font.tiny },
});
