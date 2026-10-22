import { mkdirSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Request, RequestHandler } from "express";
import multer from "multer";
import { badRequest } from "./errors";

const UPLOAD_DIR = join(tmpdir(), "nihongo-class-uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({ destination: UPLOAD_DIR });

/**
 * §14: multer disk storage with size and count limits on every upload route.
 * Temp files are removed when the response finishes.
 */
export function uploadFiles(field: string, opts: { maxBytes: number; maxCount?: number }): RequestHandler {
  const m = multer({
    storage,
    // Browsers send UTF-8 file names; keep Japanese names intact.
    defParamCharset: "utf8",
    limits: { fileSize: opts.maxBytes, files: opts.maxCount ?? 1, fields: 20, fieldSize: 64 * 1024 },
  });
  const handler = (opts.maxCount ?? 1) > 1 ? m.array(field, opts.maxCount) : m.single(field);
  return (req, res, next) => {
    res.on("finish", () => void cleanup(req));
    res.on("close", () => void cleanup(req));
    handler(req, res, next);
  };
}

async function cleanup(req: Request) {
  const files: Express.Multer.File[] = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);
  await Promise.all(files.map((f) => rm(f.path, { force: true }).catch(() => undefined)));
}

export function requireFile(req: Request, what = "a file"): Express.Multer.File {
  if (!req.file) throw badRequest(`Choose ${what} to upload.`, undefined, "file_required");
  return req.file;
}

export const readUpload = (f: Express.Multer.File) => readFile(f.path);

/** The uploaded file name as sent by the browser (UTF-8). */
export const originalName = (f: Express.Multer.File) => f.originalname;

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

/**
 * §14: keep Japanese characters, strip path separators and control characters.
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/[\\/]/g, "_")
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 150);
  return cleaned || "file";
}
