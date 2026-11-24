import { auth } from "./firebase";

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { issues?: { path: string; message: string }[] } & Record<string, unknown>,
  ) {
    super(message);
  }

  /** Field errors from a zod validation error, keyed by path. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const i of this.details?.issues ?? []) if (!out[i.path]) out[i.path] = i.message;
    return out;
  }
}

/**
 * ngrok's free plan answers browser requests with a "You are about to visit" page
 * instead of the API's JSON unless this header is sent. The hosted website reaches
 * the laptop's API through the same ngrok address the Android app uses.
 */
export const TUNNEL_HEADERS: Record<string, string> = /\.ngrok(-free)?\.(app|dev|io)$/i.test(new URL(API_URL).hostname) ? { "ngrok-skip-browser-warning": "1" } : {};

async function authHeader(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return token ? { ...TUNNEL_HEADERS, Authorization: `Bearer ${token}` } : { ...TUNNEL_HEADERS };
}

async function toError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  if (body?.error) return new ApiError(res.status, body.error.code, body.error.message, body.error.details);
  return new ApiError(res.status, "http_error", res.status >= 500 ? "Something went wrong on our side. Try again." : "The request failed.");
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  keepalive?: boolean;
}

export function apiUrl(path: string, query?: RequestOptions["query"]) {
  const url = new URL(`${API_URL}/api${path}`);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  return url.toString();
}

/** JSON call to the API with the current user's Firebase ID token. */
export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path, opts.query), {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: { ...(await authHeader()), ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      keepalive: opts.keepalive,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "network", navigator.onLine ? "Couldn't reach the server. Check your connection and try again." : "You're offline. Reconnect to keep studying.");
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Downloads a binary response (exports, templates). */
export async function apiBlob(path: string, opts: RequestOptions = {}): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetch(apiUrl(path, opts.query), {
    method: opts.method ?? "GET",
    headers: { ...(await authHeader()), ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw await toError(res);
  return { blob: await res.blob(), filename: filenameOf(res) };
}

function filenameOf(res: Response): string | null {
  const cd = res.headers.get("Content-Disposition") ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const plain = /filename="([^"]+)"/i.exec(cd);
  return star ? decodeURIComponent(star[1]) : (plain?.[1] ?? null);
}

/**
 * A file link from the API (a short-lived ticket URL) that the browser can open.
 * Through the ngrok tunnel a plain link would show ngrok's warning page, so the file
 * is fetched with the skip header and handed over as a local blob URL instead.
 */
export async function openableUrl(url: string): Promise<{ url: string; filename: string | null }> {
  if (!TUNNEL_HEADERS["ngrok-skip-browser-warning"] || !url.startsWith(API_URL)) return { url, filename: null };
  const res = await fetch(url, { headers: TUNNEL_HEADERS });
  if (!res.ok) throw await toError(res);
  return { url: URL.createObjectURL(await res.blob()), filename: filenameOf(res) };
}

/** Multipart upload with a progress callback (FR-3.12.8). One file per request. */
export async function upload<T = unknown>(
  path: string,
  form: FormData,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  const headers = await authHeader();
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl(path));
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: any;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else if (body?.error) reject(new ApiError(xhr.status, body.error.code, body.error.message, body.error.details));
      else reject(new ApiError(xhr.status, "http_error", xhr.status === 413 ? "This file is larger than the size limit." : "The upload failed. Try again."));
    };
    xhr.onerror = () => reject(new ApiError(0, "network", "The upload was interrupted. Check your connection and try again."));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function base64ToBlob(b64: string, type: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}
