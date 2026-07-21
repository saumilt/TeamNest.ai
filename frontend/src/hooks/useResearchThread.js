import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

/**
 * Shared data + actions for an AI research/comparison thread. Used by both the
 * desktop side-by-side panel (AIComparison) and the mobile inline-messages view
 * (AIComparisonInline) so the two surfaces stay in perfect parity.
 */
export function useResearchThread(threadId, { onAfterSelectBest } = {}) {
  const [data, setData] = useState(null);
  const [synthesizing, setSynthesizing] = useState(false);

  const load = useCallback(() => {
    if (!threadId) return;
    api.get(`/ai/research/${threadId}`).then(({ data }) => setData(data));
  }, [threadId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  const vote = useCallback(
    async (rid, cat) => {
      await api.post(`/ai/responses/${rid}/vote`, { vote_category: cat });
      load();
    },
    [load],
  );

  const selectBest = useCallback(
    async (rid) => {
      await api.post(`/ai/responses/${rid}/select-best`);
      toast.success("Re-synthesized with new best · posted in chat");
      load();
      onAfterSelectBest?.();
    },
    [load, onAfterSelectBest],
  );

  const synthesize = useCallback(async () => {
    setSynthesizing(true);
    try {
      await api.post(`/ai/research/${threadId}/synthesize`);
      toast.success("Synthesized final answer");
      load();
    } catch {
      toast.error("Synthesis failed");
    } finally {
      setSynthesizing(false);
    }
  }, [threadId, load]);

  const share = useCallback(async () => {
    try {
      const { data: payload } = await api.post(`/ai/research/${threadId}/share`);
      const url = `${window.location.origin}/s/${payload.token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Public link copied to clipboard");
      } catch {
        toast.success(`Public link: ${url}`);
      }
      load();
    } catch {
      toast.error("Share failed");
    }
  }, [threadId, load]);

  const runModels = useCallback(
    async (keys) => {
      if (!keys || keys.length === 0) return;
      try {
        await api.post(`/ai/research/${threadId}/run-models`, { selected_models: keys });
        load();
      } catch (e) {
        toast.error(e?.response?.data?.detail || "Couldn't run those models");
      }
    },
    [threadId, load],
  );

  return { data, synthesizing, load, vote, selectBest, synthesize, share, runModels };
}
