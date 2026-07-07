function fmtDuration(seconds) {
  if (!seconds && seconds !== 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}m ${s}s`;
}

/** 4-cell metadata strip shown at the top of the meeting dialog. */
export default function MeetingMetadataBar({ call }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] font-mono">
      <div>
        <div className="label-mono">DURATION</div>
        <div className="text-zinc-300 mt-0.5">{fmtDuration(call.duration_seconds)}</div>
      </div>
      <div>
        <div className="label-mono">PARTICIPANTS</div>
        <div className="text-zinc-300 mt-0.5">{(call.participants || []).length}</div>
      </div>
      <div>
        <div className="label-mono">STARTED</div>
        <div className="text-zinc-300 mt-0.5">{new Date(call.started_at).toLocaleString()}</div>
      </div>
      <div>
        <div className="label-mono">SOURCE</div>
        <div className="text-zinc-300 mt-0.5">{call?.summary?.source || "—"}</div>
      </div>
    </div>
  );
}
