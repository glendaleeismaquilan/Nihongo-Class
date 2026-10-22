import { Router } from "express";
import {
  LIMITS,
  contentDocRulesSchema,
  teacherFlashcardPatchSchema,
  teacherFlashcardSchema,
  teacherQuizPatchSchema,
  teacherQuizSchema,
  type ImportResultDto,
} from "@nihongo/shared";
import { z } from "zod";
import { db } from "../firebase";
import { col, type FlashcardDoc, type QuizDoc } from "../db";
import { assertClassAccess } from "../lib/access";
import { currentUser, requireRole, type AuthedUser } from "../lib/auth";
import { flashcardDto, quizDto } from "../lib/contentDto";
import { badRequest, notFound } from "../lib/errors";
import { buildTemplate, errorReport, flashcardColumns, parseFlashcardRows, parseQuizRows, quizColumns, readSheet } from "../lib/excel";
import { sendDownload, XLSX_MIME } from "../lib/http";
import { now } from "../lib/time";
import { readUpload, requireFile, uploadFiles } from "../lib/upload";
import { params, parse } from "../lib/validate";

export const teacherContentRouter = Router();

const staffRoles = requireRole("teacher", "school_admin");
const xlsxUpload = uploadFiles("file", { maxBytes: LIMITS.importMaxBytes });

async function assertLessonInClass(lessonId: string, classId: string) {
  const snap = await col.lessons().doc(lessonId).get();
  if (!snap.exists || snap.data()!.classId !== classId) throw badRequest("Choose a lesson from this class.", { issues: [{ path: "lessonId", message: "Choose a lesson from this class." }] }, "invalid_lesson");
}

/** Writes in batches of at most 500 operations (§7.4 Excel rules). */
export async function commitInBatches(writes: ((b: FirebaseFirestore.WriteBatch) => void)[]) {
  for (let i = 0; i < writes.length; i += LIMITS.batchSize) {
    const batch = db.batch();
    writes.slice(i, i + LIMITS.batchSize).forEach((w) => w(batch));
    await batch.commit();
  }
}

function teacherFlashcard(u: AuthedUser, classId: string, f: { lessonId: string; term: string; reading: string; meaning: string; exampleSentence?: string | null }): FlashcardDoc {
  const doc: FlashcardDoc = {
    term: f.term,
    reading: f.reading,
    meaning: f.meaning,
    exampleSentence: f.exampleSentence ?? null,
    source: "teacher",
    classId,
    lessonId: f.lessonId,
    level: null,
    // Teacher content is visible to the class as soon as it's saved (§6).
    status: "published",
    shuffleKey: Math.random(),
    createdBy: u.uid,
    createdAt: now(),
    updatedAt: now(),
  };
  contentDocRulesSchema.parse(doc);
  return doc;
}

// ---------- Flashcards (FR-3.3) ----------

const listQuery = z.object({ lessonId: z.string().max(128).optional() });

teacherContentRouter.get("/classes/:id/flashcards", staffRoles, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const q = parse(listQuery, req.query);
  await assertClassAccess(u, id, "staff");
  let query = col.flashcards().where("classId", "==", id);
  if (q.lessonId) query = query.where("lessonId", "==", q.lessonId);
  const snap = await query.orderBy("createdAt").limit(2000).get();
  res.json({ items: snap.docs.map((d) => flashcardDto(d.id, d.data())) });
});

/** FR-3.3.1: create a flashcard by hand in a lesson. */
teacherContentRouter.post("/classes/:id/flashcards", staffRoles, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const body = parse(teacherFlashcardSchema, req.body);
  await assertClassAccess(u, id, "staff", { write: true });
  await assertLessonInClass(body.lessonId, id);
  const ref = col.flashcards().doc();
  const doc = teacherFlashcard(u, id, body);
  await ref.set(doc);
  res.status(201).json(flashcardDto(ref.id, doc));
});

/** FR-3.3.3 / FR-3.3.4: import valid rows, report each invalid row. */
teacherContentRouter.post("/classes/:id/flashcards/import", staffRoles, xlsxUpload, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const { lessonId } = parse(z.object({ lessonId: z.string().min(1).max(128) }), req.body);
  await assertClassAccess(u, id, "staff", { write: true });
  await assertLessonInClass(lessonId, id);
  const file = requireFile(req, "an .xlsx file");
  const rows = readSheet(await readUpload(file), flashcardColumns.required, flashcardColumns.optional);
  const { valid, errors } = parseFlashcardRows(rows, false);
  const refs = valid.map(() => col.flashcards().doc());
  await commitInBatches(valid.map((row, i) => (b) => b.set(refs[i], teacherFlashcard(u, id, { lessonId, ...row }))));
  const result: ImportResultDto = { imported: valid.length, errors, ids: refs.map((r) => r.id) };
  if (errors.length) result.errorReport = errorReport(errors, rows);
  res.status(valid.length ? 201 : 200).json(result);
});

async function loadTeacherFlashcard(id: string) {
  const snap = await col.flashcards().doc(id).get();
  const doc = snap.data();
  if (!doc || doc.source !== "teacher") throw notFound("Flashcard not found.");
  return doc;
}

teacherContentRouter.patch("/flashcards/:id", staffRoles, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const body = parse(teacherFlashcardPatchSchema, req.body);
  const doc = await loadTeacherFlashcard(id);
  await assertClassAccess(u, doc.classId!, "staff", { write: true });
  if (body.lessonId) await assertLessonInClass(body.lessonId, doc.classId!);
  const update: Partial<FlashcardDoc> = { ...body, updatedAt: now() };
  if ("exampleSentence" in body) update.exampleSentence = body.exampleSentence ?? null;
  await col.flashcards().doc(id).update(update);
  res.json(flashcardDto(id, { ...doc, ...update }));
});

teacherContentRouter.delete("/flashcards/:id", staffRoles, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const doc = await loadTeacherFlashcard(id);
  await assertClassAccess(u, doc.classId!, "staff", { write: true });
  await col.flashcards().doc(id).delete();
  res.status(204).end();
});

// ---------- Quizzes (FR-3.4) ----------

function teacherQuiz(u: AuthedUser, classId: string, q: { lessonId: string; title: string; questions: QuizDoc["questions"]; passingScorePct: number }): QuizDoc {
  const doc: QuizDoc = {
    title: q.title,
    questions: q.questions.map((x) => ({ text: x.text, choices: [...x.choices], correctIndex: x.correctIndex })),
    source: "teacher",
    classId,
    lessonId: q.lessonId,
    level: null,
    status: "published",
    passingScorePct: q.passingScorePct,
    shuffleKey: Math.random(),
    createdBy: u.uid,
    createdAt: now(),
    updatedAt: now(),
  };
  contentDocRulesSchema.parse(doc);
  return doc;
}

teacherContentRouter.get("/classes/:id/quizzes", staffRoles, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const q = parse(listQuery, req.query);
  await assertClassAccess(u, id, "staff");
  let query = col.quizzes().where("classId", "==", id);
  if (q.lessonId) query = query.where("lessonId", "==", q.lessonId);
  const snap = await query.orderBy("createdAt").limit(500).get();
  res.json({ items: snap.docs.map((d) => quizDto(d.id, d.data())) });
});

/** FR-3.4.1: a title, then questions with four choices and exactly one correct. */
teacherContentRouter.post("/classes/:id/quizzes", staffRoles, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const body = parse(teacherQuizSchema, req.body);
  await assertClassAccess(u, id, "staff", { write: true });
  await assertLessonInClass(body.lessonId, id);
  const ref = col.quizzes().doc();
  const doc = teacherQuiz(u, id, body);
  await ref.set(doc);
  res.status(201).json(quizDto(ref.id, doc));
});

/** FR-3.4.3 / FR-3.4.4: one file creates one quiz from its valid rows. */
teacherContentRouter.post("/classes/:id/quizzes/import", staffRoles, xlsxUpload, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const form = parse(
    z.object({ lessonId: z.string().min(1).max(128), title: z.string().trim().min(1, { error: "Enter a quiz title." }).max(200), passingScorePct: z.coerce.number().int().min(1).max(100).default(60) }),
    req.body,
  );
  await assertClassAccess(u, id, "staff", { write: true });
  await assertLessonInClass(form.lessonId, id);
  const file = requireFile(req, "an .xlsx file");
  const rows = readSheet(await readUpload(file), quizColumns.required, quizColumns.optional);
  const { valid, errors } = parseQuizRows(rows, false);
  const result: ImportResultDto = { imported: valid.length, errors, ids: [] };
  if (valid.length) {
    const ref = col.quizzes().doc();
    await ref.set(teacherQuiz(u, id, { lessonId: form.lessonId, title: form.title, passingScorePct: form.passingScorePct, questions: valid }));
    result.quizId = ref.id;
    result.ids = [ref.id];
  }
  if (errors.length) result.errorReport = errorReport(errors, rows);
  res.status(valid.length ? 201 : 200).json(result);
});

async function loadTeacherQuiz(id: string) {
  const snap = await col.quizzes().doc(id).get();
  const doc = snap.data();
  if (!doc || doc.source !== "teacher") throw notFound("Quiz not found.");
  return doc;
}

teacherContentRouter.get("/quizzes/:id", staffRoles, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const doc = await loadTeacherQuiz(id);
  await assertClassAccess(u, doc.classId!, "staff");
  res.json(quizDto(id, doc));
});

teacherContentRouter.patch("/quizzes/:id", staffRoles, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const body = parse(teacherQuizPatchSchema, req.body);
  const doc = await loadTeacherQuiz(id);
  await assertClassAccess(u, doc.classId!, "staff", { write: true });
  if (body.lessonId) await assertLessonInClass(body.lessonId, doc.classId!);
  const update: Partial<QuizDoc> = { updatedAt: now() };
  if (body.lessonId) update.lessonId = body.lessonId;
  if (body.title) update.title = body.title;
  if (body.passingScorePct) update.passingScorePct = body.passingScorePct;
  if (body.questions) update.questions = body.questions.map((x) => ({ text: x.text, choices: [...x.choices], correctIndex: x.correctIndex }));
  await col.quizzes().doc(id).update(update);
  res.json(quizDto(id, { ...doc, ...update }));
});

teacherContentRouter.delete("/quizzes/:id", staffRoles, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const doc = await loadTeacherQuiz(id);
  await assertClassAccess(u, doc.classId!, "staff", { write: true });
  await col.quizzes().doc(id).delete();
  res.status(204).end();
});

// ---------- Templates (FR-3.3.2, FR-3.4.2, FR-3.5.3) ----------

teacherContentRouter.get("/templates/:kind", requireRole("teacher", "school_admin", "content_admin"), (req, res) => {
  const u = currentUser(req);
  const { kind } = parse(z.object({ kind: z.enum(["flashcards", "quiz"]) }), params(req));
  // The variant follows the caller's role.
  const variant = u.role === "content_admin" ? "builtin" : "teacher";
  const name = `nihongo-class-${kind === "flashcards" ? "flashcard" : "quiz"}-template${variant === "builtin" ? "-library" : ""}.xlsx`;
  sendDownload(res, buildTemplate(kind, variant), name, XLSX_MIME);
});
