import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import {
  AUDIO_FILE_HEADER,
  JLPT_LEVELS,
  LIMITS,
  builtinFlashcardPatchSchema,
  builtinFlashcardSchema,
  builtinQuizPatchSchema,
  builtinQuizSchema,
  contentDocRulesSchema,
  jlptLevelSchema,
  listeningTestPatchSchema,
  listeningTestSchema,
  publishSchema,
  readingTestPatchSchema,
  readingTestSchema,
  type ImportResultDto,
  type JlptLevel,
  type LibraryOverviewDto,
  type LibraryType,
} from "@nihongo/shared";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { col, type FlashcardDoc, type ListeningTestDoc, type QuestionDoc, type QuizDoc, type ReadingTestDoc } from "../db";
import { currentUser, requireRole } from "../lib/auth";
import { flashcardDto, listeningTestDto, quizDto, readingTestDto } from "../lib/contentDto";
import { badRequest, conflict, notFound } from "../lib/errors";
import { errorReport, flashcardColumns, parseFlashcardRows, parseQuizRows, quizColumns, readSheet } from "../lib/excel";
import { checkAudio } from "../lib/fileTypes";
import { deleteObject, putPublicAudio } from "../lib/storage";
import { now } from "../lib/time";
import { originalName, readUpload, requireFile, sanitizeFileName, uploadFiles } from "../lib/upload";
import { params, parse } from "../lib/validate";
import { commitInBatches } from "./teacherContent";

export const libraryRouter = Router();
libraryRouter.use("/library", requireRole("content_admin"));

const typeSchema = z.enum(["flashcards", "quizzes", "reading-tests", "listening-tests"]);

function collectionFor(type: LibraryType) {
  switch (type) {
    case "flashcards":
      return col.flashcards();
    case "quizzes":
      return col.quizzes();
    case "reading-tests":
      return col.readingTests();
    case "listening-tests":
      return col.listeningTests();
  }
}

function toDto(type: LibraryType, id: string, data: unknown) {
  switch (type) {
    case "flashcards":
      return flashcardDto(id, data as FlashcardDoc);
    case "quizzes":
      return quizDto(id, data as QuizDoc);
    case "reading-tests":
      return readingTestDto(id, data as ReadingTestDoc);
    case "listening-tests":
      return listeningTestDto(id, data as ListeningTestDoc);
  }
}

const usesSource = (type: LibraryType) => type === "flashcards" || type === "quizzes";

async function loadItem(type: LibraryType, id: string) {
  const snap = await (collectionFor(type) as FirebaseFirestore.CollectionReference).doc(id).get();
  const data = snap.data();
  if (!data || (usesSource(type) && data.source !== "builtin")) throw notFound("Library item not found.");
  return data;
}

function typeOf(req: Request): LibraryType {
  return parse(typeSchema, params(req).type);
}

// ---------- Overview (library counts per level, drafts) ----------

libraryRouter.get("/library/overview", async (_req, res) => {
  const levels = {} as LibraryOverviewDto["levels"];
  await Promise.all(
    JLPT_LEVELS.map(async (level) => {
      const [f, q, r, l, fd, qd, rd, ld] = await Promise.all([
        col.flashcards().where("source", "==", "builtin").where("level", "==", level).count().get(),
        col.quizzes().where("source", "==", "builtin").where("level", "==", level).count().get(),
        col.readingTests().where("level", "==", level).count().get(),
        col.listeningTests().where("level", "==", level).count().get(),
        col.flashcards().where("source", "==", "builtin").where("level", "==", level).where("status", "==", "draft").count().get(),
        col.quizzes().where("source", "==", "builtin").where("level", "==", level).where("status", "==", "draft").count().get(),
        col.readingTests().where("level", "==", level).where("status", "==", "draft").count().get(),
        col.listeningTests().where("level", "==", level).where("status", "==", "draft").count().get(),
      ]);
      levels[level] = {
        flashcards: f.data().count,
        quizzes: q.data().count,
        readingTests: r.data().count,
        listeningTests: l.data().count,
        drafts: fd.data().count + qd.data().count + rd.data().count + ld.data().count,
      };
    }),
  );
  res.json({ levels } satisfies LibraryOverviewDto);
});

// ---------- List and read ----------

const listQuery = z.object({
  level: jlptLevelSchema.optional(),
  status: z.enum(["draft", "published"]).optional(),
  batch: z.string().max(64).optional(),
  cursor: z.string().max(128).optional(),
});

libraryRouter.get("/library/:type", async (req, res) => {
  const type = typeOf(req);
  const q = parse(listQuery, req.query);
  const ref = collectionFor(type) as FirebaseFirestore.CollectionReference;
  let query: FirebaseFirestore.Query = ref;
  if (usesSource(type)) query = query.where("source", "==", "builtin");
  if (q.batch) query = query.where("importBatchId", "==", q.batch);
  if (q.level) query = query.where("level", "==", q.level);
  if (q.status) query = query.where("status", "==", q.status);
  // An import batch is reviewed in file order; everything else newest first.
  query = q.batch ? query.orderBy("createdAt", "asc") : query.orderBy("createdAt", "desc");
  if (q.cursor) {
    const c = await ref.doc(q.cursor).get();
    if (c.exists) query = query.startAfter(c);
  }
  const pageSize = q.batch ? LIMITS.importMaxRows : LIMITS.pageSize;
  const snap = await query.limit(pageSize).get();
  res.json({ items: snap.docs.map((d) => toDto(type, d.id, d.data())), nextCursor: snap.size === pageSize ? snap.docs[snap.size - 1].id : null });
});

libraryRouter.get("/library/:type/:id", async (req, res) => {
  const type = typeOf(req);
  const { id } = params(req);
  res.json(toDto(type, id, await loadItem(type, id)));
});

// ---------- Create (FR-3.5.1, FR-3.5.2, FR-3.5.4, FR-3.5.5) ----------

function stripQuestions(questions: { text: string; choices: string[]; correctIndex: number }[]): QuestionDoc[] {
  return questions.map((q) => ({ text: q.text, choices: [...q.choices], correctIndex: q.correctIndex }));
}

libraryRouter.post("/library/:type", async (req, res) => {
  const type = typeOf(req);
  const u = currentUser(req);
  const base = { createdBy: u.uid, createdAt: now(), updatedAt: now() };
  const ref = (collectionFor(type) as FirebaseFirestore.CollectionReference).doc();
  let doc: FlashcardDoc | QuizDoc | ReadingTestDoc | ListeningTestDoc;
  if (type === "flashcards") {
    const b = parse(builtinFlashcardSchema, req.body);
    doc = { term: b.term, reading: b.reading, meaning: b.meaning, exampleSentence: b.exampleSentence ?? null, level: b.level, status: b.status, source: "builtin", classId: null, lessonId: null, shuffleKey: Math.random(), ...base };
  } else if (type === "quizzes") {
    const b = parse(builtinQuizSchema, req.body);
    // Audio is attached afterwards through the audio route, never by URL.
    doc = { title: b.title, level: b.level, status: b.status, passingScorePct: b.passingScorePct, questions: stripQuestions(b.questions), source: "builtin", classId: null, lessonId: null, shuffleKey: Math.random(), ...base };
  } else if (type === "reading-tests") {
    const b = parse(readingTestSchema, req.body);
    doc = { title: b.title, level: b.level, passage: b.passage, status: b.status, passingScorePct: b.passingScorePct, questions: stripQuestions(b.questions), ...base };
  } else {
    const b = parse(listeningTestSchema, req.body);
    // FR-3.5.5: a listening test needs its clip before it can be published.
    doc = { title: b.title, level: b.level, status: "draft", passingScorePct: b.passingScorePct, questions: stripQuestions(b.questions), audioUrl: null, ...base };
  }
  if (usesSource(type)) contentDocRulesSchema.parse(doc);
  await ref.set(doc);
  res.status(201).json(toDto(type, ref.id, doc));
});

// ---------- Update ----------

/** Keeps each question's existing audio when questions are edited or reordered. */
function mergeQuestionAudio(previous: QuestionDoc[], next: { text: string; choices: string[]; correctIndex: number; audioUrl?: string }[]): QuestionDoc[] {
  const byUrl = new Map(previous.filter((q) => q.audioUrl).map((q) => [q.audioUrl!, q]));
  return next.map((q) => {
    const kept = q.audioUrl ? byUrl.get(q.audioUrl) : undefined;
    return {
      text: q.text,
      choices: [...q.choices],
      correctIndex: q.correctIndex,
      ...(kept ? { audioUrl: kept.audioUrl, audioPath: kept.audioPath ?? null, audioFileName: kept.audioFileName ?? null } : {}),
      ...(kept?.expectedAudioName ? { expectedAudioName: kept.expectedAudioName } : {}),
    };
  });
}

libraryRouter.patch("/library/:type/:id", async (req, res) => {
  const type = typeOf(req);
  const { id } = params(req);
  const existing = await loadItem(type, id);
  const ref = (collectionFor(type) as FirebaseFirestore.CollectionReference).doc(id);
  const update: Record<string, unknown> = { updatedAt: now() };
  const removed: (string | null | undefined)[] = [];
  if (type === "flashcards") {
    const b = parse(builtinFlashcardPatchSchema, req.body);
    const { removeAudio, ...rest } = b;
    Object.assign(update, rest);
    if (b.exampleSentence !== undefined) update.exampleSentence = b.exampleSentence || null;
    if (removeAudio) {
      removed.push(existing.audioPath);
      Object.assign(update, { audioUrl: null, audioPath: null, audioMimeType: null, audioFileName: null });
    }
  } else if (type === "quizzes") {
    const b = parse(builtinQuizPatchSchema, req.body);
    const { questions, ...rest } = b;
    Object.assign(update, rest);
    if (questions) {
      const merged = mergeQuestionAudio(existing.questions, questions);
      const keptPaths = new Set(merged.map((q) => q.audioPath).filter(Boolean));
      removed.push(...(existing.questions as QuestionDoc[]).map((q) => q.audioPath).filter((p) => p && !keptPaths.has(p)));
      update.questions = merged;
    }
  } else if (type === "reading-tests") {
    const b = parse(readingTestPatchSchema, req.body);
    Object.assign(update, b, b.questions ? { questions: stripQuestions(b.questions) } : {});
  } else {
    const b = parse(listeningTestPatchSchema, req.body);
    Object.assign(update, b, b.questions ? { questions: stripQuestions(b.questions) } : {});
  }
  await ref.update(update);
  await Promise.all(removed.map((p) => deleteObject(p)));
  const fresh = (await ref.get()).data();
  res.json(toDto(type, id, fresh));
});

libraryRouter.delete("/library/:type/:id", async (req, res) => {
  const type = typeOf(req);
  const { id } = params(req);
  const existing = await loadItem(type, id);
  await (collectionFor(type) as FirebaseFirestore.CollectionReference).doc(id).delete();
  const paths = [existing.audioPath, ...((existing.questions as QuestionDoc[] | undefined) ?? []).map((q) => q.audioPath)];
  await Promise.all(paths.map((p) => deleteObject(p)));
  res.status(204).end();
});

// ---------- Publish (FR-3.5.7) ----------

libraryRouter.post("/library/:type/:id/publish", async (req, res) => {
  const type = typeOf(req);
  const { id } = params(req);
  const { status } = parse(publishSchema, req.body ?? {});
  const existing = await loadItem(type, id);
  if (status === "published" && type === "listening-tests" && !existing.audioUrl) {
    throw conflict("Add the listening clip before publishing this test.", "audio_required");
  }
  const ref = (collectionFor(type) as FirebaseFirestore.CollectionReference).doc(id);
  await ref.update({ status, updatedAt: now() });
  res.json(toDto(type, id, { ...existing, status }));
});

// ---------- Audio (FR-3.5.1, FR-3.5.2, FR-3.5.3, FR-3.5.5) ----------

const audioUpload = uploadFiles("file", { maxBytes: LIMITS.audioMaxBytes });

libraryRouter.post("/library/:type/:id/audio", audioUpload, async (req, res) => {
  const type = typeOf(req);
  const { id } = params(req);
  if (type === "reading-tests") throw badRequest("Reading tests have no audio.");
  // A recording sends its full MIME type (with codecs) as mimeType; multer keeps only the base type.
  const form = parse(z.object({ questionIndex: z.coerce.number().int().min(0).max(199).optional(), fileName: z.string().max(200).optional(), mimeType: z.string().max(100).optional() }), req.body);
  const existing = await loadItem(type, id);
  const file = requireFile(req, "an audio file");
  const name = sanitizeFileName(form.fileName || originalName(file));
  const checked = await checkAudio(file.path, name, form.mimeType || file.mimetype);
  const storagePath = `builtin/audio/${type}/${id}/${randomUUID()}.${checked.ext}`;
  const ref = (collectionFor(type) as FirebaseFirestore.CollectionReference).doc(id);

  let previousPath: string | null | undefined;
  if (type === "quizzes") {
    if (form.questionIndex === undefined) throw badRequest("Choose which question this audio belongs to.");
    const questions = existing.questions as QuestionDoc[];
    if (form.questionIndex >= questions.length) throw badRequest("That question doesn't exist.");
    previousPath = questions[form.questionIndex].audioPath;
    const url = await putPublicAudio(file.path, storagePath, checked.mime);
    // Decision 7: stored on the correct answer, shown only after submission.
    questions[form.questionIndex] = { ...questions[form.questionIndex], audioUrl: url, audioPath: storagePath, audioFileName: name };
    await ref.update({ questions, updatedAt: now() });
  } else {
    previousPath = existing.audioPath;
    const url = await putPublicAudio(file.path, storagePath, checked.mime);
    await ref.update({ audioUrl: url, audioPath: storagePath, audioMimeType: checked.mime, audioFileName: name, updatedAt: now() });
  }
  if (previousPath) await deleteObject(previousPath);
  res.json(toDto(type, id, (await ref.get()).data()));
});

libraryRouter.delete("/library/:type/:id/audio", async (req, res) => {
  const type = typeOf(req);
  const { id } = params(req);
  const q = parse(z.object({ questionIndex: z.coerce.number().int().min(0).optional() }), req.query);
  const existing = await loadItem(type, id);
  const ref = (collectionFor(type) as FirebaseFirestore.CollectionReference).doc(id);
  if (type === "quizzes") {
    const questions = existing.questions as QuestionDoc[];
    const i = q.questionIndex ?? -1;
    if (!questions[i]) throw badRequest("That question doesn't exist.");
    await deleteObject(questions[i].audioPath);
    questions[i] = { text: questions[i].text, choices: questions[i].choices, correctIndex: questions[i].correctIndex };
    await ref.update({ questions, updatedAt: now() });
  } else {
    if (type === "listening-tests" && existing.status === "published") throw conflict("Unpublish the test before removing its clip.", "audio_required");
    await deleteObject(existing.audioPath);
    await ref.update({ audioUrl: null, audioPath: null, audioMimeType: null, audioFileName: null, updatedAt: now() });
  }
  res.json(toDto(type, id, (await ref.get()).data()));
});

// ---------- Bulk import (FR-3.5.3, decision 10) ----------

const xlsxUpload = uploadFiles("file", { maxBytes: LIMITS.importMaxBytes });

libraryRouter.post("/library/:type/import", xlsxUpload, async (req, res) => {
  const type = typeOf(req);
  const u = currentUser(req);
  if (type !== "flashcards" && type !== "quizzes") throw badRequest("Only flashcards and quizzes can be imported from Excel.");
  const form = parse(
    z.object({
      level: jlptLevelSchema,
      title: z.string().trim().max(200).optional(),
      passingScorePct: z.coerce.number().int().min(1).max(100).default(60),
    }),
    req.body,
  );
  const level: JlptLevel = form.level;
  const file = requireFile(req, "an .xlsx file");
  const buffer = await readUpload(file);
  const batchId = randomUUID();
  const base = { createdBy: u.uid, updatedAt: now(), importBatchId: batchId };
  let result: ImportResultDto;

  if (type === "flashcards") {
    const rows = readSheet(buffer, flashcardColumns.required, [...flashcardColumns.optional, AUDIO_FILE_HEADER]);
    const { valid, errors } = parseFlashcardRows(rows, true);
    const refs = valid.map(() => col.flashcards().doc());
    const start = Date.now();
    await commitInBatches(
      valid.map((r, i) => (b) =>
        b.set(refs[i], {
          term: r.term,
          reading: r.reading,
          meaning: r.meaning,
          exampleSentence: r.exampleSentence,
          expectedAudioName: r.audioFileName,
          source: "builtin",
          level,
          classId: null,
          lessonId: null,
          // Imported items land as drafts on the review screen.
          status: "draft",
          shuffleKey: Math.random(),
          ...base,
          // Preserve file order for the review screen.
          createdAt: Timestamp.fromMillis(start + i),
        } satisfies FlashcardDoc),
      ),
    );
    result = { imported: valid.length, errors, ids: refs.map((r) => r.id), batchId };
    if (errors.length) result.errorReport = errorReport(errors, rows);
  } else {
    if (!form.title) throw badRequest("Enter a quiz title.", { issues: [{ path: "title", message: "Enter a quiz title." }] }, "validation_error");
    const rows = readSheet(buffer, quizColumns.required, [AUDIO_FILE_HEADER]);
    const { valid, errors } = parseQuizRows(rows, true);
    result = { imported: valid.length, errors, ids: [], batchId };
    if (valid.length) {
      const ref = col.quizzes().doc();
      await ref.set({
        title: form.title,
        level,
        questions: valid.map((r) => ({ text: r.text, choices: [...r.choices], correctIndex: r.correctIndex, ...(r.audioFileName ? { expectedAudioName: r.audioFileName } : {}) })),
        source: "builtin",
        classId: null,
        lessonId: null,
        status: "draft",
        passingScorePct: form.passingScorePct,
        shuffleKey: Math.random(),
        ...base,
        createdAt: now(),
      } satisfies QuizDoc);
      result.ids = [ref.id];
      result.quizId = ref.id;
    }
    if (errors.length) result.errorReport = errorReport(errors, rows);
  }
  res.status(result.imported ? 201 : 200).json(result);
});

/** Publishes every draft in an import batch at once (review screen). */
libraryRouter.post("/library/:type/batch/:batchId/publish", async (req, res) => {
  const type = typeOf(req);
  const { batchId } = params(req);
  if (type !== "flashcards" && type !== "quizzes") throw badRequest("Only imported flashcards and quizzes have batches.");
  const ref = collectionFor(type) as FirebaseFirestore.CollectionReference;
  const snap = await ref.where("importBatchId", "==", batchId).where("status", "==", "draft").get();
  await commitInBatches(snap.docs.map((d) => (b) => b.update(d.ref, { status: "published", updatedAt: now() })));
  res.json({ published: snap.size });
});

