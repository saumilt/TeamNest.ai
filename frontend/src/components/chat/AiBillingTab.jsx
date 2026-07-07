import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  Users as UsersIcon,
  UserCog,
  Sparkles,
  BarChart3,
  AlertTriangle,
  Lock,
  Download,
} from "lucide-react";

/**
 * AiBillingTab — owner/admin-only controls for AI usage inside a group chat.
 * Mounted as a tab inside GroupInfo. Backend at /chats/:id/ai-settings.
 *
 * Non-admins still see a read-only "billed-to" banner so they know who pays
 * when they hit @AI.
 */
export default function AiBillingTab({ chatId, chat, isAdmin }) {
  const [settings, setSettings] = useState(null);
  const [usage, setUsage] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [{ data: s }, { data: u }] = await Promise.all([
        api.get(`/chats/${chatId}/ai-settings`),
        isAdmin
          ? api.get(`/chats/${chatId}/ai-usage`).catch(() => ({ data: null }))
          : Promise.resolve({ data: null }),
      ]);
      setSettings(s);
      setUsage(u);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't load AI settings");
    }
  };

  useEffect(() => {
    if (!chatId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  const save = async (patch) => {
    if (!isAdmin) return;
    setBusy(true);
    try {
      const { data } = await api.put(`/chats/${chatId}/ai-settings`, patch);
      setSettings(data);
      toast.success("Updated");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    } finally {
      setBusy(false);
    }
  };

  if (!settings) {
    return (
      <div className="px-4 py-8 text-center text-[12px] text-ink-dim" data-testid="ai-billing-loading">
        Loading AI settings…
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="ai-billing-tab">
      {/* Read-only banner */}
      <BilledToBanner settings={settings} />

      {!isAdmin && (
        <div className="px-3 py-3 rounded-card bg-amber-500/10 border border-amber-500/30 text-[12px] text-amber-200" data-testid="ai-billing-readonly-notice">
          Only owners and admins can change AI billing & permissions for this group.
        </div>
      )}

      {/* AI master switch */}
      <Section title="AI in this group" icon={<Sparkles className="w-3.5 h-3.5" />}>
        <Toggle
          label="AI enabled"
          subtitle="Allow @AI and AI Employees inside this group."
          checked={settings.ai_enabled}
          disabled={!isAdmin || busy}
          onChange={(v) => save({ ai_enabled: v })}
          testid="toggle-ai-enabled"
        />
      </Section>

      {/* Billing mode */}
      <Section title="Who pays for AI" icon={<Wallet className="w-3.5 h-3.5" />}>
        <div className="space-y-2">
          <ModeRow
            value="workspace_pays" label="Workspace Pays"
            subtitle="All AI usage charged to the workspace credit wallet."
            current={settings.billing_mode} disabled={!isAdmin || busy}
            onClick={(v) => save({ billing_mode: v })}
          />
          <ModeRow
            value="requester_pays" label="Requester Pays"
            subtitle="The user who asks AI pays from their own credits."
            current={settings.billing_mode} disabled={!isAdmin || busy}
            onClick={(v) => save({ billing_mode: v })}
          />
          <ModeRow
            value="sponsor_pays" label="Sponsor Pays"
            subtitle="A selected user or company pays for AI usage."
            current={settings.billing_mode} disabled={!isAdmin || busy}
            onClick={(v) => save({ billing_mode: v })}
          />
          <ModeRow
            value="split_usage" label="Split Usage"
            subtitle="AI usage is split between selected members."
            current={settings.billing_mode} disabled={!isAdmin || busy}
            onClick={(v) => save({ billing_mode: v })}
          />
          <ModeRow
            value="guests_disabled" label="AI Disabled for Guests"
            subtitle="Guests can chat but can't use AI unless admin enables it."
            current={settings.billing_mode} disabled={!isAdmin || busy}
            onClick={(v) => save({ billing_mode: v })}
          />
        </div>

        {/* Sponsor picker */}
        {settings.billing_mode === "sponsor_pays" && (
          <SponsorPicker
            chat={chat}
            value={settings.sponsor_user_id}
            disabled={!isAdmin || busy}
            onChange={(id) => save({ sponsor_user_id: id })}
          />
        )}

        {/* Split picker */}
        {settings.billing_mode === "split_usage" && (
          <SplitPicker
            chat={chat}
            value={settings.split_user_ids || []}
            disabled={!isAdmin || busy}
            onChange={(ids) => save({ split_user_ids: ids })}
          />
        )}
      </Section>

      {/* Budgets & caps */}
      <Section title="Budgets & limits" icon={<AlertTriangle className="w-3.5 h-3.5" />}>
        <BudgetField
          label="Monthly group AI budget"
          help="Total credits this group can spend each month. Empty = inherit workspace."
          value={settings.monthly_group_budget_credits}
          disabled={!isAdmin || busy}
          onSave={(v) => save({ monthly_group_budget_credits: v })}
          testid="budget-group"
        />
        <BudgetField
          label="Per-user monthly cap"
          help="Max credits a single member can spend in this group each month."
          value={settings.per_user_credit_limit}
          disabled={!isAdmin || busy}
          onSave={(v) => save({ per_user_credit_limit: v })}
          testid="budget-per-user"
        />
        <BudgetField
          label="Per-question cap"
          help="Block any single AI ask above this credit cost."
          value={settings.per_question_credit_limit}
          disabled={!isAdmin || busy}
          onSave={(v) => save({ per_question_credit_limit: v })}
          testid="budget-per-question"
        />
        <BudgetField
          label="Require approval above"
          help="Members must request approval for any task above this credit cost."
          value={settings.approval_threshold_credits}
          disabled={!isAdmin || busy}
          onSave={(v) => save({ approval_threshold_credits: v })}
          testid="budget-approval"
        />
        <Toggle
          label="Notify owner/admin at 50%, 80%, 100%"
          subtitle="Send a usage alert when the group budget passes each threshold."
          checked={settings.usage_alerts_enabled}
          disabled={!isAdmin || busy}
          onChange={(v) => save({ usage_alerts_enabled: v })}
          testid="toggle-usage-alerts"
        />
      </Section>

      {/* Permissions */}
      <Section title="Permissions" icon={<UserCog className="w-3.5 h-3.5" />}>
        <RolesPicker
          value={settings.who_can_ask_ai_roles || []}
          disabled={!isAdmin || busy}
          onChange={(roles) => save({ who_can_ask_ai_roles: roles })}
        />
        <Toggle
          label="Guest AI access"
          subtitle="Allow invited guests (non-workspace) to use AI."
          checked={settings.guest_ai_enabled}
          disabled={!isAdmin || busy}
          onChange={(v) => save({ guest_ai_enabled: v })}
          testid="toggle-guest-ai"
        />
        <Toggle
          label="SMS guest AI access"
          subtitle="Allow SMS-only participants to trigger AI (low-cost models only)."
          checked={settings.sms_guest_ai_enabled}
          disabled={!isAdmin || busy}
          onChange={(v) => save({ sms_guest_ai_enabled: v })}
          testid="toggle-sms-guest-ai"
        />
      </Section>

      {/* Feature gates */}
      <Section title="AI features in this group" icon={<Lock className="w-3.5 h-3.5" />}>
        <Toggle
          label="Premium models"
          subtitle="GPT-4o, Claude Sonnet, Perplexity, Grok."
          checked={settings.premium_models_enabled}
          disabled={!isAdmin || busy}
          onChange={(v) => save({ premium_models_enabled: v })}
          testid="toggle-premium"
        />
        <Toggle
          label="Multi-model comparison"
          subtitle="Run multiple models in parallel and synthesize an answer."
          checked={settings.multi_model_compare_enabled}
          disabled={!isAdmin || busy}
          onChange={(v) => save({ multi_model_compare_enabled: v })}
          testid="toggle-multimodel"
        />
        <Toggle
          label="Web research"
          subtitle="Perplexity / Grok web search."
          checked={settings.web_research_enabled}
          disabled={!isAdmin || busy}
          onChange={(v) => save({ web_research_enabled: v })}
          testid="toggle-web-research"
        />
        <Toggle
          label="Document analysis"
          subtitle="Vision + PDF/Word attachments to AI."
          checked={settings.document_analysis_enabled}
          disabled={!isAdmin || busy}
          onChange={(v) => save({ document_analysis_enabled: v })}
          testid="toggle-document-analysis"
        />
        <Toggle
          label="Memory access (RAG)"
          subtitle="Let AI pull from workspace memory & past chats."
          checked={settings.memory_access_enabled}
          disabled={!isAdmin || busy}
          onChange={(v) => save({ memory_access_enabled: v })}
          testid="toggle-memory"
        />
      </Section>

      {/* Usage report */}
      {isAdmin && usage && (
        <Section title="Usage this month" icon={<BarChart3 className="w-3.5 h-3.5" />}>
          <UsageReport usage={usage} chatId={chatId} />
        </Section>
      )}
    </div>
  );
}

// ─── Small primitives ───────────────────────────────────────────────────────
function Section({ title, icon, children }) {
  return (
    <section>
      <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-ink-dim mb-2">
        {icon} <span>{title}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Toggle({ label, subtitle, checked, onChange, disabled, testid }) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 border border-hairline rounded-card bg-surface-2/40">
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{label}</div>
        {subtitle && <div className="text-[11px] text-ink-dim mt-0.5">{subtitle}</div>}
      </div>
      <Switch
        data-testid={testid}
        checked={!!checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}

function ModeRow({ value, label, subtitle, current, onClick, disabled }) {
  const active = current === value;
  return (
    <button
      data-testid={`billing-mode-${value}`}
      disabled={disabled}
      onClick={() => onClick(value)}
      className={`w-full text-left p-3 rounded-card border transition-colors ${
        active ? "border-brand bg-brand-tint" : "border-hairline hover:bg-white/5"
      } disabled:opacity-50`}
    >
      <div className={`text-[13px] font-medium ${active ? "text-brand" : "text-ink"}`}>{label}</div>
      <div className="text-[11px] text-ink-dim mt-0.5">{subtitle}</div>
      {active && (
        <div className="text-[9px] font-mono uppercase tracking-widest text-brand mt-1">active</div>
      )}
    </button>
  );
}

function BudgetField({ label, help, value, onSave, disabled, testid }) {
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => setLocal(value ?? ""), [value]);
  const dirty = String(local) !== String(value ?? "");
  return (
    <div className="p-3 border border-hairline rounded-card bg-surface-2/40">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-[13px] font-medium">{label}</div>
          {help && <div className="text-[11px] text-ink-dim mt-0.5">{help}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          data-testid={testid}
          type="number"
          min={0}
          inputMode="numeric"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder="unlimited"
          disabled={disabled}
          className="h-9 text-[13px] flex-1"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || !dirty}
          onClick={() => onSave(local === "" ? null : Math.max(0, parseInt(local, 10) || 0))}
          data-testid={`${testid}-save`}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

const ROLE_OPTIONS = [
  { id: "owner", label: "Owner", locked: true },
  { id: "admin", label: "Admin" },
  { id: "member", label: "Member" },
];

function RolesPicker({ value, onChange, disabled }) {
  return (
    <div className="p-3 border border-hairline rounded-card bg-surface-2/40">
      <div className="text-[13px] font-medium mb-1">Who can ask AI</div>
      <div className="text-[11px] text-ink-dim mb-2">Roles allowed to trigger @AI in this group.</div>
      <div className="flex flex-wrap gap-1.5">
        {ROLE_OPTIONS.map((r) => {
          const on = (value || []).includes(r.id) || r.locked;
          return (
            <button
              key={r.id}
              data-testid={`role-${r.id}`}
              disabled={disabled || r.locked}
              onClick={() => {
                const next = new Set(value || []);
                if (next.has(r.id)) next.delete(r.id);
                else next.add(r.id);
                next.add("owner");
                onChange(Array.from(next));
              }}
              className={`text-[11px] font-mono uppercase tracking-widest px-2.5 h-7 rounded-full border ${
                on ? "bg-brand text-black border-brand" : "border-hairline text-ink-dim hover:text-ink"
              } disabled:opacity-60`}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SponsorPicker({ chat, value, onChange, disabled }) {
  const members = chat?.members || [];
  return (
    <div className="mt-2 p-3 border border-hairline rounded-card bg-surface-2/40">
      <div className="text-[13px] font-medium mb-2">Choose sponsor</div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {members.map((m) => (
          <button
            key={m.id}
            data-testid={`sponsor-${m.id}`}
            disabled={disabled}
            onClick={() => onChange(m.id)}
            className={`w-full text-left text-[13px] px-2 h-9 rounded-md hover:bg-white/5 flex items-center justify-between ${
              value === m.id ? "bg-brand-tint text-brand" : ""
            }`}
          >
            <span className="truncate">{m.name}</span>
            {value === m.id && (
              <span className="text-[9px] font-mono uppercase tracking-widest">sponsor</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function SplitPicker({ chat, value, onChange, disabled }) {
  const members = chat?.members || [];
  const selected = useMemo(() => new Set(value || []), [value]);
  return (
    <div className="mt-2 p-3 border border-hairline rounded-card bg-surface-2/40">
      <div className="text-[13px] font-medium mb-2">Split between</div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {members.map((m) => {
          const on = selected.has(m.id);
          return (
            <button
              key={m.id}
              data-testid={`split-${m.id}`}
              disabled={disabled}
              onClick={() => {
                const next = new Set(selected);
                if (next.has(m.id)) next.delete(m.id);
                else next.add(m.id);
                onChange(Array.from(next));
              }}
              className={`w-full text-left text-[13px] px-2 h-9 rounded-md hover:bg-white/5 flex items-center justify-between ${
                on ? "bg-brand-tint text-brand" : ""
              }`}
            >
              <span className="truncate">{m.name}</span>
              {on && (
                <span className="text-[9px] font-mono uppercase tracking-widest">included</span>
              )}
            </button>
          );
        })}
      </div>
      {selected.size > 0 && (
        <div className="text-[11px] text-ink-dim mt-2">
          AI cost split evenly between {selected.size} member{selected.size === 1 ? "" : "s"}.
        </div>
      )}
    </div>
  );
}

function BilledToBanner({ settings }) {
  if (!settings.ai_enabled) {
    return (
      <div
        data-testid="ai-disabled-banner"
        className="px-3 py-3 rounded-card bg-tn-red/10 border border-tn-red/30 text-[12px] text-tn-red"
      >
        AI is disabled for this group. Owners/admins can re-enable it below.
      </div>
    );
  }
  return (
    <div
      data-testid="billed-to-banner"
      className="px-3 py-3 rounded-card bg-brand-tint border border-brand/30 text-[12px] text-brand-strong"
    >
      AI usage in this group is billed to <span className="font-semibold">{settings.billed_to_label}</span>.
    </div>
  );
}

function UsageReport({ usage, chatId }) {
  const exportCsv = () => {
    const rows = [
      ["section", "key", "credits", "count"],
      ...usage.by_user.map((r) => ["user", r.user_id, r.credits, r.count]),
      ...usage.by_employee.map((r) => ["employee", r.employee_key, r.credits, r.count]),
      ...usage.by_model.map((r) => ["model", r.model, r.credits, r.count]),
      ...usage.by_workflow.map((r) => ["workflow", r.workflow, r.credits, r.count]),
      ...usage.by_project.map((r) => ["project", r.project_folder_id, r.credits, r.count]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ai-usage-${chatId}-${usage.month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-3">
      <div className="p-3 border border-hairline rounded-card bg-surface-2/40 flex items-baseline justify-between">
        <div>
          <div className="text-[11px] text-ink-dim">{usage.month}</div>
          <div className="text-[20px] font-semibold mt-0.5">{usage.total_credits.toLocaleString()} credits</div>
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv} data-testid="export-usage-csv">
          <Download className="w-3.5 h-3.5 mr-1" /> CSV
        </Button>
      </div>
      <UsageGroup title="By model" rows={usage.by_model} keyField="model" />
      <UsageGroup title="By user" rows={usage.by_user} keyField="user_id" />
      <UsageGroup title="By AI Employee" rows={usage.by_employee} keyField="employee_key" />
      <UsageGroup title="By workflow" rows={usage.by_workflow} keyField="workflow" />
    </div>
  );
}

function UsageGroup({ title, rows, keyField }) {
  if (!rows || rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + (r.credits || 0), 0) || 1;
  return (
    <div className="p-3 border border-hairline rounded-card bg-surface-2/40">
      <div className="text-[11px] font-mono uppercase tracking-widest text-ink-dim mb-2 flex items-center gap-1.5">
        <UsersIcon className="w-3 h-3" /> {title}
      </div>
      <ul className="space-y-1.5">
        {rows.slice(0, 8).map((r) => {
          const pct = Math.round(((r.credits || 0) / total) * 100);
          return (
            <li key={r[keyField] || "_"} className="text-[12px]">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="truncate font-mono text-ink">{String(r[keyField] || "—").slice(0, 24)}</span>
                <span className="text-ink-dim">{r.credits} cr · {r.count}×</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-1 bg-brand rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
