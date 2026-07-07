/* Live presence hook for Dev OS Project pages.
 *
 * Opens a WebSocket to /api/ws/dev-os-presence/{projectId} and exposes:
 *   - peers:   array of {user_id, name, color, tab, cursor:{x,y,tab}|null}
 *   - setTab:  notify others which tab you're on
 *   - emitCursor: send your normalized cursor (x, y in 0..1) to others (throttled)
 *
 * Auth: fetches a short-lived WS token from /api/auth/ws-token, then connects
 * with ?token=. Reconnect with exponential backoff up to 30s.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const CURSOR_THROTTLE_MS = 60;
const MAX_RECONNECT_ATTEMPTS = 8;   // ~30s peak + 8 tries ≈ 4 min, then give up

export default function useDevOsPresence(projectId) {
        const wsRef = useRef(null);
        const reconnectTimer = useRef(null);
        const reconnectAttempts = useRef(0);
        const lastCursorSent = useRef(0);
        const [peers, setPeers] = useState({});       // user_id → peer info
        const [connected, setConnected] = useState(false);

        const upsertPeer = useCallback((uid, patch) => {
                setPeers((prev) => ({ ...prev, [uid]: { ...(prev[uid] || {}), user_id: uid, ...patch } }));
        }, []);

        const dropPeer = useCallback((uid) => {
                setPeers((prev) => {
                        const next = { ...prev };
                        delete next[uid];
                        return next;
                });
        }, []);

        const connect = useCallback(async () => {
                if (!projectId) return;
                try {
                        const { data } = await api.get("/auth/ws-token");
                        const token = data?.token;
                        if (!token) return;
                        const base = process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws");
                        const url = `${base}/api/ws/dev-os-presence/${projectId}?token=${encodeURIComponent(token)}`;
                        const ws = new WebSocket(url);
                        wsRef.current = ws;

                        ws.onopen = () => {
                                reconnectAttempts.current = 0;
                                setConnected(true);
                        };
                        ws.onmessage = (e) => {
                                let msg;
                                try { msg = JSON.parse(e.data); } catch { return; }
                                if (msg.event === "roster") {
                                        const next = {};
                                        for (const u of msg.users || []) {
                                                next[u.user_id] = u;
                                        }
                                        setPeers(next);
                                } else if (msg.event === "join") {
                                        upsertPeer(msg.user.user_id, msg.user);
                                } else if (msg.event === "leave") {
                                        dropPeer(msg.user_id);
                                } else if (msg.event === "cursor") {
                                        upsertPeer(msg.user_id, { cursor: { x: msg.x, y: msg.y, tab: msg.tab } });
                                } else if (msg.event === "tab") {
                                        upsertPeer(msg.user_id, { tab: msg.tab });
                                }
                        };
                        ws.onclose = () => {
                                setConnected(false);
                                wsRef.current = null;
                                if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) return;
                                // Exponential backoff: 1s, 2s, 4s, 8s … capped at 30s.
                                const attempt = Math.min(reconnectAttempts.current++, 5);
                                const delay = Math.min(1000 * 2 ** attempt, 30000);
                                reconnectTimer.current = setTimeout(connect, delay);
                        };
                        ws.onerror = () => {
                                try { ws.close(); } catch { /* noop */ }
                        };
                } catch {
                        // Auth or fetch failed — back off and retry.
                        if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) return;
                        const delay = Math.min(1000 * 2 ** reconnectAttempts.current++, 30000);
                        reconnectTimer.current = setTimeout(connect, delay);
                }
        }, [projectId, upsertPeer, dropPeer]);

        useEffect(() => {
                connect();
                return () => {
                        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
                        if (wsRef.current) {
                                try { wsRef.current.close(); } catch { /* noop */ }
                                wsRef.current = null;
                        }
                };
        }, [connect]);

        const setTab = useCallback((tab) => {
                const ws = wsRef.current;
                if (ws && ws.readyState === 1) {
                        ws.send(JSON.stringify({ event: "tab", tab }));
                }
        }, []);

        const emitCursor = useCallback((x, y, tab) => {
                const ws = wsRef.current;
                if (!ws || ws.readyState !== 1) return;
                const now = Date.now();
                if (now - lastCursorSent.current < CURSOR_THROTTLE_MS) return;
                lastCursorSent.current = now;
                ws.send(JSON.stringify({ event: "cursor", x, y, tab }));
        }, []);

        return {
                peers: Object.values(peers),
                connected,
                setTab,
                emitCursor,
        };
}
