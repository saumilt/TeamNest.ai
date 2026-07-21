import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Top metrics + workspace rename strip. */
export default function WorkspaceMetricsRow({ workspace, workspaceName, setWorkspaceName, onSave, membersCount, role }) {
  const isOwner = role === "owner";
  return (
    <div className="grid lg:grid-cols-3 gap-px bg-white/5 border border-white/5 mb-10">
      <div className="bg-[#0a0a0a] p-6">
        <div className="label-mono mb-3">WORKSPACE</div>
        <div className="flex gap-2">
          <Input
            data-testid="workspace-name"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            disabled={!isOwner}
            title={isOwner ? "" : "Only the workspace creator can rename it"}
            className="bg-[#121214] border-white/10 rounded-sm disabled:opacity-60"
          />
          {isOwner && (
            <Button
              data-testid="update-workspace"
              onClick={onSave}
              className="bg-white text-black hover:bg-zinc-200 rounded-sm font-mono uppercase text-[10px] tracking-widest"
            >
              Save
            </Button>
          )}
        </div>
        <div className="text-xs text-zinc-500 mt-3">
          {isOwner ? "You created this workspace." : "Only the creator can rename this workspace."}
        </div>
      </div>
      <div className="bg-[#0a0a0a] p-6">
        <div className="label-mono mb-3">MEMBERS</div>
        <div className="font-display text-4xl font-bold">{membersCount}</div>
      </div>
      <div className="bg-[#0a0a0a] p-6">
        <div className="label-mono mb-3">YOUR ROLE</div>
        <div className="font-display text-4xl font-bold capitalize">{role}</div>
      </div>
    </div>
  );
}
