import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// Module-wide cache keyed by chatId so the banner, header pill and cross-sell
// nudge share a single network call per chat for the session.
const _cache = new Map();

const DEFAULT = { recommendation: null, marketplace_url: "/ai-builder/marketplace" };

export function fetchEmployeeRecommendation(chatId, force = false) {
  if (!chatId) return Promise.resolve(DEFAULT);
  if (force) _cache.delete(chatId);
  if (!_cache.has(chatId)) {
    _cache.set(
      chatId,
      api
        .get(`/chats/${chatId}/employee-recommendation`)
        .then(({ data }) => data || DEFAULT)
        .catch(() => DEFAULT),
    );
  }
  return _cache.get(chatId);
}

export function useEmployeeRecommendation(chatId) {
  const [state, setState] = useState({ loading: true, reco: null, marketUrl: DEFAULT.marketplace_url });

  useEffect(() => {
    if (!chatId) {
      setState({ loading: false, reco: null, marketUrl: DEFAULT.marketplace_url });
      return undefined;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    fetchEmployeeRecommendation(chatId).then((d) => {
      if (!cancelled) {
        setState({
          loading: false,
          reco: d.recommendation,
          marketUrl: d.marketplace_url || DEFAULT.marketplace_url,
        });
      }
    });
    return () => { cancelled = true; };
  }, [chatId]);

  return state;
}
