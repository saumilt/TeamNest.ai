import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { MessageSquare, Phone, Send, Plus, ShieldAlert, Building2 } from "lucide-react";

/**
 * SMS Contacts + Bridge — external phone-number participants.
 * Test mode shows a yellow banner; Twilio test credentials don't deliver
 * real SMS but validate API call shape and return fake SIDs.
 */
export default function SmsContacts() {
  const [contacts, setContacts] = useState([]);
  const [config, setConfig] = useState({ mode: "test", from_number: "" });
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "+1", company: "", role: "" });

  const load = async () => {
    try {
      const [{ data: c }, { data: cfg }] = await Promise.all([
        api.get("/sms/contacts"),
        api.get("/sms/config"),
      ]);
      setContacts(c.contacts || []);
      setConfig(cfg);
    } catch {
      toast.error("Failed to load contacts");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const loadMessages = async (contactId) => {
    const { data } = await api.get(`/sms/messages?contact_id=${contactId}`);
    setMessages(data.messages || []);
  };

  const select = async (c) => {
    setSelected(c);
    await loadMessages(c.id);
  };

  const addContact = async () => {
    if (!form.name || !form.phone) return toast.error("Name + phone required");
    try {
      await api.post("/sms/contacts", form);
      toast.success("Contact added");
      setAdding(false);
      setForm({ name: "", phone: "+1", company: "", role: "" });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Add failed");
    }
  };

  const send = async () => {
    if (!selected || !body.trim()) return;
    try {
      const { data } = await api.post("/sms/send", { contact_id: selected.id, body });
      toast.success(`Sent (test mode SID ${data.twilio_sid.slice(0, 10)}…)`);
      setBody("");
      await loadMessages(selected.id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Send failed");
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-hairline">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-brand mb-2">
              <MessageSquare className="w-3.5 h-3.5" /> SMS Bridge
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Text external contacts from TeamNest
            </h1>
            <p className="text-ink-dim text-[13px] mt-1 max-w-2xl">
              Add anyone by phone number — vendors, investors, brokers, advertisers. We send via
              Twilio and route their reply back to TeamNest. STOP / START opt-out is honored automatically.
            </p>
          </div>
          <div className="text-right">
            <div className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-sm ${
              config.mode === "test" ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"
            }`} data-testid="sms-mode-badge">
              Twilio {config.mode}
            </div>
            <div className="text-[10px] text-ink-dim mt-1">
              From <code>{config.from_number}</code>
            </div>
          </div>
        </div>
      </header>

      {config.mode === "test" && (
        <div className="bg-amber-500/10 border-b border-amber-400/30 text-amber-200 text-[12px] px-4 md:px-8 py-2 flex items-center gap-2" data-testid="sms-test-banner">
          <ShieldAlert className="w-4 h-4" />
          <span>
            Test mode is active. SMS sends return fake SIDs but never reach real phones.
            Flip <code>TWILIO_MODE=live</code> in <code>backend/.env</code> when you're ready.
          </span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-6 grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Contacts list */}
        <div className="md:col-span-1 border border-hairline rounded-card bg-surface-1 overflow-hidden">
          <div className="px-4 py-3 border-b border-hairline flex items-center justify-between">
            <div className="text-[11px] font-mono uppercase tracking-widest text-ink-dim">Contacts</div>
            <button
              onClick={() => setAdding(true)}
              data-testid="sms-add-contact-btn"
              className="text-[11px] text-brand hover:underline inline-flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          {adding && (
            <div className="px-4 py-3 border-b border-hairline space-y-2" data-testid="sms-add-form">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="w-full h-8 bg-surface-2 border border-hairline rounded-md px-2 text-[12px]" />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+15555550100" className="w-full h-8 bg-surface-2 border border-hairline rounded-md px-2 text-[12px] font-mono" />
              <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company (optional)" className="w-full h-8 bg-surface-2 border border-hairline rounded-md px-2 text-[12px]" />
              <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Role (vendor / investor / …)" className="w-full h-8 bg-surface-2 border border-hairline rounded-md px-2 text-[12px]" />
              <div className="flex items-center gap-2">
                <button onClick={addContact} data-testid="sms-submit-contact" className="flex-1 h-8 rounded-md bg-brand text-black font-mono uppercase text-[10px] tracking-widest">Save</button>
                <button onClick={() => setAdding(false)} className="h-8 px-3 rounded-md border border-hairline text-[10px] font-mono uppercase tracking-widest">Cancel</button>
              </div>
            </div>
          )}
          <div className="divide-y divide-hairline max-h-[60vh] overflow-y-auto" data-testid="sms-contacts-list">
            {contacts.length === 0 && (
              <div className="px-4 py-6 text-[12px] text-ink-dim text-center">No contacts yet.</div>
            )}
            {contacts.map((c) => (
              <button
                key={c.id}
                data-testid={`sms-contact-${c.id}`}
                onClick={() => select(c)}
                className={`w-full text-left px-4 py-3 hover:bg-white/[0.02] ${selected?.id === c.id ? "bg-brand-tint/30" : ""}`}
              >
                <div className="text-[13px] font-medium">{c.name}</div>
                <div className="text-[10px] font-mono text-ink-dim flex items-center gap-1">
                  <Phone className="w-2.5 h-2.5" /> {c.phone}
                  {!c.sms_opted_in && <span className="ml-1 text-red-300">· opted out</span>}
                </div>
                {c.company && (
                  <div className="text-[10px] text-ink-dim flex items-center gap-1">
                    <Building2 className="w-2.5 h-2.5" /> {c.company}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation */}
        <div className="md:col-span-2 border border-hairline rounded-card bg-surface-1 flex flex-col min-h-[60vh]">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-ink-dim text-[13px]">
              Pick a contact on the left to start a thread.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-hairline">
                <div className="text-[14px] font-semibold">{selected.name}</div>
                <div className="text-[11px] text-ink-dim font-mono">{selected.phone}</div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" data-testid="sms-thread">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[80%] text-[13px] px-3 py-2 rounded-2xl ${
                      m.direction === "outbound"
                        ? "ml-auto bg-brand text-black"
                        : "bg-surface-2 text-ink"
                    }`}
                  >
                    {m.body}
                    <div className={`text-[9px] mt-1 ${m.direction === "outbound" ? "text-black/70" : "text-ink-dim"} font-mono`}>
                      {new Date(m.created_at).toLocaleString()} · {m.direction}
                    </div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <div className="text-ink-dim text-[12px] text-center mt-10">
                    No messages yet — send the first one below.
                  </div>
                )}
              </div>
              <div className="px-4 py-3 border-t border-hairline flex items-center gap-2">
                <input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Type an SMS…"
                  className="flex-1 h-9 bg-surface-2 border border-hairline rounded-full px-3 text-[13px]"
                  data-testid="sms-input"
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  disabled={!selected.sms_opted_in}
                />
                <button
                  onClick={send}
                  disabled={!body.trim() || !selected.sms_opted_in}
                  data-testid="sms-send"
                  className="h-9 w-9 rounded-full bg-brand text-black disabled:opacity-40 flex items-center justify-center"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              {!selected.sms_opted_in && (
                <div className="px-4 py-2 text-[11px] text-red-300 bg-red-500/10 border-t border-red-400/20">
                  This contact replied STOP. They've opted out — sending is disabled.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
