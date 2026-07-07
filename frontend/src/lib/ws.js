import { wsUrl, getWsToken } from "@/lib/api";

/**
 * WebSocket wrapper with auto-reconnect (exponential backoff, capped at 30s).
 *
 * The session lives in an HttpOnly cookie, so we mint a short-lived WS token
 * each time we (re)connect using `/api/auth/ws-token`.
 */
export function createReconnectingWS({ chatId, onMessage, onOpen, onClose }) {
  let ws = null;
  let attempt = 0;
  let closedByUser = false;
  let reconnectTimer = null;

  const connect = async () => {
    let token;
    try {
      token = await getWsToken();
    } catch (err) {
      console.warn("[ws] could not mint WS token — skipping connect", err);
      return;
    }
    if (!token || closedByUser) return;
    ws = new WebSocket(wsUrl(chatId, token));
    ws.onopen = () => {
      attempt = 0;
      onOpen?.();
    };
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onMessage?.(data);
      } catch (err) {
        console.warn("[ws] failed to parse message", err);
      }
    };
    ws.onclose = () => {
      onClose?.();
      if (closedByUser) return;
      const delay = Math.min(30000, 500 * Math.pow(2, attempt));
      attempt += 1;
      console.warn(`[ws] disconnected, reconnecting in ${delay}ms (attempt ${attempt})`);
      reconnectTimer = setTimeout(connect, delay);
    };
    ws.onerror = (err) => {
      console.error("[ws] error", err);
      try { ws.close(); } catch (closeErr) {
        console.warn("[ws] close after error failed", closeErr);
      }
    };
  };

  connect();

  return {
    send: (payload) => {
      try {
        ws?.send(JSON.stringify(payload));
      } catch (err) {
        console.warn("[ws] send failed", err);
      }
    },
    close: () => {
      closedByUser = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch (err) {
        console.warn("[ws] close failed", err);
      }
    },
  };
}
