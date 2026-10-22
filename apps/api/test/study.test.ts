import { beforeAll, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { zonedTimeToUtc, dateKey, addDaysToKey } from "@nihongo/shared";
import { col } from "../src/db";
import { toneWav } from "../seed/tone";
import { api, bearer, createUser, createWorld, findKeys, seedClass, seedEnrollment, seedLesson, type TestUser, type World } from "./helpers";

let w: World;
let classId: string;
let lessonId: string;
let teacherQuizId: string;
let builtinQuizId: string;
let readingId: string;
let listeningId: string;

const q4 = (text: string, correctIndex: number) => ({ text, choices: ["A answer", "B answer", "C answer", "D answer"], correctIndex });

beforeAll(async () => {
  w = await createWorld();
  ({ classId } = await seedClass(w.schoolId, [w.teacher.uid]));
  lessonId = await seedLesson(classId, "Lesson 1");
  await seedEnrollment(classId, w.student.uid, w.schoolId);
  await api().post(`/api/classes/${classId}/flashcards`).set(bearer(w.teacher)).send({ lessonId, term: "犬", reading: "いぬ", meaning: "dog" });
  const tq = await api()
    .post(`/api/classes/${classId}/quizzes`)
    .set(bearer(w.teacher))
    .send({ lessonId, title: "Class quiz", passingScorePct: 60, questions: [q4("q1", 0), q4("q2", 1), q4("q3", 2), q4("q4", 3), q4("q5", 0)] });
  teacherQuizId = tq.body.id;

  const bq = await api().post("/api/library/quizzes").set(bearer(w.contentAdmin)).send({ level: "N5", title: "Built-in quiz", questions: [q4("b1", 0), q4("b2", 1)], status: "published" });
  builtinQuizId = bq.body.id;
  await api().post(`/api/library/quizzes/${builtinQuizId}/audio`).set(bearer(w.contentAdmin)).field("questionIndex", "0").attach("file", toneWav(), "answer.wav");
  const card = await api().post("/api/library/flashcards").set(bearer(w.contentAdmin)).send({ level: "N5", term: "猫", reading: "ねこ", meaning: "cat", status: "published" });
  await api().post(`/api/library/flashcards/${card.body.id}/audio`).set(bearer(w.contentAdmin)).attach("file", toneWav(), "neko.wav");
  await api().post("/api/library/flashcards").set(bearer(w.contentAdmin)).send({ level: "N5", term: "下書き", reading: "したがき", meaning: "draft", status: "draft" });
  const rt = await api().post("/api/library/reading-tests").set(bearer(w.contentAdmin)).send({ level: "N5", title: "Reading", passage: "わたしは学生です。", questions: [q4("r1", 1)], status: "published" });
  readingId = rt.body.id;
  const lt = await api().post("/api/library/listening-tests").set(bearer(w.contentAdmin)).send({ level: "N5", title: "Listening", questions: [q4("l1", 2)] });
  listeningId = lt.body.id;
  await api().post(`/api/library/listening-tests/${listeningId}/audio`).set(bearer(w.contentAdmin)).attach("file", toneWav(), "clip.wav");
  await api().post(`/api/library/listening-tests/${listeningId}/publish`).set(bearer(w.contentAdmin)).send({ status: "published" });
});

describe("Decisions 6 and 7: nothing before submission reveals answers", () => {
  it("Decision 6 / Decision 7 activity responses contain no correctIndex or answer audio", async () => {
    for (const [type, id] of [
      ["quiz", teacherQuizId],
      ["quiz", builtinQuizId],
      ["reading", readingId],
      ["listening", listeningId],
    ] as const) {
      const res = await api().get(`/api/activities/${type}/${id}`).set(bearer(w.student));
      expect(res.status).toBe(200);
      expect(findKeys(res.body, ["correctIndex", "correct", "audioPath", "audioFileName"])).toEqual([]);
      // Only a listening test carries audio, and only its clip at the top level.
      const audio = findKeys(res.body, ["audioUrl"]);
      expect(audio).toEqual(type === "listening" ? ["$.audioUrl"] : []);
    }
  });

  it("Decision 6 study lists never include answers", async () => {
    for (const type of ["quizzes", "reading-tests", "listening-tests"]) {
      const res = await api().get(`/api/study/library?level=N5&type=${type}`).set(bearer(w.student));
      expect(findKeys(res.body, ["correctIndex", "questions"])).toEqual([]);
    }
    const cls = await api().get(`/api/classes/${classId}/study`).set(bearer(w.student));
    expect(findKeys(cls.body, ["correctIndex"])).toEqual([]);
  });
});

describe("FR-3.6.1 / FR-3.3.5 class study", () => {
  it("FR-3.6.1 FR-3.3.5 class study contains no built-in items and no audio fields", async () => {
    const res = await api().get(`/api/classes/${classId}/study`).set(bearer(w.student));
    expect(res.status).toBe(200);
    const cards = res.body.lessons.flatMap((l: { flashcards: { term: string }[] }) => l.flashcards);
    expect(cards.map((c: { term: string }) => c.term)).toEqual(["犬"]);
    expect(findKeys(res.body, ["audioUrl", "audioMimeType", "audioFileName", "level"]).filter((p) => !p.endsWith(".level"))).toEqual([]);
    expect(findKeys(res.body, ["audioUrl"])).toEqual([]);
    const quizTitles = res.body.lessons.flatMap((l: { quizzes: { title: string }[] }) => l.quizzes.map((q) => q.title));
    expect(quizTitles).toEqual(["Class quiz"]);
  });

  it("FR-3.13.6 a pending or non-enrolled student gets 403 from class study and class quizzes", async () => {
    const pending = await createUser("student", { schoolId: w.schoolId });
    await seedEnrollment(classId, pending.uid, w.schoolId, { status: "removed" });
    const outsider = await createUser("student", { schoolId: w.schoolId });
    for (const who of [pending, outsider]) {
      expect((await api().get(`/api/classes/${classId}/study`).set(bearer(who))).status).toBe(403);
      expect((await api().get(`/api/activities/quiz/${teacherQuizId}`).set(bearer(who))).status).toBe(403);
      expect((await api().post(`/api/activities/quiz/${teacherQuizId}/submit`).set(bearer(who)).send({ answers: [0, 0, 0, 0, 0] })).status).toBe(403);
    }
  });
});

describe("FR-3.6.2 / FR-3.6.3 Self-Study", () => {
  it("FR-3.6.2 shows published built-in flashcards for the level, with audio (FR-3.6.3)", async () => {
    const res = await api().get("/api/study/library?level=N5&type=flashcards").set(bearer(w.student));
    const terms = res.body.cards.map((c: { term: string }) => c.term);
    expect(terms).toContain("猫");
    expect(terms).not.toContain("下書き");
    expect(terms).not.toContain("犬");
    expect(res.body.cards.find((c: { term: string }) => c.term === "猫").audioUrl).toBeTruthy();
    const shuffled = await api().get("/api/study/library?level=N5&type=flashcards&shuffle=true").set(bearer(w.student));
    expect(shuffled.body.cards.length).toBe(res.body.cards.length);
  });

  it("FR-3.6.2 other levels are separate", async () => {
    const res = await api().get("/api/study/library?level=N1&type=flashcards").set(bearer(w.student));
    expect(res.body.cards.map((c: { term: string }) => c.term)).not.toContain("猫");
  });

  it("SRS 5.2 only students use study routes", async () => {
    expect((await api().get("/api/study/library?level=N5&type=flashcards").set(bearer(w.teacher))).status).toBe(403);
  });
});

describe("FR-3.6.4 / FR-3.7.2 / FR-3.8.3 grading, FR-3.9.1 attempts", () => {
  let s: TestUser;
  beforeAll(async () => {
    s = await createUser("student", { schoolId: w.schoolId });
    await seedEnrollment(classId, s.uid, w.schoolId);
  });

  it("FR-3.6.4 grades on submit, returns the score and a review with correct answers", async () => {
    const res = await api().post(`/api/activities/quiz/${teacherQuizId}/submit`).set(bearer(s)).send({ answers: [0, 1, 2, 0, null] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ score: 60, correctCount: 3, total: 5, passed: true, passingScorePct: 60, attemptCount: 1, bestScore: 60 });
    expect(res.body.review[3]).toMatchObject({ yourAnswer: 0, correctIndex: 3, correct: false });
    expect(res.body.review[4]).toMatchObject({ yourAnswer: null, correct: false });
  });

  it("FR-3.9.1 records every attempt and keeps the progress summary in step", async () => {
    await api().post(`/api/activities/quiz/${teacherQuizId}/submit`).set(bearer(s)).send({ answers: [1, 1, 1, 1, 1] });
    const attempts = await col.attempts().where("uid", "==", s.uid).where("activityId", "==", teacherQuizId).get();
    expect(attempts.size).toBe(2);
    const progress = (await col.progress().doc(`${s.uid}_${teacherQuizId}`).get()).data()!;
    expect(progress).toMatchObject({ attemptCount: 2, bestScore: 60, score: 20, passed: false, activityType: "quiz", classId });
  });

  it("Decision 7 answer audio appears in the review after submission", async () => {
    const res = await api().post(`/api/activities/quiz/${builtinQuizId}/submit`).set(bearer(s)).send({ answers: [0, 0] });
    expect(res.body.review[0].audioUrl).toBeTruthy();
    expect(res.body.score).toBe(50);
  });

  it("FR-3.7.2 / FR-3.8.3 grades reading and listening tests", async () => {
    const r = await api().post(`/api/activities/reading/${readingId}/submit`).set(bearer(s)).send({ answers: [1] });
    expect(r.body).toMatchObject({ score: 100, passed: true });
    const l = await api().post(`/api/activities/listening/${listeningId}/submit`).set(bearer(s)).send({ answers: [0] });
    expect(l.body).toMatchObject({ score: 0, passed: false });
  });

  it("FR-3.6.4 rejects the wrong number of answers", async () => {
    const res = await api().post(`/api/activities/reading/${readingId}/submit`).set(bearer(s)).send({ answers: [1, 2] });
    expect(res.status).toBe(400);
  });

  it("FR-3.9.2 progress shows streak, average, and history filterable by type", async () => {
    const all = await api().get("/api/progress/me").set(bearer(s));
    expect(all.body.attemptCount).toBe(5);
    expect(all.body.streak).toBe(1);
    expect(all.body.averageScore).toBeCloseTo((60 + 20 + 50 + 100 + 0) / 5, 1);
    const reading = await api().get("/api/progress/me?type=reading").set(bearer(s));
    expect(reading.body.history.map((h: { activityType: string }) => h.activityType)).toEqual(["reading"]);
  });
});

describe("Decision 5 streak days in Asia/Manila", () => {
  it("Decision 5 attempts at 23:30 and 00:30 local time fall on different days", async () => {
    const s = await createUser("student", { timeZone: "Asia/Manila" });
    const today = dateKey(new Date(), "Asia/Manila");
    const yesterday = addDaysToKey(today, -1);
    // 23:30 yesterday and 00:30 today in Manila are an hour apart but two days.
    const late = zonedTimeToUtc(yesterday, "23:30", "Asia/Manila");
    const early = zonedTimeToUtc(today, "00:30", "Asia/Manila");
    const base = { uid: s.uid, activityId: "x", activityType: "quiz" as const, title: "x", answers: [], correctCount: 1, total: 1, score: 100, passed: true };
    await col.attempts().add({ ...base, submittedAt: Timestamp.fromDate(late) });
    const one = await api().get("/api/progress/me").set(bearer(s));
    expect(one.body.streak).toBe(1);
    await col.attempts().add({ ...base, submittedAt: Timestamp.fromDate(early) });
    const two = await api().get("/api/progress/me").set(bearer(s));
    expect(two.body.streak).toBe(2);
    // The same two instants read in UTC are a single day, so the zone matters.
    expect(dateKey(late, "UTC")).toBe(dateKey(early, "UTC"));
  });
});

describe("FR-3.9.3 / FR-3.9.4 / FR-3.10.3 reports", () => {
  it("FR-3.9.3 teachers see class results per quiz and per student", async () => {
    const res = await api().get(`/api/classes/${classId}/reports`).set(bearer(w.teacher));
    expect(res.status).toBe(200);
    const quiz = res.body.quizzes.find((q: { activityId: string }) => q.activityId === teacherQuizId);
    expect(quiz.attempts).toBeGreaterThanOrEqual(2);
    expect(res.body.students.length).toBeGreaterThanOrEqual(2);
    expect((await api().get(`/api/classes/${classId}/reports`).set(bearer(w.otherTeacher))).status).toBe(403);
  });

  it("FR-3.9.4 FR-3.10.3 School Admins see school-wide results", async () => {
    const res = await api().get(`/api/schools/${w.schoolId}/reports`).set(bearer(w.admin));
    expect(res.status).toBe(200);
    expect(res.body.totals.attempts).toBeGreaterThanOrEqual(2);
    expect(res.body.classes.find((c: { classId: string }) => c.classId === classId).attempts).toBeGreaterThanOrEqual(2);
    expect((await api().get(`/api/schools/${w.schoolId}/reports`).set(bearer(w.teacher))).status).toBe(403);
  });
});

