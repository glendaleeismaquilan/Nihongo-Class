import type { ActivityDto, ActivityType, AttemptResultDto, JlptLevel, ReviewItemDto } from "@nihongo/shared";
import { db } from "../firebase";
import { col, progressId, type AttemptDoc, type ProgressDoc, type QuestionDoc } from "../db";
import { assertClassAccess } from "../lib/access";
import type { AuthedUser } from "../lib/auth";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { now } from "../lib/time";

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  level: JlptLevel | null;
  classId: string | null;
  schoolId: string | null;
  builtin: boolean;
  status: "draft" | "published";
  passingScorePct: number;
  questions: QuestionDoc[];
  passage?: string;
  audioUrl?: string | null;
}

export async function loadActivity(type: ActivityType, id: string): Promise<Activity> {
  if (type === "quiz") {
    const d = (await col.quizzes().doc(id).get()).data();
    if (!d) throw notFound("Quiz not found.");
    let schoolId: string | null = null;
    if (d.classId) schoolId = (await col.classes().doc(d.classId).get()).data()?.schoolId ?? null;
    return { id, type, title: d.title, level: d.level ?? null, classId: d.classId ?? null, schoolId, builtin: d.source === "builtin", status: d.status, passingScorePct: d.passingScorePct, questions: d.questions };
  }
  if (type === "reading") {
    const d = (await col.readingTests().doc(id).get()).data();
    if (!d) throw notFound("Reading test not found.");
    return { id, type, title: d.title, level: d.level, classId: null, schoolId: null, builtin: true, status: d.status, passingScorePct: d.passingScorePct, questions: d.questions, passage: d.passage };
  }
  const d = (await col.listeningTests().doc(id).get()).data();
  if (!d) throw notFound("Listening test not found.");
  return { id, type, title: d.title, level: d.level, classId: null, schoolId: null, builtin: true, status: d.status, passingScorePct: d.passingScorePct, questions: d.questions, audioUrl: d.audioUrl ?? null };
}

/**
 * Students may take a class quiz only with an active enrollment (FR-3.13.6),
 * and built-in items only once published (FR-3.5.7).
 */
export async function assertCanTake(u: AuthedUser, a: Activity) {
  if (u.role !== "student") throw forbidden("Only students take quizzes and tests.", "wrong_role");
  if (a.classId) {
    await assertClassAccess(u, a.classId, "student");
  } else if (a.status !== "published") {
    throw notFound("This activity isn't available.");
  }
}

/** Decision 6 and 7: no correctIndex and no answer audio before submission. */
export function studentActivityDto(a: Activity): ActivityDto {
  return {
    id: a.id,
    type: a.type,
    title: a.title,
    level: a.level,
    classId: a.classId,
    passingScorePct: a.passingScorePct,
    ...(a.passage ? { passage: a.passage } : {}),
    // The listening clip is the question material, not an answer.
    ...(a.type === "listening" && a.audioUrl ? { audioUrl: a.audioUrl } : {}),
    questions: a.questions.map((q) => ({ text: q.text, choices: [...q.choices] })),
  };
}

/** FR-3.6.4 / FR-3.7.2 / FR-3.8.3: grade on the server. */
export function grade(a: Activity, answers: (number | null)[]) {
  if (answers.length !== a.questions.length) {
    throw badRequest(`Send one answer per question (${a.questions.length}); use null for a skipped question.`, undefined, "answer_count");
  }
  const review: ReviewItemDto[] = a.questions.map((q, i) => {
    const yourAnswer = answers[i] ?? null;
    const item: ReviewItemDto = { text: q.text, choices: [...q.choices], yourAnswer, correctIndex: q.correctIndex, correct: yourAnswer === q.correctIndex };
    // Decision 7: answer audio appears only after submission, built-in quizzes only.
    if (a.type === "quiz" && a.builtin && q.audioUrl) item.audioUrl = q.audioUrl;
    return item;
  });
  const correctCount = review.filter((r) => r.correct).length;
  const total = a.questions.length;
  const score = total ? Math.round((correctCount / total) * 100) : 0;
  return { review, correctCount, total, score, passed: score >= a.passingScorePct };
}

/**
 * FR-3.9.1 / decision 3: every attempt is stored in attempts/, and the
 * per-activity summary in progress/{uid}_{activityId} is updated in the same
 * transaction.
 */
export async function recordAttempt(u: AuthedUser, a: Activity, answers: (number | null)[]): Promise<AttemptResultDto> {
  const g = grade(a, answers);
  const attemptRef = col.attempts().doc();
  const progressRef = col.progress().doc(progressId(u.uid, a.id));
  const submittedAt = now();
  const attempt: AttemptDoc = {
    uid: u.uid,
    activityId: a.id,
    activityType: a.type,
    title: a.title,
    classId: a.classId,
    schoolId: a.schoolId ?? u.schoolId,
    answers: answers.map((x) => x ?? null),
    correctCount: g.correctCount,
    total: g.total,
    score: g.score,
    passed: g.passed,
    submittedAt,
  };
  const summary = await db.runTransaction(async (tx) => {
    const prev = (await tx.get(progressRef)).data();
    const next: ProgressDoc = {
      uid: u.uid,
      activityType: a.type,
      activityId: a.id,
      title: a.title,
      score: g.score,
      passed: g.passed,
      submittedAt,
      bestScore: Math.max(prev?.bestScore ?? 0, g.score),
      attemptCount: (prev?.attemptCount ?? 0) + 1,
      classId: a.classId,
    };
    tx.set(attemptRef, attempt);
    tx.set(progressRef, next);
    return next;
  });
  return {
    attemptId: attemptRef.id,
    activityId: a.id,
    activityType: a.type,
    title: a.title,
    score: g.score,
    correctCount: g.correctCount,
    total: g.total,
    passed: g.passed,
    passingScorePct: a.passingScorePct,
    bestScore: summary.bestScore,
    attemptCount: summary.attemptCount,
    review: g.review,
  };
}
