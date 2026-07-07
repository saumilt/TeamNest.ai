import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  MessageSquare,
  ListTodo,
  Sparkles,
  ShieldCheck,
  HardDrive,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";

const ROLES = ["owner", "admin", "member", "viewer", "guest"];
const STATUSES = ["active", "disabled"];
const ACTIVE_STATUSES = new Set(STATUSES);

function bytesFmt(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [taskAnalytics, setTaskAnalytics] = useState(null);
  const [approvalsAnalytics, setApprovalsAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = ["owner", "admin"].includes(user?.role);

  const load = async () => {
    setLoading(true);
    try {
      const [a, b, c, d] = await Promise.all([
        api.get("/admin/overview"),
        api.get("/admin/users"),
        api.get("/admin/task-analytics"),
        api.get("/admin/approvals-analytics"),
      ]);
      setOverview(a.data);
      setUsers(b.data || []);
      setTaskAnalytics(c.data);
      setApprovalsAnalytics(d.data);
    } catch (e) {
      console.warn("[admin]", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="p-10 max-w-3xl">
        <div className="border border-red-500/30 bg-red-500/5 rounded-sm p-6 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <div>
            <div className="font-display text-lg">Admin only</div>
            <div className="text-xs text-zinc-400">You need owner or admin role to view the admin dashboard.</div>
          </div>
        </div>
      </div>
    );
  }

  const updateUser = async (uid, patch) => {
    try {
      const { data } = await api.patch(`/admin/users/${uid}`, patch);
      setUsers((prev) => prev.map((u) => (u.id === uid ? { ...u, ...data } : u)));
      toast.success("Updated");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    }
  };

  return (
    <div className="min-h-screen p-6 lg:p-10 max-w-7xl">
      <div className="mb-8">
        <div className="label-mono mb-2 flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-yellow-400" /> ADMIN DASHBOARD
        </div>
        <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight">
          Workspace <span className="text-yellow-400">at a glance</span>
        </h1>
        <a href="/launch-admin" data-testid="admin-launch-link"
          className="inline-flex items-center gap-1.5 mt-3 h-8 px-3 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 text-[12px] font-semibold hover:bg-yellow-500/20">
          🚀 Launch Control — waitlist, invite codes & drops
        </a>
      </div>

      {loading || !overview ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <div key={i} className="h-24 shimmer rounded-sm" />)}
        </div>
      ) : (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8" data-testid="admin-stats">
            <Stat icon={Users} label="Users" value={overview.users_total} sub={`${overview.users_active_14d} active (14d)`} />
            <Stat icon={MessageSquare} label="Messages" value={overview.messages_total} sub={`${overview.chats_total} chats · ${overview.groups_total} groups`} />
            <Stat icon={Sparkles} label="AI Threads" value={overview.ai_threads_total} sub={`${overview.ai_model_usage.reduce((a, b) => a + b.count, 0)} model calls`} />
            <Stat icon={ListTodo} label="Tasks" value={overview.tasks_total} sub={`${overview.tasks_overdue} overdue`} tone={overview.tasks_overdue > 0 ? "warn" : null} />
            <Stat icon={ShieldCheck} label="Approvals" value={overview.approvals_approved + overview.approvals_pending} sub={`${overview.approvals_pending} pending · ${overview.approvals_approved} approved`} />
            <Stat icon={HardDrive} label="Files" value={overview.files_total} sub={bytesFmt(overview.storage_bytes)} />
            <Stat icon={TrendingUp} label="Top AI" value={(overview.ai_model_usage[0]?.model || "—").toUpperCase()} sub={`${overview.ai_model_usage[0]?.count || 0} calls`} />
            <Stat icon={ListTodo} label="Due today" value={taskAnalytics?.due_today ?? "—"} sub="open tasks" />
          </div>

          <Tabs defaultValue="users" className="w-full">
            <TabsList className="bg-[#0a0a0a] border border-white/10 rounded-sm p-1 mb-4">
              <TabsTrigger value="users" data-testid="admin-tab-users" className="font-mono uppercase text-[10px] tracking-widest data-[state=active]:bg-yellow-500 data-[state=active]:text-black rounded-sm">Users</TabsTrigger>
              <TabsTrigger value="ai" data-testid="admin-tab-ai" className="font-mono uppercase text-[10px] tracking-widest data-[state=active]:bg-yellow-500 data-[state=active]:text-black rounded-sm">AI Usage</TabsTrigger>
              <TabsTrigger value="tasks" data-testid="admin-tab-tasks" className="font-mono uppercase text-[10px] tracking-widest data-[state=active]:bg-yellow-500 data-[state=active]:text-black rounded-sm">Tasks</TabsTrigger>
              <TabsTrigger value="approvals" data-testid="admin-tab-approvals" className="font-mono uppercase text-[10px] tracking-widest data-[state=active]:bg-yellow-500 data-[state=active]:text-black rounded-sm">Approvals</TabsTrigger>
            </TabsList>

            <TabsContent value="users">
              <div className="border border-white/10 bg-[#121214] rounded-sm overflow-hidden" data-testid="admin-users-table">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left label-mono px-4 py-3">USER</th>
                      <th className="text-left label-mono px-4 py-3">ROLE</th>
                      <th className="text-left label-mono px-4 py-3">STATUS</th>
                      <th className="text-left label-mono px-4 py-3">OPEN TASKS</th>
                      <th className="text-left label-mono px-4 py-3">JOINED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.03]" data-testid={`admin-user-${u.id}`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {u.avatar ? <img src={u.avatar} alt={u.name} className="w-7 h-7 rounded-sm object-cover" /> : <div className="w-7 h-7 bg-zinc-800 rounded-sm flex items-center justify-center text-[10px] font-bold">{u.name?.charAt(0)}</div>}
                            <div className="min-w-0">
                              <div className="text-sm truncate">{u.name}</div>
                              <div className="text-[10px] font-mono text-zinc-500 truncate">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <Select value={u.role} onValueChange={(v) => updateUser(u.id, { role: v })} disabled={u.id === user.id}>
                            <SelectTrigger data-testid={`admin-role-${u.id}`} className="h-8 w-[110px] bg-[#0a0a0a] border-white/10 rounded-sm text-xs font-mono uppercase tracking-widest"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-[#121214] border-white/10">
                              {ROLES.map((r) => <SelectItem key={r} value={r} className="text-xs font-mono uppercase tracking-widest">{r}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Select value={ACTIVE_STATUSES.has(u.status) ? u.status : "active"} onValueChange={(v) => updateUser(u.id, { status: v })} disabled={u.id === user.id}>
                              <SelectTrigger data-testid={`admin-status-${u.id}`} className="h-8 w-[110px] bg-[#0a0a0a] border-white/10 rounded-sm text-xs font-mono uppercase tracking-widest"><SelectValue /></SelectTrigger>
                              <SelectContent className="bg-[#121214] border-white/10">
                                {STATUSES.map((s) => <SelectItem key={s} value={s} className="text-xs font-mono uppercase tracking-widest">{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {!ACTIVE_STATUSES.has(u.status) && u.status && (
                              <Badge className="rounded-sm bg-zinc-500/15 border-zinc-500/40 text-zinc-400 font-mono text-[9px] tracking-widest border h-6 px-1.5">
                                {u.status.toUpperCase()}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge className={`rounded-sm font-mono text-[10px] tracking-widest ${u.open_tasks > 5 ? "bg-orange-500/15 text-orange-300 border-orange-500/40" : "bg-zinc-500/15 text-zinc-300 border-zinc-500/40"} border`}>
                            {u.open_tasks}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-zinc-500">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="ai">
              <div className="border border-white/10 bg-[#121214] rounded-sm p-5" data-testid="admin-ai-usage">
                <div className="label-mono mb-3">AI MODEL USAGE</div>
                <div className="space-y-2">
                  {overview.ai_model_usage.map((m) => {
                    const max = Math.max(...overview.ai_model_usage.map((x) => x.count));
                    const pct = (m.count / max) * 100;
                    return (
                      <div key={m.model} className="flex items-center gap-3" data-testid={`admin-ai-${m.model}`}>
                        <div className="w-24 text-xs font-mono uppercase tracking-widest">{m.model}</div>
                        <div className="flex-1 h-2 bg-white/5 rounded-sm overflow-hidden">
                          <div className="h-full bg-yellow-500" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="w-12 text-right text-sm font-display font-bold tabular-nums">{m.count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="tasks">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-white/10 bg-[#121214] rounded-sm p-5" data-testid="admin-tasks-by-status">
                  <div className="label-mono mb-3">TASKS BY STATUS</div>
                  <div className="space-y-2">
                    {(taskAnalytics?.by_status || []).map((s) => (
                      <div key={s.status} className="flex items-center justify-between text-sm">
                        <span className="font-mono uppercase tracking-widest text-xs text-zinc-300">{(s.status || "—").replace("_", " ")}</span>
                        <span className="font-display text-lg font-bold">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border border-white/10 bg-[#121214] rounded-sm p-5" data-testid="admin-tasks-by-assignee">
                  <div className="label-mono mb-3">TOP ASSIGNEES</div>
                  <div className="space-y-2">
                    {(taskAnalytics?.by_assignee || []).slice(0, 10).map((a) => (
                      <div key={a.user_id} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-200">{a.name}</span>
                        <span className="font-display text-lg font-bold">{a.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="approvals">
              <div className="border border-white/10 bg-[#121214] rounded-sm p-5" data-testid="admin-approvals-analytics">
                <div className="label-mono mb-3">APPROVALS BY STATUS</div>
                <div className="space-y-2">
                  {(approvalsAnalytics?.by_status || []).map((s) => (
                    <div key={s.status} className="flex items-center justify-between text-sm">
                      <span className="font-mono uppercase tracking-widest text-xs text-zinc-300">{(s.status || "—").replace("_", " ")}</span>
                      <span className="font-display text-lg font-bold">{s.count}</span>
                    </div>
                  ))}
                  {(approvalsAnalytics?.by_status || []).length === 0 && (
                    <div className="text-xs text-zinc-500">No approvals yet.</div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, tone }) {
  const accent = tone === "warn" ? "border-orange-500/40 bg-orange-500/[0.04]" : "border-white/10 bg-[#121214]";
  return (
    <div className={`border ${accent} rounded-sm p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-yellow-400" />
        <div className="label-mono">{label}</div>
      </div>
      <div className="font-display text-2xl font-bold leading-tight">{value}</div>
      {sub && <div className="text-[10px] font-mono text-zinc-500 mt-1 truncate">{sub}</div>}
    </div>
  );
}
