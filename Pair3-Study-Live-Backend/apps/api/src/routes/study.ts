import { Router } from "express";
import { AggregateField } from "firebase-admin/firestore";
import {
  ACTIVITY_TYPES,
  LIMITS,
  computeStreak,
  dateKey,
  studyLibraryQuerySchema,
  submitAttemptSchema,
  type AttemptSummaryDto,
  type ClassStudyDto,
  type ProgressMeDto,
  type StudyCardDto,
  type StudyItemDto,
  type StudyLibraryDto,
} from "@nihongo/shared";
import { z } from "zod";
import { db } from "../firebase";
import { col, progressId, type AttemptDoc, type FlashcardDoc, type ProgressDoc } from "../db";
import { assertClassAccess } from "../lib/access";
import { currentUser, requireRole, type AuthedUser } from "../lib/auth";
import { iso } from "../lib/time";
import { params, parse } from "../lib/validate";
import { assertCanTake, loadActivity, recordAttempt, studentActivityDto } from "../services/grading";

export const studyRouter = Router();
const student = requireRole("student");

export function studyCard(id: string, d: FlashcardDoc): StudyCardDto {
  const card: StudyCardDto = { id, term: d.term, reading: d.reading, meaning: d.meaning, exampleSentence: d.exampleSentence ?? null };
  // FR-3.6.3: a listen control wherever audio exists; teacher cards never have it.
  if (d.source === "builtin" && d.audioUrl) card.audioUrl = d.audioUrl;
  return card;
}

async function progressFor(u: AuthedUser, ids: string[]): Promise<Map<string, ProgressDoc>> {
  if (!ids.length) return new Map();
  const snaps = await db.getAll(...ids.map((id) => col.progress().doc(progressId(u.uid, id))));
  return new Map(snaps.filter((s) => s.exists).map((s) => [(s.data() as ProgressDoc).activityId, s.data() as ProgressDoc]));
}

// ---------- Self-Study (FR-3.6.2, decision 8) ----------

studyRouter.get("/study/library", student, async (req, res) => {
  const u = currentUser(req);
  const q = parse(studyLibraryQuerySchema, req.query);
  const out: StudyLibraryDto = { level: q.level, type: q.type, total: 0, nextCursor: null };

  if (q.type === "flashcards") {
    const base = col.flashcards().where("source", "==", "builtin").where("level", "==", q.level).where("status", "==", "published");
    out.total = (await base.count().get()).data().count;
    if (q.shuffle) {
      // §7.6: a random deck from a random shuffleKey start, without reading every item.
      const start = Math.random();
      const first = await base.where("shuffleKey", ">=", start).orderBy("shuffleKey").limit(LIMITS.pageSize).get();
      let docs = first.docs;
      if (docs.length < LIMITS.pageSize) {
        const wrap = await base.where("shuffleKey", "<", start).orderBy("shuffleKey").limit(LIMITS.pageSize - docs.length).get();
        docs = [...docs, ...wrap.docs];
      }
      out.cards = docs.map((d) => studyCard(d.id, d.data())).sort(() => Math.random() - 0.5);
    } else {
      let query = base.orderBy("createdAt").limit(LIMITS.pageSize);
      if (q.cursor) {
        const c = await col.flashcards().doc(q.cursor).get();
        if (c.exists) query = query.startAfter(c);
      }
      const snap = await query.get();
      out.cards = snap.docs.map((d) => studyCard(d.id, d.data()));
      out.nextCursor = snap.size === LIMITS.pageSize ? snap.docs[snap.size - 1].id : null;
    }
    res.json(out);
    return;
  }

  const kind = q.type === "quizzes" ? "quiz" : q.type === "reading-tests" ? "reading" : "listening";
  const ref = (q.type === "quizzes" ? col.quizzes() : q.type === "reading-tests" ? col.readingTests() : col.listeningTests()) as FirebaseFirestore.CollectionReference;
  let base: FirebaseFirestore.Query = ref;
  if (q.type === "quizzes") base = base.where("source", "==", "builtin");
  base = base.where("level", "==", q.level).where("status", "==", "published");
  out.total = (await base.count().get()).data().count;
  let query = base.orderBy("createdAt").limit(LIMITS.pageSize);
  if (q.cursor) {
    const c = await ref.doc(q.cursor).get();
    if (c.exists) query = query.startAfter(c);
  }
  const snap = await query.get();
  const progress = await progressFor(u, snap.docs.map((d) => d.id));
  out.items = snap.docs.map((d) => {
    const data = d.data();
    const p = progress.get(d.id);
    return { id: d.id, type: kind, title: data.title, level: data.level, questionCount: data.questions.length, passingScorePct: data.passingScorePct, bestScore: p?.bestScore ?? null, attemptCount: p?.attemptCount ?? 0 } satisfies StudyItemDto;
  });
  out.nextCursor = snap.size === LIMITS.pageSize ? snap.docs[snap.size - 1].id : null;
  res.json(out);
});

// ---------- Class study (FR-3.6.1) ----------

/** Only this class's teacher content, with no audio fields and no built-in items. */
studyRouter.get("/classes/:id/study", student, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  await assertClassAccess(u, id, "student");
  const [lessons, cards, quizzes] = await Promise.all([
    col.lessons().where("classId", "==", id).orderBy("order").get(),
    col.flashcards().where("classId", "==", id).where("source", "==", "teacher").orderBy("createdAt").limit(3000).get(),
    col.quizzes().where("classId", "==", id).where("source", "==", "teacher").orderBy("createdAt").limit(500).get(),
  ]);
  const progress = await progressFor(u, quizzes.docs.map((d) => d.id));
  const out: ClassStudyDto = {
    classId: id,
    lessons: lessons.docs.map((l) => ({
      id: l.id,
      title: l.data().title,
      description: l.data().description ?? null,
      flashcards: cards.docs.filter((c) => c.data().lessonId === l.id).map((c) => studyCard(c.id, c.data())),
      quizzes: quizzes.docs
        .filter((q) => q.data().lessonId === l.id)
        .map((q) => {
          const p = progress.get(q.id);
          return { id: q.id, type: "quiz", title: q.data().title, level: null, lessonId: l.id, questionCount: q.data().questions.length, passingScorePct: q.data().passingScorePct, bestScore: p?.bestScore ?? null, attemptCount: p?.attemptCount ?? 0 } satisfies StudyItemDto;
        }),
    })),
  };
  res.json(out);
});

// ---------- Activities (FR-3.6.4, FR-3.7, FR-3.8) ----------

const activityParams = z.object({ type: z.enum(ACTIVITY_TYPES), id: z.string().min(1).max(128) });

studyRouter.get("/activities/:type/:id", student, async (req, res) => {
  const u = currentUser(req);
  const { type, id } = parse(activityParams, params(req));
  const activity = await loadActivity(type, id);
  await assertCanTake(u, activity);
  res.json(studentActivityDto(activity));
});

studyRouter.post("/activities/:type/:id/submit", student, async (req, res) => {
  const u = currentUser(req);
  const { type, id } = parse(activityParams, params(req));
  const body = parse(submitAttemptSchema, req.body);
  const activity = await loadActivity(type, id);
  await assertCanTake(u, activity);
  res.status(201).json(await recordAttempt(u, activity, body.answers));
});

// ---------- Progress (FR-3.9.2) ----------

export function attemptSummary(id: string, a: AttemptDoc): AttemptSummaryDto {
  return { id, activityId: a.activityId, activityType: a.activityType, title: a.title, classId: a.classId ?? null, score: a.score, correctCount: a.correctCount, total: a.total, passed: a.passed, submittedAt: iso(a.submittedAt) };
}

/** Decision 5: consecutive days with a graded attempt, in the user's time zone. */
export async function streakFor(uid: string, timeZone: string): Promise<number> {
  const snap = await col.attempts().where("uid", "==", uid).orderBy("submittedAt", "desc").select("submittedAt").limit(2000).get();
  const days = snap.docs.map((d) => dateKey(d.get("submittedAt").toDate(), timeZone));
  return computeStreak(days, dateKey(new Date(), timeZone));
}

studyRouter.get("/progress/me", student, async (req, res) => {
  const u = currentUser(req);
  const q = parse(z.object({ type: z.enum(ACTIVITY_TYPES).optional(), cursor: z.string().max(128).optional() }), req.query);
  const all = col.attempts().where("uid", "==", u.uid);
  let history = (q.type ? all.where("activityType", "==", q.type) : all).orderBy("submittedAt", "desc").limit(LIMITS.pageSize);
  if (q.cursor) {
    const c = await col.attempts().doc(q.cursor).get();
    if (c.exists && c.data()!.uid === u.uid) history = history.startAfter(c);
  }
  const [agg, page, streak, summaries] = await Promise.all([
    (q.type ? all.where("activityType", "==", q.type) : all).aggregate({ avg: AggregateField.average("score"), count: AggregateField.count() }).get(),
    history.get(),
    streakFor(u.uid, u.timeZone),
    col.progress().where("uid", "==", u.uid).orderBy("submittedAt", "desc").limit(200).get(),
  ]);
  const out: ProgressMeDto = {
    streak,
    averageScore: agg.data().avg == null ? null : Math.round(agg.data().avg! * 10) / 10,
    attemptCount: agg.data().count,
    history: page.docs.map((d) => attemptSummary(d.id, d.data())),
    nextCursor: page.size === LIMITS.pageSize ? page.docs[page.size - 1].id : null,
    summaries: summaries.docs
      .map((d) => d.data())
      .filter((p) => !q.type || p.activityType === q.type)
      .map((p) => ({ activityId: p.activityId, activityType: p.activityType, title: p.title, score: p.score, bestScore: p.bestScore, attemptCount: p.attemptCount, passed: p.passed, submittedAt: iso(p.submittedAt), classId: p.classId ?? null })),
  };
  res.json(out);
});
