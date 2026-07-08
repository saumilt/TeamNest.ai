import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPatch, apiPost } from "@/src/api";
import { CreditsBadge } from "@/src/components/CreditsBadge";
import { dueLabel } from "@/src/format";
import { colors, font, radius, spacing } from "@/src/theme";

const PRIORITY_COLOR: Record<string, string> = {
  urgent: colors.danger,
  high: colors.accent,
  medium: colors.textSecondary,
  low: colors.textMuted,
};

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiGet("/api/tasks?scope=all&status_filter=active");
      setTasks(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || "Could not load tasks");
      setTasks([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const addTask = async () => {
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      await apiPost("/api/tasks", { title, priority: "medium", status: "todo" });
      setNewTitle("");
      await load();
    } catch (e: any) {
      setError(e.message || "Could not add task");
    } finally {
      setAdding(false);
    }
  };

  const complete = async (task: any) => {
    setTasks((prev) => (prev ? prev.filter((t) => t.id !== task.id) : prev));
    try {
      await apiPatch(`/api/tasks/${task.id}`, { status: "completed" });
    } catch {
      load();
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const overdue = item.status === "overdue";
    return (
      <View style={styles.taskRow} testID={`task-row-${item.id}`}>
        <TouchableOpacity
          testID={`task-complete-${item.id}`}
          onPress={() => complete(item)}
          style={styles.checkbox}
        >
          <Ionicons name="ellipse-outline" size={24} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.taskTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.taskMeta}>
            <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR[item.priority] || colors.textMuted }]} />
            <Text style={styles.metaText}>{item.priority}</Text>
            {item.due_date ? (
              <Text style={[styles.metaText, overdue && { color: colors.danger }]}>
                · due {dueLabel(item.due_date)}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
          <Text style={[styles.h1, { marginBottom: 0 }]}>Tasks</Text>
          <CreditsBadge />
        </View>
        <View style={styles.addRow}>
          <TextInput
            testID="task-title-input"
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="Add a task…"
            placeholderTextColor={colors.textMuted}
            style={styles.addInput}
            onSubmitEditing={addTask}
            returnKeyType="done"
          />
          <TouchableOpacity
            testID="task-add-btn"
            onPress={addTask}
            disabled={!newTitle.trim() || adding}
            style={[styles.addBtn, (!newTitle.trim() || adding) && { opacity: 0.4 }]}
          >
            {adding ? (
              <ActivityIndicator color="#09090b" size="small" />
            ) : (
              <Ionicons name="add" size={24} color="#09090b" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {tasks === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(t) => t.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="checkmark-done-circle-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>{error || "No active tasks — you're all caught up."}</Text>
            </View>
          }
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.textPrimary, fontSize: font.h1, fontWeight: "800", marginBottom: spacing.md },
  addRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  addInput: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: font.body,
  },
  addBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  taskRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  checkbox: { padding: 2 },
  taskTitle: { color: colors.textPrimary, fontSize: font.body, fontWeight: "600" },
  taskMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  metaText: { color: colors.textMuted, fontSize: font.tiny, textTransform: "capitalize" },
  sep: { height: 1, backgroundColor: colors.borderSubtle },
  center: { alignItems: "center", justifyContent: "center", paddingTop: 120, gap: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: font.body, textAlign: "center", paddingHorizontal: spacing.xl },
});
