import { randomUUID } from "node:crypto";
import { Router } from "express";
import { driveFolderCreateSchema, driveItemPatchSchema, fileTicketQuerySchema, type DriveItemDto, type DriveListingDto } from "@nihongo/shared";
import { z } from "zod";
import { env } from "../env";
import { db } from "../firebase";
import { col, type DriveItemDoc } from "../db";
import { currentUser, requireRole } from "../lib/auth";
import { badRequest, conflict, notFound } from "../lib/errors";
import { checkMaterialFile } from "../lib/fileTypes";
import { requestOrigin } from "../lib/origin";
import { limiter } from "../lib/rateLimit";
import { deleteObject, putFile } from "../lib/storage";
import { issueTicket } from "../lib/tickets";
import { iso, now } from "../lib/time";
import { originalName, requireFile, sanitizeFileName, uploadFiles } from "../lib/upload";
import { params, parse } from "../lib/validate";
import { isPremium, releaseStorage, reserveStorage, storageLimitBytes } from "../services/plan";

/**
 * My Drive: each teacher's private files. Files here and class materials they
 * upload share one quota: 500 MB free, 1 GB with Premium. Allowed types are the
 * same as class materials (no audio or video, decision 12).
 */
export const driveRouter = Router();
driveRouter.use("/drive", requireRole("teacher"));

function itemDto(id: string, d: DriveItemDoc): DriveItemDto {
  return {
    id,
    kind: d.kind,
    name: d.name,
    parentId: d.parentId ?? null,
    mimeType: d.mimeType ?? null,
    sizeBytes: d.sizeBytes ?? null,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

async function loadOwned(uid: string, id: string) {
  const snap = await col.driveItems().doc(id).get();
  const d = snap.data();
  if (!d || d.ownerUid !== uid) throw notFound("This file or folder doesn't exist.");
  return d;
}

async function assertFolder(uid: string, parentId: string | null | undefined) {
  if (!parentId) return;
  const parent = await loadOwned(uid, parentId);
  if (parent.kind !== "folder") throw badRequest("Choose a folder.", undefined, "not_a_folder");
}

const listQuery = z.object({ folderId: z.string().max(128).optional() });

driveRouter.get("/drive", async (req, res) => {
  const u = currentUser(req);
  const { folderId } = parse(listQuery, req.query);
  const parentId = folderId || null;
  let folder: DriveListingDto["folder"] = null;
  const path: DriveListingDto["path"] = [];
  if (parentId) {
    const f = await loadOwned(u.uid, parentId);
    if (f.kind !== "folder") throw badRequest("Choose a folder.", undefined, "not_a_folder");
    folder = { id: parentId, name: f.name };
    // Breadcrumb from the root to this folder.
    let cursor: string | null = parentId;
    for (let depth = 0; cursor && depth < 30; depth++) {
      const snap = await col.driveItems().doc(cursor).get();
      const d = snap.data();
      if (!d) break;
      path.unshift({ id: cursor, name: d.name });
      cursor = d.parentId;
    }
  }
  const snap = await col.driveItems().where("ownerUid", "==", u.uid).where("parentId", "==", parentId).limit(1000).get();
  const items = snap.docs
    .map((d) => itemDto(d.id, d.data()))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1));
  res.json({
    folder,
    path,
    items,
    usage: { usedBytes: Math.max(0, u.doc.storageUsedBytes ?? 0), limitBytes: storageLimitBytes(u.doc), premium: isPremium(u.doc) },
  } satisfies DriveListingDto);
});

driveRouter.post("/drive/folders", async (req, res) => {
  const u = currentUser(req);
  const body = parse(driveFolderCreateSchema, req.body);
  await assertFolder(u.uid, body.parentId);
  const ref = col.driveItems().doc();
  const doc: DriveItemDoc = { ownerUid: u.uid, kind: "folder", name: body.name, parentId: body.parentId ?? null, createdAt: now(), updatedAt: now() };
  await ref.set(doc);
  res.status(201).json(itemDto(ref.id, doc));
});

const fileUpload = uploadFiles("file", { maxBytes: env.MATERIAL_MAX_FILE_MB * 1024 * 1024 });

/** One file per request, so each upload gets its own progress bar. */
driveRouter.post("/drive/files", limiter("drive-upload", 300), fileUpload, async (req, res) => {
  const u = currentUser(req);
  const file = requireFile(req);
  const { parentId } = parse(z.object({ parentId: z.string().max(128).optional() }), req.body);
  await assertFolder(u.uid, parentId);
  const name = sanitizeFileName(originalName(file));
  const checked = await checkMaterialFile(file.path, name);
  const ref = col.driveItems().doc();
  const storagePath = `drive/${u.uid}/${ref.id}-${randomUUID().slice(0, 8)}`;
  await reserveStorage(u.uid, file.size);
  try {
    await putFile(file.path, storagePath, checked.mime);
    const doc: DriveItemDoc = {
      ownerUid: u.uid,
      kind: "file",
      name,
      parentId: parentId || null,
      mimeType: checked.mime,
      sizeBytes: file.size,
      storagePath,
      createdAt: now(),
      updatedAt: now(),
    };
    await ref.set(doc);
    res.status(201).json(itemDto(ref.id, doc));
  } catch (err) {
    await deleteObject(storagePath);
    await releaseStorage(u.uid, file.size);
    throw err;
  }
});

driveRouter.patch("/drive/:id", async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const body = parse(driveItemPatchSchema, req.body);
  const item = await loadOwned(u.uid, id);
  const update: Partial<DriveItemDoc> = { updatedAt: now() };
  if (body.name) update.name = item.kind === "file" ? sanitizeFileName(body.name) : body.name;
  if (body.parentId !== undefined) {
    await assertFolder(u.uid, body.parentId);
    // A folder can't move into itself or one of its own subfolders.
    let cursor = body.parentId;
    for (let depth = 0; cursor && depth < 30; depth++) {
      if (cursor === id) throw conflict("A folder can't go inside itself.", "invalid_move");
      cursor = (await col.driveItems().doc(cursor).get()).data()?.parentId ?? null;
    }
    update.parentId = body.parentId;
  }
  await col.driveItems().doc(id).update(update);
  res.json(itemDto(id, { ...item, ...update }));
});

/** Deleting a folder deletes everything in it; freed space goes back to the quota. */
driveRouter.delete("/drive/:id", async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const root = await loadOwned(u.uid, id);
  const toDelete: { id: string; doc: DriveItemDoc }[] = [{ id, doc: root }];
  for (let i = 0; i < toDelete.length && toDelete.length < 5000; i++) {
    if (toDelete[i].doc.kind !== "folder") continue;
    const children = await col.driveItems().where("ownerUid", "==", u.uid).where("parentId", "==", toDelete[i].id).get();
    children.docs.forEach((c) => toDelete.push({ id: c.id, doc: c.data() }));
  }
  let freed = 0;
  for (const item of toDelete) {
    if (item.doc.kind === "file") {
      await deleteObject(item.doc.storagePath);
      freed += item.doc.sizeBytes ?? 0;
    }
  }
  for (let i = 0; i < toDelete.length; i += 450) {
    const batch = db.batch();
    toDelete.slice(i, i + 450).forEach((item) => batch.delete(col.driveItems().doc(item.id)));
    await batch.commit();
  }
  await releaseStorage(u.uid, freed);
  res.status(204).end();
});

/** A short-lived link to open or download a file (same ticket system as class materials). */
driveRouter.post("/drive/:id/ticket", limiter("file-ticket", 120), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const q = parse(fileTicketQuerySchema, { ...req.query, ...(req.body ?? {}) });
  const item = await loadOwned(u.uid, id);
  if (item.kind !== "file") throw badRequest("Folders can't be downloaded.");
  const inline = q.disposition === "inline" && /^(application\/pdf|image\/(jpeg|png|webp))$/.test(item.mimeType ?? "");
  const { ticket, expiresAt } = issueTicket({ u: u.uid, k: "drive", m: id, d: inline ? "inline" : "attachment" });
  res.json({ url: `${requestOrigin(req)}/api/files/${ticket}`, expiresAt, disposition: inline ? "inline" : "attachment" });
});
