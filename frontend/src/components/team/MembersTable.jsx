/** Plain table of workspace members. */
export default function MembersTable({ members }) {
  return (
    <div className="border border-white/5 bg-[#0a0a0a]">
      <div className="grid grid-cols-12 px-5 py-3 border-b border-white/5 label-mono">
        <div className="col-span-4">NAME</div>
        <div className="col-span-4">EMAIL</div>
        <div className="col-span-2">ROLE</div>
        <div className="col-span-2">STATUS</div>
      </div>
      {members.map((m) => (
        <div
          key={m.id}
          data-testid={`member-row-${m.id}`}
          className="grid grid-cols-12 px-5 py-4 border-b border-white/5 hover:bg-white/[0.03] items-center"
        >
          <div className="col-span-4 flex items-center gap-3">
            {m.avatar ? (
              <img src={m.avatar} className="w-8 h-8 object-cover rounded-sm" alt="" />
            ) : (
              <div className="w-8 h-8 bg-zinc-800 rounded-sm flex items-center justify-center text-xs font-bold">
                {m.name.charAt(0)}
              </div>
            )}
            <span className="text-sm">{m.name}</span>
          </div>
          <div className="col-span-4 text-sm text-zinc-400">{m.email}</div>
          <div className="col-span-2 text-[10px] font-mono uppercase tracking-widest text-zinc-300">{m.role}</div>
          <div className="col-span-2">
            <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 border rounded-sm ${
              m.status === "active" ? "border-green-500/30 text-green-400" :
              m.status === "invited" ? "border-yellow-500/30 text-yellow-400" :
              "border-white/10 text-zinc-500"
            }`}>{m.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
