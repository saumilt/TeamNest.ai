import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { apiPost, getAuthToken, getBase } from "./api";

// Mobile chunked/resumable upload. Phones can't stream raw binary easily, so on
// native we read the file as base64 and send 4-char-aligned base64 slices with
// ?b64=1 (the backend decodes them). On Expo web we slice the picked File/Blob
// like the web client. Phones are capped lower than the web (see MOBILE_MAX_SIZE).
const PART_BYTES = 5 * 1024 * 1024; // 5MB decoded per part
export const MOBILE_MAX_SIZE = 100 * 1024 * 1024; // 100MB cap on phones

// base64 chars per part, rounded to a multiple of 4 (each 4 chars = 3 bytes) so
// every intermediate slice decodes to an exact byte boundary.
const PART_B64 = Math.floor((PART_BYTES * 4) / 3 / 4) * 4;

type Opts = { chatId?: string | null; onProgress?: (pct: number) => void };

export async function uploadZipChunked(
  asset: { uri: string; name: string; size?: number; file?: any },
  opts: Opts = {},
): Promise<any> {
  const name = asset.name || "upload.zip";
  const size = asset.size || asset.file?.size || 0;
  const base = getBase();
  const token = getAuthToken();

  if (Platform.OS === "web" && asset.file) {
    return uploadWebBlob(asset.file, name, size, base, token, opts);
  }

  // Native: whole-file base64, then slice on 4-char boundaries.
  const b64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const totalParts = Math.max(1, Math.ceil(b64.length / PART_B64));
  const init = await apiPost("/api/uploads/chunked/init", {
    filename: name,
    size: size || Math.floor((b64.length * 3) / 4),
    total_parts: totalParts,
    chat_id: opts.chatId || null,
  });
  const uploadId = init.upload_id;
  try {
    for (let i = 0; i < totalParts; i++) {
      const slice = b64.slice(i * PART_B64, (i + 1) * PART_B64);
      await putPart(base, token, uploadId, i, slice, true);
      opts.onProgress?.(Math.round(((i + 1) / totalParts) * 100));
    }
    return await apiPost(`/api/uploads/chunked/${uploadId}/complete`);
  } catch (err) {
    apiPost(`/api/uploads/chunked/${uploadId}/abort`).catch(() => {});
    throw err;
  }
}

async function uploadWebBlob(
  file: any, name: string, size: number, base: string,
  token: string | null, opts: Opts,
) {
  const totalParts = Math.max(1, Math.ceil(size / PART_BYTES));
  const init = await apiPost("/api/uploads/chunked/init", {
    filename: name, size, total_parts: totalParts, chat_id: opts.chatId || null,
  });
  const uploadId = init.upload_id;
  try {
    for (let i = 0; i < totalParts; i++) {
      const blob = file.slice(i * PART_BYTES, Math.min((i + 1) * PART_BYTES, size));
      await putPart(base, token, uploadId, i, blob, false);
      opts.onProgress?.(Math.round(((i + 1) / totalParts) * 100));
    }
    return await apiPost(`/api/uploads/chunked/${uploadId}/complete`);
  } catch (err) {
    apiPost(`/api/uploads/chunked/${uploadId}/abort`).catch(() => {});
    throw err;
  }
}

async function putPart(
  base: string, token: string | null, uploadId: string,
  index: number, body: any, b64: boolean, attempts = 3,
) {
  const url = `${base}/api/uploads/chunked/${uploadId}/part/${index}${b64 ? "?b64=1" : ""}`;
  const headers: Record<string, string> = {
    "Content-Type": b64 ? "text/plain" : "application/octet-stream",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let lastErr: any;
  for (let a = 0; a < attempts; a++) {
    try {
      const res = await fetch(url, { method: "PUT", headers, body });
      if (res.ok) return;
      lastErr = new Error(`part ${index} failed (${res.status})`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 500 * (a + 1)));
  }
  throw lastErr;
}
