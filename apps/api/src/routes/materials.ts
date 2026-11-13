import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import {
  LIMITS,
  fileTicketQuerySchema,
  materialCreateSchema,
  materialLinkSchema,
  materialPatchSchema,
  type MaterialDto,
  type MaterialViewsDto,
} from "@nihongo/shared";
import { env } from "../env";
import { db } from "../firebase";
import { col, materialViewId, type AttachmentDoc, type MaterialDoc } from "../db";
import { assertClassAccess, type ClassAccess } from "../lib/access";
import { currentUser, requireRole, type AuthedUser } from "../lib/auth";
import { badRequest, conflict, notFound } from "../lib/errors";
import { checkMaterialFile } from "../lib/fileTypes";
import { notify } from "../lib/notify";
import { requestOrigin } from "../lib/origin";
import { limiter } from "../lib/rateLimit";
import { deleteObject, deletePrefix, putFile } from "../lib/storage";
import { issueTicket } from "../lib/tickets";
import { iso, isoOrNull, now } from "../lib/time";
import { originalName, requireFile, sanitizeFileName, uploadFiles } from "../lib/upload";
import { params, parse } from "../lib/validate";
import { peopleRefs } from "./classes";
import { releaseStorage, reserveStorage } from "../services/plan";

export const materialsRouter = Router();
const staff = requireRole("teacher", "school_admin");
const member = requireRole("teacher", "school_admin", "student");

export function materialDto(id: string, d: MaterialDoc, extra: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id,
    classId: d.classId,
    lessonId: d.lessonId ?? null,
    sessionId: d.sessionId ?? null,
    title: d.title,
    description: d.description ?? null,
    // Storage paths never leave the server (FR-3.12.5).
    attachments: d.attachments.map((a) => ({ id: a.id, kind: a.kind, name: a.name, mimeType: a.mimeType ?? null, sizeBytes: a.sizeBytes ?? null, url: a.kind === "link" ? (a.url ?? null) : null })),
    status: d.status,
    pinned: d.pinned,
    publishedAt: isoOrNull(d.publishedAt),
    createdBy: d.createdBy,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
    ...extra,
  };
}

async function loadMaterial(id: string) {
  const snap = await col.materials().doc(id).get();
  if (!snap.exists) throw notFound("Material not found.");
  return snap.data()!;
}

/**
 * Staff of the class, or (for published materials) an actively enrolled
 * student. Used by every material route, the ticket route, and file delivery.
 */
export async function assertMaterialAccess(u: AuthedUser, m: MaterialDoc, opts: { write?: boolean } = {}): Promise<ClassAccess> {
  const access = await assertClassAccess(u, m.classId, opts.write ? "staff" : "member", { write: opts.write });
  if (!access.isStaff && m.status !== "published") throw notFound("Material not found.");
  return access;
}

async function assertRefsInClass(classId: string, lessonId?: string | null, sessionId?: string | null) {
  if (lessonId) {
    const l = (await col.lessons().doc(lessonId).get()).data();
    if (!l || l.classId !== classId) throw badRequest("Choose a lesson from this class.", undefined, "invalid_lesson");
  }
  if (sessionId) {
    const s = (await col.liveSessions().doc(sessionId).get()).data();
    if (!s || s.classId !== classId) throw badRequest("Choose a live class from this class.", undefined, "invalid_session");
  }
}

async function activeStudentIds(classId: string) {
  const snap = await col.enrollments().where("classId", "==", classId).where("status", "==", "active").get();
  return snap.docs.map((d) => d.data().uid);
}

// ---------- List (FR-3.12.4, FR-3.12.6) ----------

materialsRouter.get("/classes/:id/materials", member, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const { isStaff } = await assertClassAccess(u, id, "member");
  let query = col.materials().where("classId", "==", id);
  if (!isStaff) query = query.where("status", "==", "published");
  const snap = await query.limit(500).get();
  let items: MaterialDto[];
  if (isStaff) {
    const [students, views] = await Promise.all([activeStudentIds(id), col.materialViews().where("classId", "==", id).get()]);
    const active = new Set(students);
    items = snap.docs.map((d) => {
      const opened = new Set(views.docs.filter((v) => v.data().materialId === d.id && active.has(v.data().uid)).map((v) => v.data().uid));
      return materialDto(d.id, d.data(), { openedCount: opened.size, studentCount: students.length });
    });
  } else {
    const viewSnaps = snap.empty ? [] : await db.getAll(...snap.docs.map((d) => col.materialViews().doc(materialViewId(d.id, u.uid))));
    const viewed = new Set(viewSnaps.filter((v) => v.exists).map((v) => (v.data() as { materialId: string }).materialId));
    items = snap.docs.map((d) => materialDto(d.id, d.data(), { viewed: viewed.has(d.id) }));
  }
  // Pinned first, then newest.
  items.sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt));
  res.json({ items });
});

// ---------- Create and edit (FR-3.12.1, FR-3.12.3, FR-3.12.7) ----------

/** Created as a draft first; files are uploaded one per request afterwards. */
materialsRouter.post("/classes/:id/materials", staff, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const body = parse(materialCreateSchema, req.body);
  const { cls } = await assertClassAccess(u, id, "staff", { write: true });
  await assertRefsInClass(id, body.lessonId, body.sessionId);
  const ref = col.materials().doc();
  const doc: MaterialDoc = {
    classId: id,
    schoolId: cls.schoolId,
    lessonId: body.lessonId ?? null,
    sessionId: body.sessionId ?? null,
    title: body.title,
    description: body.description ?? null,
    attachments: [],
    status: "draft",
    pinned: false,
    publishedAt: null,
    createdBy: u.uid,
    createdAt: now(),
    updatedAt: now(),
  };
  await ref.set(doc);
  res.status(201).json(materialDto(ref.id, doc));
});

materialsRouter.get("/materials/:id", member, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const m = await loadMaterial(id);
  await assertMaterialAccess(u, m);
  res.json(materialDto(id, m));
});

materialsRouter.patch("/materials/:id", staff, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const body = parse(materialPatchSchema, req.body);
  const m = await loadMaterial(id);
  const { cls } = await assertMaterialAccess(u, m, { write: true });
  await assertRefsInClass(m.classId, body.lessonId, body.sessionId);
  const update: Partial<MaterialDoc> = { updatedAt: now() };
  if (body.title) update.title = body.title;
  if (body.description !== undefined) update.description = body.description || null;
  if (body.lessonId !== undefined) update.lessonId = body.lessonId;
  if (body.sessionId !== undefined) update.sessionId = body.sessionId;
  if (body.pinned !== undefined) update.pinned = body.pinned;
  const publishing = body.status === "published" && m.status !== "published";
  if (body.status) update.status = body.status;
  if (publishing) {
    // Use the incoming description if the request set it (empty counts as cleared),
    // otherwise the stored one. `update.description ?? m.description` masked a clear.
    const nextDescription = body.description !== undefined ? update.description : m.description;
    if (!m.attachments.length && !nextDescription) throw conflict("Add a file, a link, or a description before publishing.", "material_empty");
    update.publishedAt = now();
  }
  await col.materials().doc(id).update(update);
  if (publishing) {
    // FR-3.12.3: publishing notifies active students in-app.
    await notify(await activeStudentIds(m.classId), {
      type: "material.published",
      title: `New material in ${cls.name}`,
      body: update.title ?? m.title,
      link: `/s/classes/${m.classId}/materials`,
    });
  }
  res.json(materialDto(id, { ...m, ...update }));
});

/** FR-3.12.7: deleting removes the material's files from Storage. */
materialsRouter.delete("/materials/:id", staff, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const m = await loadMaterial(id);
  await assertMaterialAccess(u, m, { write: true });
  await deletePrefix(`classes/${m.classId}/materials/${id}/`);
  await col.materials().doc(id).delete();
  // Give the uploaders their storage back.
  for (const a of m.attachments) if (a.kind === "file") await releaseStorage(a.uploadedBy, a.sizeBytes);
  const views = await col.materialViews().where("materialId", "==", id).get();
  const batch = db.batch();
  views.docs.forEach((v) => batch.delete(v.ref));
  await batch.commit();
  res.status(204).end();
});

// ---------- Attachments (FR-3.12.2, FR-3.12.8) ----------

const fileUpload = uploadFiles("file", { maxBytes: env.MATERIAL_MAX_FILE_MB * 1024 * 1024 });
const multipartOnly = (req: Request, res: Response, next: NextFunction) => (req.is("multipart/form-data") ? fileUpload(req, res, next) : next());

/** One file per multipart request, or a JSON link { kind: "link", name, url }. */
materialsRouter.post("/materials/:id/attachments", staff, multipartOnly, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const m = await loadMaterial(id);
  await assertMaterialAccess(u, m, { write: true });
  if (m.attachments.length >= LIMITS.materialMaxAttachments) {
    throw conflict(`A material can have up to ${LIMITS.materialMaxAttachments} files and links.`, "too_many_attachments");
  }
  const attId = randomUUID().replace(/-/g, "").slice(0, 16);
  let attachment: AttachmentDoc;
  if (req.file) {
    const file = requireFile(req);
    const name = sanitizeFileName(originalName(file));
    const checked = await checkMaterialFile(file.path, name);
    const storagePath = `classes/${m.classId}/materials/${id}/${attId}-${name}`;
    // A teacher's uploads count toward their storage (500 MB free, 1 GB Premium).
    const counted = await reserveStorage(u.uid, file.size);
    try {
      await putFile(file.path, storagePath, checked.mime);
    } catch (err) {
      if (counted) await releaseStorage(u.uid, file.size);
      throw err;
    }
    attachment = { id: attId, kind: "file", name, mimeType: checked.mime, sizeBytes: file.size, storagePath, uploadedBy: counted ? u.uid : null };
  } else {
    const link = parse(materialLinkSchema, req.body);
    attachment = { id: attId, kind: "link", name: link.name, url: link.url };
  }
  const updated = await db
    .runTransaction(async (tx) => {
      const ref = col.materials().doc(id);
      const fresh = (await tx.get(ref)).data()!;
      if (fresh.attachments.length >= LIMITS.materialMaxAttachments) {
        throw conflict(`A material can have up to ${LIMITS.materialMaxAttachments} files and links.`, "too_many_attachments");
      }
      const attachments = [...fresh.attachments, attachment];
      tx.update(ref, { attachments, updatedAt: now() });
      return { ...fresh, attachments };
    })
    .catch(async (err) => {
      if (attachment.storagePath) {
        await deleteObject(attachment.storagePath);
        await releaseStorage(attachment.uploadedBy, attachment.sizeBytes);
      }
      throw err;
    });
  res.status(201).json(materialDto(id, updated));
});

materialsRouter.delete("/materials/:id/attachments/:attId", staff, async (req, res) => {
  const u = currentUser(req);
  const { id, attId } = params(req);
  const m = await loadMaterial(id);
  await assertMaterialAccess(u, m, { write: true });
  const att = m.attachments.find((a) => a.id === attId);
  if (!att) throw notFound("Attachment not found.");
  const attachments = m.attachments.filter((a) => a.id !== attId);
  await col.materials().doc(id).update({ attachments, updatedAt: now() });
  if (att.storagePath) {
    await deleteObject(att.storagePath);
    await releaseStorage(att.uploadedBy, att.sizeBytes);
  }
  res.json(materialDto(id, { ...m, attachments }));
});

// ---------- Delivery (FR-3.12.5, FR-3.12.9) ----------

const INLINE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

materialsRouter.post("/materials/:id/attachments/:attId/ticket", member, limiter("file-ticket", 120), async (req, res) => {
  const u = currentUser(req);
  const { id, attId } = params(req);
  const q = parse(fileTicketQuerySchema, { ...req.query, ...(req.body ?? {}) });
  const m = await loadMaterial(id);
  await assertMaterialAccess(u, m);
  const att = m.attachments.find((a) => a.id === attId && a.kind === "file");
  if (!att) throw notFound("File not found.");
  // PDFs and images preview in the app; other files always download (FR-3.12.4).
  const disposition = q.disposition === "inline" && INLINE_TYPES.has(att.mimeType ?? "") ? "inline" : "attachment";
  const { ticket, expiresAt } = issueTicket({ u: u.uid, k: "material", m: id, a: attId, d: disposition });
  res.json({ url: `${requestOrigin(req)}/api/files/${ticket}`, expiresAt, disposition });
});

/** Opening a material upserts materialViews/{materialId}_{uid} (FR-3.12.6). */
materialsRouter.post("/materials/:id/view", member, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const m = await loadMaterial(id);
  const { isStaff } = await assertMaterialAccess(u, m);
  if (isStaff) {
    res.status(204).end();
    return;
  }
  const ref = col.materialViews().doc(materialViewId(id, u.uid));
  await db.runTransaction(async (tx) => {
    const prev = (await tx.get(ref)).data();
    tx.set(ref, { materialId: id, classId: m.classId, uid: u.uid, firstViewedAt: prev?.firstViewedAt ?? now(), lastViewedAt: now(), viewCount: (prev?.viewCount ?? 0) + 1 });
  });
  res.status(204).end();
});

/** FR-3.12.6: "Opened by X of Y" and who hasn't opened it yet. */
materialsRouter.get("/materials/:id/views", staff, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const m = await loadMaterial(id);
  await assertMaterialAccess(u, m);
  const [students, views] = await Promise.all([activeStudentIds(m.classId), col.materialViews().where("materialId", "==", id).get()]);
  const people = await peopleRefs(students);
  const byUid = new Map(views.docs.map((v) => [v.data().uid, v.data()]));
  const out: MaterialViewsDto = {
    total: students.length,
    opened: students
      .filter((s) => byUid.has(s))
      .map((s) => {
        const v = byUid.get(s)!;
        return { uid: s, name: people.get(s)?.name ?? "Student", firstViewedAt: iso(v.firstViewedAt), lastViewedAt: iso(v.lastViewedAt), viewCount: v.viewCount };
      }),
    notOpened: students.filter((s) => !byUid.has(s)).map((s) => ({ uid: s, name: people.get(s)?.name ?? "Student" })),
  };
  res.json(out);
});
