// Thin fetch wrapper around the shared FastAPI backend. All calls go through
// EXPO_PUBLIC_BACKEND_URL and carry the JWT via the Authorization header
// (the backend accepts a Bearer token as a fallback to its cookie session).
const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

let _token: string | null = null;

export function setAuthToken(t: string | null) {
  _token = t;
}

export function getBase(): string {
  return BASE as string;
}

export function getAuthToken(): string | null {
  return _token;
}

async function req(path: string, method: string, body?: any): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = data && (data.detail || data.message);
    const msg = typeof detail === "string" ? detail : `Request failed (${res.status})`;
    const err: any = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const apiGet = (p: string) => req(p, "GET");
export const apiPost = (p: string, b?: any) => req(p, "POST", b);
export const apiPatch = (p: string, b?: any) => req(p, "PATCH", b);
export const apiPut = (p: string, b?: any) => req(p, "PUT", b);
export const apiDelete = (p: string, b?: any) => req(p, "DELETE", b);

// Multipart upload (no JSON Content-Type — let fetch set the boundary).
export async function apiUpload(
  path: string,
  file: { uri: string; name: string; type: string },
  fields: Record<string, string> = {},
): Promise<any> {
  const form = new FormData();
  // React Native FormData accepts a {uri,name,type} object for file parts.
  form.append("file", file as any);
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  const headers: Record<string, string> = {};
  if (_token) headers["Authorization"] = `Bearer ${_token}`;
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: form });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = data && (data.detail || data.message);
    throw new Error(typeof detail === "string" ? detail : `Upload failed (${res.status})`);
  }
  return data;
}

// Authenticated file URL for <Image>/download (backend accepts ?auth= token).
export function fileUrl(id: string): string {
  return `${BASE}/api/files/${id}${_token ? `?auth=${_token}` : ""}`;
}
