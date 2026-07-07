import { Send } from "lucide-react";

/* Sticky bulk send bar at the bottom of the contacts importer. */
export default function BulkSendBar({ count, sending, onSend }) {
        if (count <= 0) return null;
        return (
                <div className="sticky bottom-0 bg-[#0F0F12] pt-3 border-t border-white/5">
                        <div className="text-xs text-zinc-400 mb-2 px-1">
                                <strong className="text-zinc-200">{count}</strong> selected to invite
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                                <button
                                        onClick={() => onSend("whatsapp")}
                                        disabled={sending}
                                        data-testid="bulk-send-whatsapp"
                                        className="h-11 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-1.5"
                                >
                                        <Send className="w-4 h-4" />
                                        WhatsApp ({count})
                                </button>
                                <button
                                        onClick={() => onSend("sms")}
                                        disabled={sending}
                                        data-testid="bulk-send-sms"
                                        className="h-11 rounded-md bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-black text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-1.5"
                                >
                                        <Send className="w-4 h-4" />
                                        SMS ({count})
                                </button>
                        </div>
                </div>
        );
}
