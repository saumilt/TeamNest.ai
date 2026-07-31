import { api } from "@/lib/api";

// Client-side chunked/resumable upload. Splits a File into fixed-size parts,
// PUTs each part (with retry) to the backend, then calls /complete to assemble
// and store the final object. Bypasses the single-request proxy body limit so
// large files (incl. .zip) can be uploaded with progress + retry.
const PART_SIZE = 8 * 1024 * 1024; // 8MB

export async function uploadFileChunked(file, { chatId, projectFolderId, onProgress } = {}) {
  const totalParts = Math.max(1, Math.ceil(file.size / PART_SIZE));
  const { data: init } = await api.post("/uploads/chunked/init", {
    filename: file.name,
    size: file.size,
    total_parts: totalParts,
    chat_id: chatId || null,
    project_folder_id: projectFolderId || null,
  });
  const uploadId = init.upload_id;

  try {
    for (let i = 0; i < totalParts; i++) {
      const start = i * PART_SIZE;
      const blob = file.slice(start, Math.min(start + PART_SIZE, file.size));
      await uploadPartWithRetry(uploadId, i, blob);
      onProgress?.(Math.round(((i + 1) / totalParts) * 100));
    }
    const { data } = await api.post(`/uploads/chunked/${uploadId}/complete`);
    return data;
  } catch (err) {
    api.post(`/uploads/chunked/${uploadId}/abort`).catch(() => {});
    throw err;
  }
}

async function uploadPartWithRetry(uploadId, index, blob, attempts = 3) {
  let lastErr;
  for (let a = 0; a < attempts; a++) {
    try {
      await api.put(`/uploads/chunked/${uploadId}/part/${index}`, blob, {
        headers: { "Content-Type": "application/octet-stream" },
      });
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * (a + 1)));
    }
  }
  throw lastErr;
}

// Threshold above which the chat composer routes uploads through the chunked
// path (small files keep the simpler single-request endpoint).
export const CHUNKED_THRESHOLD = 15 * 1024 * 1024;
