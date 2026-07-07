/**
 * useLiveTranscription
 *
 * Captures the local participant's microphone in parallel with LiveKit, slices
 * audio into ~4-second chunks, uploads each to /api/calls/{id}/transcribe-chunk,
 * and listens on LiveKit's data channel (`topic="transcript"`) for transcribed
 * segments from EVERY participant (including ourselves). Returns:
 *
 *   { segments, enabled, toggle }
 *
 * The hook is enabled by default once the call connects. Calling `toggle(false)`
 * stops uploads from THIS client (you'll still receive others' transcript lines
 * via the data channel).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataChannel, useRoomContext } from "@livekit/components-react";
import { api, API } from "@/lib/api";

const CHUNK_INTERVAL_MS = 4000;
const MIN_CHUNK_BYTES = 4096;

export function useLiveTranscription(callId) {
  const room = useRoomContext();
  const [segments, setSegments] = useState([]);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState("idle"); // idle | listening | uploading | error
  const [lastError, setLastError] = useState(null);
  const seqRef = useRef(0);
  const cancelRef = useRef(false);

  // 1) Subscribe to data channel and append all segments we receive.
  const decoder = useMemo(() => new TextDecoder(), []);
  useDataChannel("transcript", (msg) => {
    try {
      const payload = JSON.parse(decoder.decode(msg.payload));
      if (payload.type === "transcript_segment") {
        setSegments((prev) => {
          if (prev.some((s) => s.id === payload.id)) return prev;
          return [...prev, payload];
        });
      }
    } catch (e) {
      console.warn("[live-transcript] bad payload", e);
    }
  });

  // 2) Optionally hydrate pre-existing segments (so re-joiners see history).
  useEffect(() => {
    let cancelled = false;
    if (!callId) return;
    api.get(`/calls/${callId}/transcript-segments`).then(({ data }) => {
      if (cancelled) return;
      const existing = data?.segments || [];
      if (existing.length) {
        setSegments((prev) => {
          const seen = new Set(prev.map((s) => s.id));
          return [...existing.filter((s) => !seen.has(s.id)), ...prev].sort(
            (a, b) => new Date(a.at) - new Date(b.at)
          );
        });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [callId]);

  // 3) Capture local mic in 4-second chunks (independent of LiveKit's publish).
  useEffect(() => {
    if (!enabled || !room || !callId) return;
    cancelRef.current = false;

    let mediaStream;
    let recorder;
    let chunkTimer;
    let chunkBuf = [];
    let stopped = false;

    const uploadChunk = async (blob) => {
      if (!blob || blob.size < MIN_CHUNK_BYTES) return;
      const form = new FormData();
      form.append("seq", String(seqRef.current++));
      const ext = blob.type.includes("webm") ? "webm" : "ogg";
      form.append("file", blob, `chunk.${ext}`);
      try {
        const r = await fetch(`${API}/calls/${callId}/transcribe-chunk`, {
          method: "POST",
          credentials: "include",
          body: form,
        });
        // Surface plan-gating clearly so users know to upgrade.
        if (r.status === 403) {
          const j = await r.json().catch(() => ({}));
          setLastError(j.detail || "Live transcription is a Team plan feature.");
          setStatus("error");
          stopped = true;
        }
        // Note: the segment will come back via the data channel; no local append here.
      } catch (e) {
        console.warn("[live-transcript] upload failed", e);
      }
    };

    const start = async () => {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setStatus("listening");
      } catch (e) {
        console.warn("[live-transcript] mic denied", e);
        setLastError("Mic permission denied");
        setStatus("error");
        return;
      }
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

      const restartRecorder = () => {
        if (stopped || cancelRef.current) return;
        chunkBuf = [];
        try {
          recorder = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined);
        } catch (e) {
          console.warn("[live-transcript] recorder failed", e);
          return;
        }
        recorder.ondataavailable = (ev) => { if (ev.data?.size > 0) chunkBuf.push(ev.data); };
        recorder.onstop = () => {
          const blob = new Blob(chunkBuf, { type: mime || "audio/webm" });
          uploadChunk(blob);
          if (!stopped && !cancelRef.current) restartRecorder();
        };
        recorder.start();
        chunkTimer = setTimeout(() => {
          try {
            recorder?.stop();
          } catch (err) {
            // Recorder may already be stopped on race — expected, dev-only log.
            if (process.env.NODE_ENV !== "production") {
              console.debug("[live-transcript] recorder stop (chunk-end) skipped:", err?.message || err);
            }
          }
        }, CHUNK_INTERVAL_MS);
      };
      restartRecorder();
    };
    start();

    return () => {
      stopped = true;
      cancelRef.current = true;
      if (chunkTimer) clearTimeout(chunkTimer);
      try {
        recorder?.stop();
      } catch (err) {
        // Recorder may already be inactive at teardown — expected, dev-only log.
        if (process.env.NODE_ENV !== "production") {
          console.debug("[live-transcript] recorder stop (cleanup) skipped:", err?.message || err);
        }
      }
      mediaStream?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled, room, callId]);

  const toggle = useCallback((v) => setEnabled((prev) => (typeof v === "boolean" ? v : !prev)), []);

  return { segments, enabled, toggle, status, lastError };
}
