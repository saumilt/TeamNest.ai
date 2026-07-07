import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { HASH_PEPPER, normalizePhone, sha256Hex } from "@/lib/contactsHash";
import ContactsIdlePane from "./contacts/ContactsIdlePane";
import ContactsPastePane from "./contacts/ContactsPastePane";
import MatchedContacts from "./contacts/MatchedContacts";
import InvitableContacts from "./contacts/InvitableContacts";
import BulkSendBar from "./contacts/BulkSendBar";

/**
 * Reads the phone's address book via Capacitor Contacts (mobile) or accepts
 * a manually-pasted list (web), hashes phone numbers locally, asks the
 * server which ones already have TeamNest accounts, and shows:
 *   - "On TeamNest" (one-tap chat)
 *   - "Invite" (multi-select + bulk send SMS/WhatsApp)
 *
 * Props:
 *   onStartChat(member) — called when user taps an "On TeamNest" row
 *   onClose()
 *
 * Was a 350+ LOC monolith; now an orchestrator delegating to
 * `components/contacts/*` sub-panes.
 */
export default function ContactBookImporter({ onStartChat, onClose }) {
        const [phase, setPhase] = useState("idle"); // idle | loading | results
        const [contacts, setContacts] = useState([]); // [{ name, phone, normalized }]
        const [matches, setMatches] = useState([]);
        const [selected, setSelected] = useState(new Set());
        const [query, setQuery] = useState("");
        const [sending, setSending] = useState(false);
        const [pasteMode, setPasteMode] = useState(false);
        const [pasted, setPasted] = useState("");

        const isCapacitor = typeof window !== "undefined"
                && Boolean(window.Capacitor?.isNativePlatform?.());

        const importFromDevice = async () => {
                if (!isCapacitor) {
                        setPasteMode(true);
                        return;
                }
                setPhase("loading");
                try {
                        const { Contacts } = await import("@capacitor-community/contacts");
                        const perm = await Contacts.requestPermissions();
                        if (perm?.contacts !== "granted") {
                                toast.error("Permission denied — enable Contacts in Settings.");
                                setPhase("idle");
                                return;
                        }
                        const res = await Contacts.getContacts({
                                projection: { name: true, phones: true },
                        });
                        const parsed = [];
                        for (const c of res?.contacts || []) {
                                const display = c?.name?.display || c?.name?.given || "Unknown";
                                for (const ph of c?.phones || []) {
                                        const n = normalizePhone(ph.number);
                                        if (n.length >= 8) parsed.push({ name: display, phone: ph.number, normalized: n });
                                }
                        }
                        await runMatch(parsed);
                } catch (e) {
                        toast.error("Could not read contacts: " + (e?.message || "unknown"));
                        setPhase("idle");
                }
        };

        const importFromPaste = async () => {
                const lines = pasted
                        .split(/\n|,|;/)
                        .map((l) => l.trim())
                        .filter(Boolean);
                const parsed = lines
                        .map((l) => {
                                const m = l.match(/^([^,+]+?)[,:\t]\s*(\+?[\d\s\-()]+)$/);
                                if (m) return { name: m[1].trim(), phone: m[2], normalized: normalizePhone(m[2]) };
                                const n = normalizePhone(l);
                                return n.length >= 8 ? { name: n, phone: l, normalized: n } : null;
                        })
                        .filter(Boolean);
                if (!parsed.length) return toast.error("No valid phone numbers found");
                setPasteMode(false);
                await runMatch(parsed);
        };

        const runMatch = async (parsed) => {
                setPhase("loading");
                setContacts(parsed);
                const hashes = await Promise.all(
                        parsed.map((c) => sha256Hex(`${HASH_PEPPER}|${c.normalized}`)),
                );
                try {
                        const { data } = await api.post("/contacts/match", { hashes });
                        const byHash = new Map(parsed.map((c, i) => [hashes[i], c]));
                        const enriched = (data.matches || []).map((m) => ({
                                ...m,
                                local: byHash.get(m.phone_hash) || {},
                        }));
                        setMatches(enriched);
                        const matchedHashSet = new Set(enriched.map((m) => m.phone_hash));
                        const decorated = parsed.map((c, i) => ({
                                ...c,
                                hash: hashes[i],
                                on_platform: matchedHashSet.has(hashes[i]),
                        }));
                        setContacts(decorated);
                        setPhase("results");
                        toast.success(
                                `${data.match_count} of your ${parsed.length} contacts are on TeamNest`,
                        );
                } catch (e) {
                        toast.error(e?.response?.data?.detail || "Match failed");
                        setPhase("idle");
                }
        };

        const toggle = (key) =>
                setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                });

        const selectAll = () => {
                const eligible = contacts.filter((c) => !c.on_platform).map((c) => c.normalized);
                setSelected(new Set(eligible));
        };

        const send = async (method) => {
                const rows = contacts
                        .filter((c) => selected.has(c.normalized))
                        .map((c) => ({ phone: c.normalized, name: c.name }));
                if (!rows.length) return toast.error("Select at least one contact to invite");
                setSending(true);
                try {
                        const shareBase = typeof window !== "undefined" ? window.location.origin : "";
                        const { data } = await api.post("/invites/phone/bulk", {
                                rows, method, share_url_base: shareBase,
                        });
                        if (method === "whatsapp") {
                                const urls = data.results.filter((r) => r.open_url).map((r) => r.open_url);
                                if (urls.length) window.open(urls[0], "_blank");
                                toast.success(
                                        `${data.sent} WhatsApp invites prepared. Tap "Send" on each one — we'll cue them up.`,
                                );
                        } else {
                                toast.success(`${data.sent} SMS invites sent · ${data.failed} failed`);
                        }
                        setSelected(new Set());
                } catch (e) {
                        toast.error(e?.response?.data?.detail || "Bulk invite failed");
                } finally {
                        setSending(false);
                }
        };

        // ── Render
        if (phase === "idle" && !pasteMode) {
                return <ContactsIdlePane isCapacitor={isCapacitor} onImport={importFromDevice} />;
        }
        if (pasteMode) {
                return (
                        <ContactsPastePane
                                value={pasted}
                                onChange={setPasted}
                                onCancel={() => setPasteMode(false)}
                                onSubmit={importFromPaste}
                        />
                );
        }
        if (phase === "loading") {
                return (
                        <div className="p-10 flex flex-col items-center gap-3 text-zinc-400 text-sm">
                                <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
                                Matching {contacts.length || ""} contacts…
                        </div>
                );
        }

        const eligibleCount = contacts.filter((c) => !c.on_platform).length;
        return (
                <div className="p-3 space-y-3">
                        <MatchedContacts matches={matches} onStartChat={onStartChat} />
                        <InvitableContacts
                                contacts={contacts}
                                selected={selected}
                                query={query}
                                onQueryChange={setQuery}
                                onToggle={toggle}
                                onSelectAll={selectAll}
                        />
                        <BulkSendBar count={selected.size} sending={sending} onSend={send} />
                        {matches.length === 0 && eligibleCount === 0 && (
                                <div className="text-sm text-zinc-500 italic px-2 py-4 text-center">
                                        No matchable contacts found.
                                </div>
                        )}
                </div>
        );
}
