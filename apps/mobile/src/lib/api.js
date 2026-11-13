// API client mirroring apps/web/src/lib/api.ts: every call goes to the Nihongo
// Class API with the signed-in user's Firebase ID token (Decision 17 — the app
// never reads Firestore itself).
import Constants from "expo-constants";
import { auth } from "../config/firebase";
import { queryString } from "./url";

const extra = Constants.expoConfig?.extra ?? Constants.manifest2?.extra ?? Constants.manifest?.extra ?? {};
export const API_URL = (extra.apiUrl ?? "http://localhost:3000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field errors from a zod validation error, keyed by path. */
  fieldErrors() {
    const out = {};
    for (const i of this.details?.issues ?? []) if (!out[i.path]) out[i.path] = i.message;
    return out;
  }
}

const NETWORK_MESSAGE = "Couldn't reach the server. Check your connection and try again.";

/**
 * Called from the auth layer. Any 401 / unauthorized / missing_id_token response
 * is funnelled through this so the app can sign the user out.
 */
let onUnauthorized = null;
export function setOnUnauthorized(fn) { onUnauthorized = typeof fn === "function" ? fn : null; }

async function authHeaders() {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function maybeReportUnauthorized(status, code) {
  if (status === 401 || code === "unauthorized" || code === "missing_id_token") {
    try { onUnauthorized?.(); } catch {}
  }
}

/** Full API URL. Built as a string: React Native's URL class can't set query parameters (lib/url.js). */
export function apiUrl(path, query) {
  const qs = queryString(query);
  return `${API_URL}/api${path}${qs ? `${path.includes("?") ? "&" : "?"}${qs}` : ""}`;
}

async function toError(res) {
  const body = await res.json().catch(() => null);
  const err = body?.error
    ? new ApiError(res.status, body.error.code, body.error.message, body.error.details)
    : new ApiError(res.status, "http_error", res.status >= 500 ? "Something went wrong on our side. Try again." : "The request failed.");
  maybeReportUnauthorized(err.status, err.code);
  return err;
}

/** JSON call to the API with the current user's Firebase ID token. */
export async function api(path, { method, body, query, signal } = {}) {
  let res;
  try {
    res = await fetch(apiUrl(path, query), {
      method: method ?? (body !== undefined ? "POST" : "GET"),
      headers: { ...(await authHeaders()), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ApiError(0, "network", NETWORK_MESSAGE);
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined;
  return res.json();
}

/**
 * Multipart upload of one file (FR-3.12.8). `file` is a document-picker asset:
 * on a phone { uri, name, type } goes into the form; in a browser build the
 * picker also gives the real File (`file.file`), which is what a browser sends.
 * Extra form fields go in `fields`.
 */
export async function uploadFile(path, file, { fields = {}, fieldName = "file", query } = {}) {
  const form = new FormData();
  if (file.file) form.append(fieldName, file.file, file.name);
  else form.append(fieldName, { uri: file.uri, name: file.name, type: file.type ?? file.mimeType ?? "application/octet-stream" });
  for (const [k, v] of Object.entries(fields)) if (v != null) form.append(k, String(v));
  let res;
  try {
    res = await fetch(apiUrl(path, query), { method: "POST", headers: await authHeaders(), body: form });
  } catch {
    throw new ApiError(0, "network", "The upload was interrupted. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (body?.error) {
      maybeReportUnauthorized(res.status, body.error.code);
      throw new ApiError(res.status, body.error.code, body.error.message, body.error.details);
    }
    throw new ApiError(res.status, "http_error", res.status === 413 ? "This file is larger than the size limit." : "The upload failed. Try again.");
  }
  return res.status === 204 ? undefined : res.json();
}

export function errorMessage(err) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}
