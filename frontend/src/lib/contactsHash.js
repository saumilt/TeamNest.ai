/* Contact-matching helpers — phone normalization + privacy-preserving
 * SHA-256 hashing done entirely in the browser. The server never sees the
 * raw phone numbers, only the hashes. */

export const HASH_PEPPER = "teamnest.v1.contact-match";

export async function sha256Hex(text) {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
}

export function normalizePhone(raw) {
        if (!raw) return "";
        let s = String(raw).replace(/[^\d+]/g, "");
        if (!s) return "";
        if (!s.startsWith("+")) s = "+" + s;
        return s;
}
