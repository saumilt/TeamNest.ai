import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UserPlus, Search } from "lucide-react";
import WorkspaceMetricsRow from "@/components/team/WorkspaceMetricsRow";
import MembersTable from "@/components/team/MembersTable";
import InviteByEmailDialog from "@/components/team/InviteByEmailDialog";
import FindUserDialog from "@/components/team/FindUserDialog";

const SEARCH_DEBOUNCE_MS = 350;

export default function TeamAdmin() {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [analytics, setAnalytics] = useState({});
  const [workspace, setWorkspace] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [workspaceName, setWorkspaceName] = useState("");

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchHint, setSearchHint] = useState(null);
  const [addingId, setAddingId] = useState(null);
  const searchTimer = useRef(null);

  const load = useCallback(() => {
    api.get("/workspace/members").then(({ data }) => setMembers(data));
    api.get("/workspace").then(({ data }) => {
      setWorkspace(data);
      setWorkspaceName(data.name);
    });
    api.get("/workspace/invite-analytics")
      .then(({ data }) => setAnalytics(data?.analytics || {}))
      .catch(() => setAnalytics({}));
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearchHint(q ? "Type at least 3 characters" : null);
      return;
    }
    setSearchBusy(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get("/users/search", { params: { q } });
        setResults(data.results || []);
        setSearchHint(
          (data.results || []).length === 0
            ? "No registered TeamNest user matches that email or phone."
            : null
        );
      } catch (e) {
        setResults([]);
        setSearchHint(e?.response?.data?.detail || "Search failed");
      } finally { setSearchBusy(false); }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(searchTimer.current);
  }, [query]);

  const invite = async () => {
    if (!name || !email) return toast.error("Name and email required");
    try {
      const { data } = await api.post("/workspace/invite", { name, email, role });
      toast.success(
        data?.added_to_existing_user
          ? `${data.name} already had a TeamNest account — added them and emailed a heads-up.`
          : `Invitation email sent to ${email}`
      );
      setShowInvite(false);
      setName(""); setEmail(""); setRole("member");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Invite failed");
    }
  };

  const resendInvite = async (member) => {
    try {
      await api.post(`/workspace/invite/${member.id}/resend`);
      toast.success(`Invitation re-sent to ${member.email}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not resend invite");
    }
  };

  const updateWorkspace = async () => {
    await api.patch("/workspace", { name: workspaceName });
    toast.success("Workspace updated");
    load();
  };

  const addExisting = async (target) => {
    setAddingId(target.id);
    try {
      const { data } = await api.post("/workspace/add-existing-member", {
        user_id: target.id,
        role: "member",
      });
      toast.success(`Added ${data.name} to your workspace.`);
      setResults((prev) => prev.map((r) => r.id === target.id ? { ...r, already_in_workspace: true } : r));
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not add member");
    } finally { setAddingId(null); }
  };

  const canAdd = ["owner", "admin", "member"].includes(user?.role);
  const canInviteByEmail = ["owner", "admin"].includes(user?.role);

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-end justify-between mb-10 flex-wrap gap-3">
        <div>
          <div className="label-mono mb-3">ADMIN / TEAM</div>
          <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-tighter">Team & Workspace</h1>
        </div>
        <div className="flex gap-2">
          {canAdd && (
            <Button
              data-testid="find-add-btn"
              onClick={() => { setShowSearch(true); setQuery(""); setResults([]); setSearchHint(null); }}
              variant="outline"
              className="border-yellow-400/40 bg-transparent text-yellow-300 hover:bg-yellow-400/10 hover:text-yellow-200 rounded-sm font-mono uppercase tracking-widest text-xs h-10"
            >
              <Search className="w-4 h-4 mr-2" /> Find existing user
            </Button>
          )}
          <Button
            data-testid="invite-btn"
            onClick={() => setShowInvite(true)}
            disabled={!canInviteByEmail}
            title={canInviteByEmail ? "" : "Only owner/admin can invite by email"}
            className={`bg-white text-black hover:bg-zinc-200 rounded-sm font-mono uppercase tracking-widest text-xs h-10 ${
              !canInviteByEmail ? "opacity-40 cursor-not-allowed hover:bg-white" : ""
            }`}
          >
            <UserPlus className="w-4 h-4 mr-2" /> Invite by email
          </Button>
        </div>
      </div>

      <WorkspaceMetricsRow
        workspace={workspace}
        workspaceName={workspaceName}
        setWorkspaceName={setWorkspaceName}
        onSave={updateWorkspace}
        membersCount={members.length}
        role={user?.role}
      />

      <MembersTable members={members} canManage={canInviteByEmail} onResend={resendInvite} analytics={analytics} />

      <InviteByEmailDialog
        open={showInvite}
        onOpenChange={setShowInvite}
        name={name} setName={setName}
        email={email} setEmail={setEmail}
        role={role} setRole={setRole}
        onConfirm={invite}
      />

      <FindUserDialog
        open={showSearch}
        onOpenChange={setShowSearch}
        workspaceName={workspace?.name}
        query={query} setQuery={setQuery}
        results={results}
        searchBusy={searchBusy}
        searchHint={searchHint}
        addingId={addingId}
        onAdd={addExisting}
      />
    </div>
  );
}
