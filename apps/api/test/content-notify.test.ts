import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, bearer, createUser, createWorld, seedClass, seedEnrollment, xlsxBuffer, type TestUser, type World } from "./helpers";
import { col } from "../src/db";
import { setPushSender, type PushMessage } from "../src/lib/push";

let w: World;
let classId: string;
let enrolled: TestUser;
let removed: TestUser;
let lessonId: string;
const pushed: PushMessage[] = [];

beforeAll(async () => {
  setPushSender(async (_tokens, m) => {
    pushed.push(m);
    return { invalid: [] };
  });
  w = await createWorld();
  ({ classId } = await seedClass(w.schoolId, [w.teacher.uid], { name: "N5 Saturday Class" }));
  [enrolled, removed] = await Promise.all([createUser("student", { schoolId: w.schoolId }), createUser("student", { schoolId: w.schoolId })]);
  await Promise.all([seedEnrollment(classId, enrolled.uid, w.schoolId), seedEnrollment(classId, removed.uid, w.schoolId, { status: "removed" })]);
  await api().post("/api/me/push-tokens").set(bearer(enrolled)).send({ token: "fcm-token-enrolled-phone" });
});
afterAll(() => setPushSender(null));

const notesFor = async (u: TestUser) => {
  const snap = await col.notifications().where("uid", "==", u.uid).get();
  return snap.docs.map((d) => d.data()).sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Students hear about new teaching content", () => {
  it("a new lesson notifies the class's enrolled students on web and phone", async () => {
    const res = await api().post(`/api/classes/${classId}/lessons`).set(bearer(w.teacher)).send({ title: "Lesson 2: 家族" });
    expect(res.status).toBe(201);
    lessonId = res.body.id;
    const notes = await notesFor(enrolled);
    expect(notes.map((n) => [n.type, n.title, n.body, n.link])).toEqual([["lesson.created", "New lesson in N5 Saturday Class", "Lesson 2: 家族", `/s/classes/${classId}`]]);
    await wait(100);
    expect(pushed.map((p) => p.title)).toContain("New lesson in N5 Saturday Class");
    expect(await notesFor(removed)).toEqual([]);
    expect(await notesFor(w.teacher)).toEqual([]);
  });

  it("flashcards typed one by one send one notification per burst", async () => {
    for (const term of ["母", "父"]) {
      const res = await api().post(`/api/classes/${classId}/flashcards`).set(bearer(w.teacher)).send({ lessonId, term, reading: term === "母" ? "はは" : "ちち", meaning: term === "母" ? "mother" : "father" });
      expect(res.status).toBe(201);
    }
    const cards = (await notesFor(enrolled)).filter((n) => n.type === "flashcards.added");
    expect(cards.map((n) => [n.title, n.body])).toEqual([["New flashcards in N5 Saturday Class", "Lesson 2: 家族: 母"]]);
  });

  it("an Excel import always sends one summary", async () => {
    const file = xlsxBuffer([["Term", "Reading", "Meaning", "Example Sentence"], ["兄", "あに", "older brother", ""], ["姉", "あね", "older sister", ""]]);
    const res = await api().post(`/api/classes/${classId}/flashcards/import`).set(bearer(w.teacher)).field("lessonId", lessonId).attach("file", file, "cards.xlsx");
    expect(res.status).toBe(201);
    const cards = (await notesFor(enrolled)).filter((n) => n.type === "flashcards.added");
    expect(cards.map((n) => n.body)).toEqual(["Lesson 2: 家族: 母", "Lesson 2: 家族: 2 new flashcards"]);
  });

  it("a new quiz notifies with its title", async () => {
    const res = await api()
      .post(`/api/classes/${classId}/quizzes`)
      .set(bearer(w.teacher))
      .send({ lessonId, title: "家族クイズ", passingScorePct: 60, questions: [{ text: "「はは」は？", choices: ["母", "父", "兄", "姉"], correctIndex: 0 }] });
    expect(res.status).toBe(201);
    const quiz = (await notesFor(enrolled)).filter((n) => n.type === "quiz.created");
    expect(quiz.map((n) => [n.title, n.body, n.link])).toEqual([["New quiz in N5 Saturday Class", "Lesson 2: 家族: 家族クイズ", `/s/classes/${classId}`]]);
  });

  it("the notifications show in the student's list (web and app read the same endpoint)", async () => {
    const res = await api().get("/api/notifications").set(bearer(enrolled));
    expect(res.status).toBe(200);
    const titles = (res.body.items as { title: string }[]).map((i) => i.title);
    expect(titles).toEqual(expect.arrayContaining(["New lesson in N5 Saturday Class", "New flashcards in N5 Saturday Class", "New quiz in N5 Saturday Class"]));
  });
});
