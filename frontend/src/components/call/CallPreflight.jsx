import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Volume2,
  Loader2,
  PhoneOff,
  Headphones,
} from "lucide-react";

/**
 * CallPreflight — "Zoom-style" mic/camera self-test before joining.
 *
 * On mount:
 *  1. Requests mic (+ camera for video). If denied, surfaces the OS-level
 *     instructions to fix it.
 *  2. Enumerates devices so the user can pick a different mic / speaker /
 *     camera before joining (we persist the choice on `localStorage`).
 *  3. Runs a live RMS audio meter so the user sees that their voice is
 *     picked up. For video, shows the local camera preview.
 *
 * onReady is called with the resolved device IDs once the user clicks
 * "Join call". onCancel takes them back to the chat without joining.
 *
 * Why this exists: ~90% of "they can't hear me / I can't hear them" reports
 * come down to (a) wrong mic selected, (b) silently denied permission, or
 * (c) headphones not plugged into the OS output. This screen eliminates all
 * three by making the state visible before the user joins.
 */
const LS_KEY = "tn_call_devices_v1";

export default function CallPreflight({ isVideo, onReady, onCancel }) {
  const [phase, setPhase] = useState("requesting"); // requesting | ready | denied | error
  const [errMsg, setErrMsg] = useState("");
  const [devices, setDevices] = useState({ audioIn: [], audioOut: [], videoIn: [] });
  const [picked, setPicked] = useState({ audioIn: "", audioOut: "", videoIn: "" });
  const [level, setLevel] = useState(0); // 0..1 RMS
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(0);
  const videoRef = useRef(null);

  // Step 1 — request permission + initial stream.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = loadSaved();
      const constraints = {
        audio: saved.audioIn ? { deviceId: { ideal: saved.audioIn } } : true,
        video: isVideo ? (saved.videoIn ? { deviceId: { ideal: saved.videoIn } } : true) : false,
      };
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        // After permission, enumerateDevices returns labels.
        const list = await navigator.mediaDevices.enumerateDevices();
        const audioIn = list.filter((d) => d.kind === "audioinput");
        const audioOut = list.filter((d) => d.kind === "audiooutput");
        const videoIn = list.filter((d) => d.kind === "videoinput");
        setDevices({ audioIn, audioOut, videoIn });
        setPicked({
          audioIn: stream.getAudioTracks()[0]?.getSettings().deviceId || audioIn[0]?.deviceId || "",
          audioOut: saved.audioOut || audioOut[0]?.deviceId || "",
          videoIn: isVideo ? (stream.getVideoTracks()[0]?.getSettings().deviceId || videoIn[0]?.deviceId || "") : "",
        });
        startMeter(stream);
        if (isVideo && videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setPhase("ready");
      } catch (e) {
        if (cancelled) return;
        const denied = e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError";
        const missing = e?.name === "NotFoundError" || e?.name === "DevicesNotFoundError";
        setPhase(denied ? "denied" : "error");
        setErrMsg(
          denied
            ? (isVideo
                ? "Camera & microphone access denied. Click the camera icon in your address bar → Allow → refresh this page."
                : "Microphone access denied. Click the lock icon in your address bar → Allow → refresh this page.")
            : missing
              ? "No microphone (or camera) detected on this device."
              : `Could not access mic / camera: ${e?.message || e}`
        );
      }
    })();
    return () => {
      cancelled = true;
      stopMeter();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo]);

  // Re-create stream when the user picks a different mic / camera.
  const switchDevice = async (kind, deviceId) => {
    setPicked((p) => ({ ...p, [kind]: deviceId }));
    persistSaved({ ...picked, [kind]: deviceId });
    if (kind === "audioOut") return; // Output device pick doesn't need a new stream
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const constraints = {
      audio: { deviceId: { exact: kind === "audioIn" ? deviceId : picked.audioIn } },
      video: isVideo ? { deviceId: { exact: kind === "videoIn" ? deviceId : picked.videoIn } } : false,
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      startMeter(stream);
      if (isVideo && videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) {
      setErrMsg(`Could not switch device: ${e?.message || e}`);
    }
  };

  const startMeter = (stream) => {
    try {
      const audio = stream.getAudioTracks()[0];
      if (!audio) return;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        setLevel(Math.min(1, rms * 3)); // amplify for nicer UI bar
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Best-effort meter
    }
  };

  const stopMeter = () => {
    cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  };

  const handleJoin = () => {
    persistSaved(picked);
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onReady(picked);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-4 py-8" data-testid="call-preflight">
      <div className="w-full max-w-3xl border border-white/10 rounded-card bg-[#0c0c0e] p-6 md:p-8 space-y-6">
        {/* Header */}
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-yellow-400">Pre-call check</div>
          <h1 className="text-2xl md:text-3xl font-semibold mt-1">
            {isVideo ? "Ready your camera & mic" : "Ready your mic"}
          </h1>
          <p className="text-[13px] text-zinc-400 mt-2 max-w-prose">
            We&apos;ll test your devices before joining so everyone can hear you clearly.
            Speak into your mic — you should see the bar move.
          </p>
        </div>

        {phase === "requesting" && (
          <div className="flex items-center gap-3 text-zinc-300 py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Requesting permission…</span>
          </div>
        )}

        {(phase === "denied" || phase === "error") && (
          <div className="border border-red-500/40 bg-red-500/5 rounded-card p-5 space-y-3" data-testid="preflight-error">
            <div className="flex items-center gap-2 text-red-400">
              <MicOff className="w-5 h-5" />
              <span className="font-semibold">Can&apos;t access {isVideo ? "camera or mic" : "mic"}</span>
            </div>
            <div className="text-[13px] text-zinc-300">{errMsg}</div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => window.location.reload()} variant="outline" className="border-white/10" data-testid="preflight-retry">
                Retry
              </Button>
              <Button onClick={onCancel} variant="ghost" data-testid="preflight-cancel-err">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {phase === "ready" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: camera preview or audio-only artwork */}
            <div className="space-y-3">
              <div className="aspect-video rounded-card overflow-hidden bg-zinc-900 border border-white/5 flex items-center justify-center relative">
                {isVideo ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    data-testid="preflight-video"
                  />
                ) : (
                  <div className="text-center px-6">
                    <div className="w-20 h-20 rounded-full bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center mx-auto">
                      <Mic className="w-9 h-9 text-yellow-400" />
                    </div>
                    <div className="text-[12px] text-zinc-400 mt-3">
                      Audio call. No camera will be shared.
                    </div>
                  </div>
                )}
              </div>

              {/* Audio level meter */}
              <div data-testid="preflight-mic-meter">
                <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Mic className="w-3 h-3" /> Mic input
                  </span>
                  <span className={level > 0.05 ? "text-emerald-400" : "text-zinc-500"}>
                    {level > 0.05 ? "we hear you" : "silent"}
                  </span>
                </div>
                <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width,background-color] duration-75"
                    style={{
                      width: `${Math.max(2, Math.round(level * 100))}%`,
                      background: level > 0.6 ? "#ef4444" : level > 0.2 ? "#34d399" : "#22c55e",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Right: device pickers */}
            <div className="space-y-4">
              <DevicePicker
                label="Microphone"
                icon={<Mic className="w-3.5 h-3.5" />}
                value={picked.audioIn}
                options={devices.audioIn}
                onChange={(v) => switchDevice("audioIn", v)}
                testid="select-mic"
              />
              <DevicePicker
                label="Speaker"
                icon={<Headphones className="w-3.5 h-3.5" />}
                value={picked.audioOut}
                options={devices.audioOut}
                onChange={(v) => switchDevice("audioOut", v)}
                testid="select-speaker"
                disabled={devices.audioOut.length === 0}
                helper={devices.audioOut.length === 0 ? "Your browser doesn't expose speaker selection." : null}
              />
              {isVideo && (
                <DevicePicker
                  label="Camera"
                  icon={<VideoIcon className="w-3.5 h-3.5" />}
                  value={picked.videoIn}
                  options={devices.videoIn}
                  onChange={(v) => switchDevice("videoIn", v)}
                  testid="select-camera"
                />
              )}

              <div className="pt-4 flex flex-col-reverse md:flex-row gap-3">
                <Button
                  onClick={onCancel}
                  variant="outline"
                  className="border-white/10 rounded-sm"
                  data-testid="preflight-cancel"
                >
                  <PhoneOff className="w-4 h-4 mr-2" /> Cancel
                </Button>
                <Button
                  onClick={handleJoin}
                  className="bg-yellow-400 text-black hover:bg-yellow-300 rounded-sm flex-1"
                  data-testid="preflight-join"
                >
                  <Volume2 className="w-4 h-4 mr-2" /> Join {isVideo ? "video" : "audio"} call
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DevicePicker({ label, icon, value, options, onChange, testid, disabled, helper }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">
        {icon} <span>{label}</span>
      </div>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          data-testid={testid}
          className="bg-zinc-900 border-white/10 text-[13px] h-10 rounded-sm"
        >
          <SelectValue placeholder={disabled ? "Not available" : `Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent className="bg-zinc-900 border-white/10">
          {options.map((d) => (
            <SelectItem key={d.deviceId || d.label} value={d.deviceId || "default"} className="text-[13px]">
              {d.label || `${label} ${d.deviceId?.slice(0, 6) || "default"}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {helper && <div className="text-[11px] text-zinc-500 mt-1">{helper}</div>}
    </div>
  );
}

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}
function persistSaved(d) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(d));
  } catch {
    /* localStorage unavailable in private mode */
  }
}
