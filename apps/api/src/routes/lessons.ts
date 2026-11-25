import { Router } from "express";
import { lessonCreateSchema, lessonPatchSchema } from "@nihongo/shared";
import { db } from "../firebase";
import { col, type LessonDoc } from "../db";
import { assertClassAccess } from "../lib/access";
import { currentUser, requireRole } from "../lib/auth";
import { lessonDto } from "../lib/contentDto";
import { badRequest, conflict, notFound } from "../lib/errors";
import { params, parse } from "../lib/validate";
import { notifyNewContent } from "../services/contentNotify";

export const lessonsRouter = Router();

async function lessonsOf(classId: string) {
  const snap = await col.lessons().where("classId", "==", classId).orderBy("order").get();
  return snap.docs;
}

/** Decision 9: simple lessons (title, order) per class. */
lessonsRouter.get("/classes/:id/lessons", requireRole("teacher", "school_admin", "student"), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const { isStaff } = await assertClassAccess(u, id, "member");
  const docs = await lessonsOf(id);
  const items = await Promise.all(
    docs.map(async (d) => {
      const dto = lessonDto(d.id, d.data());
      if (isStaff) {
        const [f, q] = await Promise.all([
          col.flashcards().where("lessonId", "==", d.id).count().get(),
          col.quizzes().where("lessonId", "==", d.id).count().get(),
        ]);
        dto.counts = { flashcards: f.data().count, quizzes: q.data().count };
      }
      return dto;
    }),
  );
  res.json({ items });
});

lessonsRouter.post("/classes/:id/lessons", requireRole("teacher", "school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const body = parse(lessonCreateSchema, req.body);
  await assertClassAccess(u, id, "staff", { write: true });
  const docs = await lessonsOf(id);
  const ref = col.lessons().doc();
  const doc: LessonDoc = { classId: id, title: body.title, description: body.description ?? null, order: docs.length ? docs[docs.length - 1].data().order + 1 : 0 };
  await ref.set(doc);
  await notifyNewContent(id, { type: "lesson.created", heading: "New lesson", body: doc.title });
  res.status(201).json(lessonDto(ref.id, doc));
});

async function loadLesson(id: string) {
  const snap = await col.lessons().doc(id).get();
  if (!snap.exists) throw notFound("Lesson not found.");
  return snap.data()!;
}

lessonsRouter.patch("/lessons/:id", requireRole("teacher", "school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const body = parse(lessonPatchSchema, req.body);
  const lesson = await loadLesson(id);
  await assertClassAccess(u, lesson.classId, "staff", { write: true });
  const update: Partial<LessonDoc> = {};
  if (body.title) update.title = body.title;
  if (body.description !== undefined) update.description = body.description || null;
  if (body.order !== undefined) {
    // Reorder: move this lesson to the new position and renumber the rest.
    const docs = (await lessonsOf(lesson.classId)).filter((d) => d.id !== id);
    const target = Math.min(Math.max(body.order, 0), docs.length);
    const ordered = [...docs.slice(0, target).map((d) => d.id), id, ...docs.slice(target).map((d) => d.id)];
    const batch = db.batch();
    ordered.forEach((lessonId, order) => batch.update(col.lessons().doc(lessonId), lessonId === id ? { ...update, order } : { order }));
    await batch.commit();
  } else if (Object.keys(update).length) {
    await col.lessons().doc(id).update(update);
  } else throw badRequest("Nothing to change.");
  const fresh = await loadLesson(id);
  res.json(lessonDto(id, fresh));
});

lessonsRouter.delete("/lessons/:id", requireRole("teacher", "school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const lesson = await loadLesson(id);
  await assertClassAccess(u, lesson.classId, "staff", { write: true });
  const [f, q, m] = await Promise.all([
    col.flashcards().where("lessonId", "==", id).limit(1).get(),
    col.quizzes().where("lessonId", "==", id).limit(1).get(),
    col.materials().where("lessonId", "==", id).limit(1).get(),
  ]);
  if (!f.empty || !q.empty || !m.empty) {
    throw conflict("Move or delete this lesson's flashcards, quizzes, and materials before deleting it.", "lesson_not_empty");
  }
  await col.lessons().doc(id).delete();
  res.status(204).end();
});
