import { open } from "node:fs/promises";
import { fileTypeFromBuffer } from "file-type";
import { AUDIO_FILE_TYPES, MATERIAL_FILE_TYPES } from "@nihongo/shared";
import { badRequest } from "./errors";
import { extensionOf } from "./upload";

export interface CheckedType {
  ext: string;
  mime: string;
}

async function head(path: string, bytes = 64 * 1024): Promise<Buffer> {
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

function looksLikeText(buf: Buffer): boolean {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf.length === 64 * 1024 ? buf.subarray(0, buf.length - 4) : buf);
    return true;
  } catch {
    return false;
  }
}

const AUDIO_DETECTED: Record<string, string> = { mp3: "mp3", m4a: "m4a", mp4: "m4a", wav: "wav", ogg: "ogg", oga: "ogg", opus: "ogg", webm: "webm", mka: "webm" };

/**
 * §7.5 audio: mp3, m4a, wav, ogg, webm up to 10 MB. Checks magic bytes and the
 * extension. Returns the MIME type to store: the browser's own type for a
 * recording when it matches the container (§14 Browsers), else the standard one.
 */
export async function checkAudio(path: string, name: string, clientType: string | undefined): Promise<CheckedType> {
  const detected = await fileTypeFromBuffer(await head(path));
  const kind = detected ? AUDIO_DETECTED[detected.ext] : undefined;
  const ext = extensionOf(name);
  const extKind = AUDIO_DETECTED[ext];
  if (!kind) throw badRequest(`${name}: this isn't an audio file we accept. Use MP3, M4A, WAV, OGG, or WebM.`, undefined, "invalid_file_type");
  if (ext && extKind && extKind !== kind && !(kind === "webm" && extKind === "ogg")) {
    throw badRequest(`${name}: the file contents don't match its .${ext} extension.`, undefined, "invalid_file_type");
  }
  const spec = AUDIO_FILE_TYPES.find((t) => t.ext === kind)!;
  const baseClient = (clientType ?? "").split(";")[0].trim();
  const mime = baseClient.startsWith("audio/") && baseClient === spec.mime ? clientType!.trim() : spec.mime;
  return { ext: kind === "m4a" ? "m4a" : kind, mime };
}

const OOXML = new Set(["docx", "pptx", "xlsx"]);
const CFB = new Set(["doc", "ppt", "xls"]);

/**
 * FR-3.12.2: PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, TXT, JPG, PNG, WEBP.
 * Office Open XML files are ZIP containers, legacy Office files are CFB, and
 * TXT has no signature, so those are checked by container plus extension.
 */
export async function checkMaterialFile(path: string, name: string): Promise<CheckedType> {
  return checkAgainst(path, name, MATERIAL_FILE_TYPES, "PDF, Word, PowerPoint, Excel, text, JPG, PNG, or WebP files");
}

async function checkAgainst(path: string, name: string, allowed: { ext: string; mime: string }[], what: string): Promise<CheckedType> {
  const ext = extensionOf(name);
  const spec = allowed.find((t) => t.ext === ext);
  if (!spec) throw badRequest(`${name}: this file type isn't allowed. Upload ${what}.`, undefined, "invalid_file_type");
  const buf = await head(path);
  const detected = await fileTypeFromBuffer(buf);
  let ok: boolean;
  if (ext === "txt") ok = !detected && looksLikeText(buf);
  else if (OOXML.has(ext)) ok = detected?.ext === ext || detected?.ext === "zip";
  else if (CFB.has(ext)) ok = detected?.ext === "cfb" || detected?.mime === spec.mime;
  else if (ext === "jpg" || ext === "jpeg") ok = detected?.ext === "jpg";
  else ok = detected?.ext === ext;
  if (!ok) throw badRequest(`${name}: the file contents don't match its .${ext} extension.`, undefined, "invalid_file_type");
  return { ext, mime: spec.mime };
}
