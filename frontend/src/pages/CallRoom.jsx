import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  useTracks,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  FocusLayout,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import { Button } from "@/components/ui/button";
import { useLiveTranscription } from "@/hooks/useLiveTranscription";
import CallPreflight from "@/components/call/CallPreflight";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  ScreenShare,
  ScreenShareOff,
  PhoneOff,
  Phone,
  Copy,
  Users,
  Maximize2,
  Minimize2,
  X,
  Loader2,
  FileText,
} from "lucide-react";

function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function CallRoom() {
  const { callId } = useParams();
  const [sp] = useSearchParams();
  const mode = sp.get("mode") || "audio"; // for new calls
  const nav = useNavigate();
  const { user } = useAuth();
  const [conn, setConn] = useState(null); // {token, url, call}
  const [err, setErr] = useState(null);
  const [preflightDone, setPreflightDone] = useState(false);
  const [preferredDevices, setPreferredDevices] = useState(null);
  const endedRef = useRef(false);

  // Step 1: show the Zoom-style preflight (mic meter + device picker). It
  // explicitly requests permission and lets the user pick the right devices
  // before LiveKit connects — eliminates "I can't hear them" tickets.
  // We only request the chosen call mode's media (audio-only for audio calls)
  // so we never trigger a camera prompt for an audio call.
  const handlePreflightReady = (devices) => {
    setPreferredDevices(devices);
    setPreflightDone(true);
  };

  useEffect(() => {
    if (!preflightDone) return;
    let cancelled = false;
    (async () => {
      try {
        // If callId is "new", expect ?chat=... and start a fresh call.
        if (callId === "new") {
          const chatId = sp.get("chat");
          if (!chatId) {
            setErr("Missing chat for new call");
            return;
          }
          const { data } = await api.post("/calls/start", { chat_id: chatId, mode });
          if (cancelled) return;
          setConn(data);
        } else {
          const { data } = await api.post(`/calls/${callId}/join`);
          if (cancelled) return;
          setConn(data);
        }
      } catch (e) {
        setErr(e?.response?.data?.detail || "Could not connect");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, mode, preflightDone]);

  const handleDisconnected = async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    try {
      if (conn?.call?.id) {
        await api.post(`/calls/${conn.call.id}/end`, {});
      }
    } catch (e) {
      // Best-effort: the call may already be ended via webhook. Log so it's debuggable.
      console.warn("[call] end failed (likely already ended):", e?.response?.data?.detail || e?.message);
    }
    nav(`/chats/${conn?.call?.chat_id || ""}`);
  };

  if (err) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-center p-8">
        <div className="border border-red-500/40 bg-red-500/5 rounded-sm p-6 max-w-md">
          <div className="font-display text-xl mb-2">Couldn&apos;t join the call</div>
          <div className="text-sm text-zinc-400 mb-4">{err}</div>
          <Button onClick={() => nav(-1)} variant="outline" className="border-white/10 rounded-sm">
            Go back
          </Button>
        </div>
      </div>
    );
  }

  // Show preflight (mic test + device picker) BEFORE we hit /calls/start.
  // This makes permission state, audio level, and device choice all visible
  // before joining the room.
  if (!preflightDone) {
    return (
      <CallPreflight
        isVideo={mode === "video"}
        onReady={handlePreflightReady}
        onCancel={() => nav(-1)}
      />
    );
  }

  if (!conn) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-center p-8 text-white">
        <Loader2 className="w-6 h-6 animate-spin mr-3" />
        Connecting to the call…
      </div>
    );
  }

  const isVideo = (conn.call.mode === "video");
  // Pass the user's chosen mic/camera to LiveKit so it uses them by default.
  const audioCaptureDefaults = preferredDevices?.audioIn
    ? { deviceId: preferredDevices.audioIn }
    : undefined;
  const videoCaptureDefaults = isVideo && preferredDevices?.videoIn
    ? { deviceId: preferredDevices.videoIn }
    : undefined;

  return (
    <div className="h-screen bg-[#050505]" data-testid="call-room">
      <LiveKitRoom
        token={conn.token}
        serverUrl={conn.url}
        video={isVideo}
        audio={true}
        connect
        onDisconnected={handleDisconnected}
        options={{
          audioCaptureDefaults,
          videoCaptureDefaults,
        }}
        data-lk-theme="default"
        className="h-full"
      >
        <CallShell call={conn.call} user={user} onLeave={handleDisconnected} isVideo={isVideo} />
      </LiveKitRoom>
    </div>
  );
}

function CallShell({ call, user, onLeave, isVideo }) {
  // Always subscribe to screen share so audio calls can also surface a presentation.
  const trackSources = isVideo
    ? [
        { source: Track.Source.Camera, withPlaceholder: true },
        { source: Track.Source.ScreenShare, withPlaceholder: false },
      ]
    : [
        { source: Track.Source.Microphone, withPlaceholder: true },
        { source: Track.Source.ScreenShare, withPlaceholder: false },
      ];
  const tracks = useTracks(trackSources, { onlySubscribed: false });
  const screenShareTracks = tracks.filter(
    (t) => t.source === Track.Source.ScreenShare && t.publication?.track
  );
  const presenterTrack = screenShareTracks[0] || null;
  const presenterName = presenterTrack
    ? presenterTrack.participant?.name || presenterTrack.participant?.identity
    : null;
  const isPresenting = !!presenterTrack;
  // Non-screen tracks (for either the side rail or audio badge view)
  const nonShareTracks = tracks.filter((t) => t.source !== Track.Source.ScreenShare);

  const participants = useParticipants();
  const room = useRoomContext();
  const [showParticipants, setShowParticipants] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const [showDialIn, setShowDialIn] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const liveTranscript = useLiveTranscription(call.id);

  useEffect(() => {
    const startMs = new Date(call.started_at).getTime();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startMs) / 1000)), 1000);
    return () => clearInterval(id);
  }, [call.started_at]);

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-red-400">LIVE</span>
          </div>
          <span className="text-xs font-mono text-zinc-300 tabular-nums" data-testid="call-elapsed">{fmt(elapsed)}</span>
          <span className="text-xs text-zinc-600">·</span>
          <span className="text-xs font-mono uppercase tracking-widest text-yellow-300">{call.mode.toUpperCase()} CALL</span>
          {isPresenting && (
            <>
              <span className="text-xs text-zinc-600">·</span>
              <span
                data-testid="call-presenting-banner"
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-yellow-500/15 border border-yellow-400/30"
              >
                <ScreenShare className="w-3 h-3 text-yellow-300" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-yellow-200">
                  {presenterName} is presenting
                </span>
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowParticipants((v) => !v)}
            data-testid="call-participants-btn"
            className="text-xs font-mono uppercase tracking-widest text-zinc-300 hover:text-yellow-200 border border-white/10 hover:bg-white/5 px-2.5 py-1.5 rounded-sm flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5" />
            {participants.length}
          </button>
          <button
            onClick={() => setShowDialIn(true)}
            data-testid="call-dialin-btn"
            className="text-xs font-mono uppercase tracking-widest text-zinc-300 hover:text-yellow-200 border border-white/10 hover:bg-white/5 px-2.5 py-1.5 rounded-sm flex items-center gap-1.5"
          >
            <Phone className="w-3.5 h-3.5" />
            Dial-in
          </button>
          <button
            onClick={() => setShowTranscript((v) => !v)}
            data-testid="call-transcript-btn"
            className="text-xs font-mono uppercase tracking-widest text-zinc-300 hover:text-yellow-200 border border-white/10 hover:bg-white/5 px-2.5 py-1.5 rounded-sm flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            Notes
          </button>
        </div>
      </div>

      {/* Main stage */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 p-4 overflow-hidden" data-testid="call-stage">
          {isPresenting ? (
            <ScreenShareStage
              screenTrack={presenterTrack}
              cameraTracks={nonShareTracks.filter((t) => t.source === Track.Source.Camera)}
              participants={participants}
              isVideo={isVideo}
              user={user}
            />
          ) : isVideo ? (
            <GridLayout tracks={nonShareTracks} style={{ height: "100%" }}>
              <ParticipantTile />
            </GridLayout>
          ) : (
            <AudioOnlyView participants={participants} user={user} />
          )}
        </div>
        {showParticipants && (
          <ParticipantsPanel participants={participants} onClose={() => setShowParticipants(false)} />
        )}
        {showTranscript && (
          <LiveTranscriptPanel
            segments={liveTranscript.segments}
            enabled={liveTranscript.enabled}
            status={liveTranscript.status}
            lastError={liveTranscript.lastError}
            onToggle={liveTranscript.toggle}
            onClose={() => setShowTranscript(false)}
          />
        )}
        {showDialIn && (
          <DialInDialog call={call} onClose={() => setShowDialIn(false)} />
        )}
      </div>

      {/* Controls */}
      <CallControls
        room={room}
        onLeave={onLeave}
        isVideo={isVideo}
        onToggleTranscript={() => setShowTranscript((v) => !v)}
        transcriptOpen={showTranscript}
      />
    </div>
  );
}

function ScreenShareStage({ screenTrack, cameraTracks, participants, isVideo, user }) {
  const presenter = screenTrack?.participant;
  const presenterIdentity = presenter?.identity;
  const sideCameras = (cameraTracks || []).filter((t) => t.participant?.identity !== presenterIdentity);
  const stageRef = useRef(null);
  const [isFs, setIsFs] = useState(false);

  // Use the browser Fullscreen API so receivers can blow the share up to the
  // entire screen — exactly what users expect from Zoom/Meet. Works for the
  // presenter too (helps when reviewing their own share on a small laptop).
  const toggleFullscreen = async () => {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.warn("[call] fullscreen failed", e);
    }
  };

  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  return (
    <div className="h-full flex gap-3" data-testid="call-screenshare-stage">
      <div
        ref={stageRef}
        className={`flex-1 min-w-0 bg-black border border-yellow-400/20 rounded-sm overflow-hidden relative ${
          isFs ? "rounded-none border-0" : ""
        }`}
      >
        <FocusLayout trackRef={screenTrack} style={{ height: "100%" }} />
        <div className="absolute left-2 top-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-sm bg-black/70 border border-yellow-400/30">
          <ScreenShare className="w-3 h-3 text-yellow-300" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-yellow-200">
            {presenter?.name || presenterIdentity || "Someone"} · presenting
          </span>
        </div>
        <button
          onClick={toggleFullscreen}
          data-testid="screenshare-fullscreen-btn"
          aria-label={isFs ? "Exit fullscreen" : "Enter fullscreen"}
          className="absolute right-2 top-2 inline-flex items-center gap-1.5 px-2 py-1.5 rounded-sm bg-black/70 border border-white/15 hover:bg-yellow-400/15 hover:border-yellow-400/40 text-zinc-200 hover:text-yellow-200 transition-colors"
        >
          {isFs ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          <span className="text-[10px] font-mono uppercase tracking-widest hidden md:inline">
            {isFs ? "exit" : "fullscreen"}
          </span>
        </button>
      </div>
      {!isFs && (
      <div className="w-44 flex-shrink-0 overflow-y-auto space-y-2" data-testid="call-screenshare-rail">
        {isVideo && sideCameras.length > 0 ? (
          sideCameras.map((t) => (
            <div
              key={`${t.participant?.identity}-${t.source}`}
              className="aspect-video bg-zinc-900 border border-white/5 rounded-sm overflow-hidden"
            >
              <ParticipantTile trackRef={t} />
            </div>
          ))
        ) : (
          participants.map((p) => (
            <div
              key={p.sid || p.identity}
              className={`p-2 rounded-sm border ${
                p.isSpeaking ? "border-yellow-400/60 bg-yellow-500/10" : "border-white/5 bg-zinc-900/60"
              }`}
            >
              <ParticipantBadge participant={p} isLocal={p.identity === user?.id} />
            </div>
          ))
        )}
      </div>
      )}
    </div>
  );
}

function LiveTranscriptPanel({ segments, enabled, status, lastError, onToggle, onClose }) {
  const scrollerRef = useRef(null);
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [segments]);

  const statusLabel = (() => {
    if (!enabled) return { text: "Paused", color: "text-zinc-500", dot: "bg-zinc-600" };
    if (status === "uploading") return { text: "Transcribing…", color: "text-yellow-300", dot: "bg-yellow-400 animate-pulse" };
    if (status === "error") return { text: lastError || "Connection error", color: "text-red-400", dot: "bg-red-500" };
    if (status === "listening") return { text: "Listening", color: "text-emerald-300", dot: "bg-emerald-400 animate-pulse" };
    return { text: "Starting…", color: "text-zinc-400", dot: "bg-zinc-500 animate-pulse" };
  })();

  return (
    <div className="w-96 border-l border-white/5 bg-[#0a0a0a] flex flex-col" data-testid="live-transcript-panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="label-mono flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-yellow-400" /> LIVE TRANSCRIPT
          {enabled && (
            <span className="inline-flex items-center gap-1 text-[9px] text-red-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> REC
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggle?.(!enabled)}
            data-testid="live-transcript-toggle"
            title={enabled ? "Pause my transcription" : "Resume my transcription"}
            className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 hover:text-yellow-300 border border-white/10 hover:bg-white/5 px-1.5 py-0.5 rounded-sm"
          >
            {enabled ? "Pause" : "Resume"}
          </button>
          <button onClick={onClose} className="text-zinc-500 hover:text-white" data-testid="live-transcript-close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        className="px-4 py-2 border-b border-white/5 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest"
        data-testid="live-transcript-status"
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusLabel.dot}`} />
        <span className={statusLabel.color}>{statusLabel.text}</span>
        <span className="text-zinc-600 ml-auto">{segments.length} seg</span>
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2" data-testid="live-transcript-stream">
        {segments.length === 0 ? (
          <div className="text-xs text-zinc-500 leading-relaxed">
            {status === "error"
              ? `Transcription error: ${lastError || "unknown"}. We'll keep retrying every 4 seconds.`
              : status === "uploading"
              ? "Sending audio to Whisper for transcription… (~4-6 sec)"
              : "Listening for speech… The transcript appears here in real time. Each participant's mic is transcribed via Whisper/Deepgram."}
          </div>
        ) : (
          segments.map((s) => (
            <div key={s.id} data-testid={`transcript-segment-${s.id}`} className="text-sm leading-snug">
              <span className="font-medium text-yellow-300">{s.speaker_name}</span>
              <span className="text-zinc-500 text-[9px] font-mono ml-1.5">
                {new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <div className="text-zinc-200">{s.text}</div>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-2 border-t border-white/5 text-[10px] font-mono text-zinc-600">
        {segments.length} segment{segments.length === 1 ? "" : "s"} · auto-saved to call
      </div>
    </div>
  );
}

function AudioOnlyView({ participants, user }) {
  return (
    <div className="h-full flex flex-col items-center justify-center" data-testid="call-audio-stage">
      <div className="text-center">
        <div className="label-mono text-yellow-300 mb-3">AUDIO CALL</div>
        <div className="font-display text-3xl font-bold tracking-tight mb-8">
          {participants.length === 1 ? "Waiting for others…" : `${participants.length} on the line`}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-6 max-w-2xl">
          {participants.map((p) => (
            <ParticipantBadge key={p.sid || p.identity} participant={p} isLocal={p.identity === user?.id} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ParticipantBadge({ participant, isLocal }) {
  const speaking = participant.isSpeaking;
  return (
    <div className="text-center" data-testid={`call-participant-${participant.identity}`}>
      <div
        className={`w-20 h-20 rounded-full border-2 flex items-center justify-center font-display text-2xl font-bold mb-2 mx-auto transition-all ${
          speaking
            ? "bg-yellow-500/20 border-yellow-400 shadow-lg shadow-yellow-400/30 scale-105"
            : "bg-zinc-800 border-zinc-700"
        }`}
      >
        {(participant.name || participant.identity).charAt(0).toUpperCase()}
      </div>
      <div className="text-xs text-zinc-300 truncate max-w-[100px]">
        {participant.name || participant.identity}
        {isLocal && <span className="text-yellow-400 ml-1 text-[10px]">(you)</span>}
      </div>
      {participant.isMicrophoneEnabled === false && (
        <MicOff className="w-3 h-3 text-zinc-500 mx-auto mt-1" />
      )}
    </div>
  );
}

function ParticipantsPanel({ participants, onClose }) {
  return (
    <div className="w-72 border-l border-white/5 bg-[#0a0a0a] p-4 overflow-y-auto" data-testid="call-participants-panel">
      <div className="flex items-center justify-between mb-4">
        <div className="label-mono">PARTICIPANTS ({participants.length})</div>
        <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="space-y-1.5">
        {participants.map((p) => (
          <div key={p.sid || p.identity} className="flex items-center gap-2 p-2 rounded-sm hover:bg-white/[0.03]">
            <div className="w-8 h-8 bg-zinc-800 rounded-sm flex items-center justify-center text-xs font-bold">
              {(p.name || p.identity).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{p.name || p.identity}</div>
              <div className="text-[10px] font-mono text-zinc-500">
                {p.isLocal ? "you" : "connected"}
                {p.isSpeaking ? " · speaking" : ""}
              </div>
            </div>
            {!p.isMicrophoneEnabled && <MicOff className="w-3 h-3 text-zinc-500" />}
            {p.isCameraEnabled && <VideoIcon className="w-3 h-3 text-yellow-400" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function CallControls({ room, onLeave, isVideo }) {
  const { localParticipant } = useLocalParticipant();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(isVideo);
  const [shareOn, setShareOn] = useState(false);
  const [busy, setBusy] = useState(null);

  // Keep shareOn in sync with the actual screen-share state (e.g., user clicks
  // the browser's native "Stop sharing" bar — LiveKit will unpublish the track).
  useEffect(() => {
    if (!localParticipant) return;
    const sync = () => setShareOn(!!localParticipant.isScreenShareEnabled);
    sync();
    const events = ["trackPublished", "trackUnpublished", "localTrackPublished", "localTrackUnpublished"];
    events.forEach((ev) => localParticipant.on(ev, sync));
    return () => {
      events.forEach((ev) => localParticipant.off(ev, sync));
    };
  }, [localParticipant]);

  const toggleMic = async () => {
    setBusy("mic");
    try {
      await localParticipant.setMicrophoneEnabled(!micOn);
      setMicOn(!micOn);
    } finally { setBusy(null); }
  };

  const toggleCam = async () => {
    setBusy("cam");
    try {
      await localParticipant.setCameraEnabled(!camOn);
      setCamOn(!camOn);
    } finally { setBusy(null); }
  };

  const toggleShare = async () => {
    setBusy("share");
    try {
      await localParticipant.setScreenShareEnabled(!shareOn, { audio: true });
      setShareOn(!shareOn);
      if (!shareOn) toast.success("Sharing your screen");
    } catch (e) {
      console.warn("[screen-share]", e);
      const msg = e?.name === "NotAllowedError"
        ? "Screen share permission denied"
        : "Screen share unavailable on this browser";
      toast.error(msg);
    } finally { setBusy(null); }
  };

  const hangup = async () => {
    setBusy("end");
    try {
      await room.disconnect();
    } finally {
      onLeave();
    }
  };

  return (
    <div className="px-5 py-4 border-t border-white/5 flex items-center justify-center gap-2 bg-[#0a0a0a]">
      <ControlBtn data-testid="call-toggle-mic" onClick={toggleMic} busy={busy === "mic"} active={micOn} icon={micOn ? Mic : MicOff} label="Mic" off />
      {isVideo && (
        <ControlBtn data-testid="call-toggle-cam" onClick={toggleCam} busy={busy === "cam"} active={camOn} icon={camOn ? VideoIcon : VideoOff} label="Camera" off />
      )}
      <ControlBtn data-testid="call-toggle-share" onClick={toggleShare} busy={busy === "share"} active={shareOn} icon={shareOn ? ScreenShareOff : ScreenShare} label="Share" highlight={shareOn} />
      <button
        data-testid="call-hangup"
        onClick={hangup}
        disabled={busy === "end"}
        className="ml-3 inline-flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-sm font-mono uppercase text-[10px] tracking-widest disabled:opacity-50"
      >
        <PhoneOff className="w-4 h-4" />
        {busy === "end" ? "Ending…" : "End"}
      </button>
    </div>
  );
}

function ControlBtn({ onClick, busy, active, icon: Icon, label, highlight, off, ...rest }) {
  const base = "inline-flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-sm border text-[10px] font-mono uppercase tracking-widest min-w-[64px] transition-colors disabled:opacity-50";
  const cls = highlight
    ? "border-yellow-400/60 bg-yellow-500/15 text-yellow-300"
    : off && !active
    ? "border-red-400/40 bg-red-500/10 text-red-300"
    : "border-white/10 bg-transparent hover:bg-white/5 text-zinc-200";
  return (
    <button onClick={onClick} disabled={busy} className={`${base} ${cls}`} {...rest}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {label}
    </button>
  );
}

function DialInDialog({ call, onClose }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancel = false;
    api.get(`/calls/${call.id}/dial-in-info`)
      .then(({ data }) => { if (!cancel) setInfo(data); })
      .catch((e) => { if (!cancel) setErr(e?.response?.data?.detail || "Dial-in unavailable"); });
    return () => { cancel = true; };
  }, [call.id]);

  const copy = (txt, label) => {
    try {
      navigator.clipboard.writeText(txt);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <div
      data-testid="dialin-overlay"
      className="absolute inset-0 z-30 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        data-testid="dialin-dialog"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#0c0c0e] border border-white/10 rounded-card p-6 text-white space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-yellow-400" />
            <h2 className="text-[16px] font-semibold">Join by phone</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {err && (
          <div className="px-3 py-3 rounded-md bg-tn-red/10 border border-tn-red/30 text-[12px] text-tn-red">
            {err}
          </div>
        )}

        {!info && !err && (
          <div className="py-8 flex items-center justify-center text-zinc-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading dial-in…
          </div>
        )}

        {info && info.configured && (
          <>
            <p className="text-[12px] text-zinc-400">
              Share these with anyone who can't install the app. They dial the number,
              enter the PIN, and join this call as a phone-only participant.
            </p>
            <div className="space-y-2">
              <Row
                label="Phone number"
                value={info.phone_number}
                onCopy={() => copy(info.phone_number, "Phone number")}
                testid="dialin-phone"
              />
              <Row
                label="Meeting PIN"
                value={info.pin}
                large
                onCopy={() => copy(info.pin, "PIN")}
                testid="dialin-pin"
              />
            </div>
            <div className="pt-2 text-[11px] text-zinc-500">
              PIN expires when this call ends.
            </div>
          </>
        )}

        {info && !info.configured && (
          <div className="px-3 py-3 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-[12px] text-yellow-200">
            Dial-in isn't fully set up yet. Your admin needs to point the Twilio
            number's voice webhook at this server and create a LiveKit SIP trunk.
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, onCopy, large, testid }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 bg-white/5 border border-white/10 rounded-md">
      <div className="min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{label}</div>
        <div
          data-testid={testid}
          className={`font-mono tabular-nums ${large ? "text-[22px] font-bold tracking-widest" : "text-[14px]"}`}
        >
          {value}
        </div>
      </div>
      <button
        onClick={onCopy}
        className="text-zinc-400 hover:text-yellow-300 p-2"
        aria-label={`Copy ${label}`}
        data-testid={`${testid}-copy`}
      >
        <Copy className="w-4 h-4" />
      </button>
    </div>
  );
}

