import { BookUser } from "lucide-react";

/* Intro screen — explains the privacy promise, then either kicks off the
 * native Capacitor flow or drops to a paste fallback for web. */
export default function ContactsIdlePane({ isCapacitor, onImport }) {
        return (
                <div className="p-5 space-y-4 text-center">
                        <BookUser className="w-10 h-10 text-violet-400 mx-auto" />
                        <div>
                                <h3 className="text-base font-semibold text-zinc-100">
                                        Find friends from your contacts
                                </h3>
                                <p className="text-xs text-zinc-500 mt-2 leading-relaxed max-w-sm mx-auto">
                                        We&apos;ll hash your contacts on this device and check which ones are already on TeamNest.
                                        <strong className="text-zinc-300"> No phone numbers leave your phone.</strong>
                                </p>
                        </div>
                        <button
                                onClick={onImport}
                                data-testid="import-contacts-btn"
                                className="w-full h-11 rounded-md bg-violet-500 hover:bg-violet-400 text-white text-xs font-mono uppercase tracking-widest"
                        >
                                {isCapacitor ? "Allow contacts & find" : "Paste numbers (web)"}
                        </button>
                        <p className="text-[10px] text-zinc-500">
                                You can revoke contact access anytime from your device Settings.
                        </p>
                </div>
        );
}
