import { beforeAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { col } from "../src/db";
import { api, bearer, createWorld, findKeys, seedClass, seedLesson, xlsxBuffer, type World } from "./helpers";

let w: World;
let classId: string;
let lessonId: string;

beforeAll(async () => {
  w = await createWorld();
  ({ classId } = await seedClass(w.schoolId, [w.teacher.uid]));
  lessonId = await seedLesson(classId);
});

describe("FR-3.3.1 manual teacher flashcards", () => {
  it("FR-3.3.1 creates a flashcard in a lesson", async () => {
    const res = await api()
      .post(`/api/classes/${classId}/flashcards`)
      .set(bearer(w.teacher))
      .send({ lessonId, term: "食べる", reading: "たべる", meaning: "to eat", exampleSentence: "ご飯を食べる" });
    expect(res.status).toBe(201);
    expect(res.body.term).toBe("食べる");
    expect(res.body.source).toBe("teacher");
  });

  it("FR-3.3.5 teacher flashcards reject and never return audio fields", async () => {
    const res = await api().post(`/api/classes/${classId}/flashcards`).set(bearer(w.teacher)).send({ lessonId, term: "飲む", reading: "のむ", meaning: "to drink", audioUrl: "https://example.com/a.mp3" });
    expect(res.status).toBe(400);
    const list = await api().get(`/api/classes/${classId}/flashcards`).set(bearer(w.teacher));
    expect(findKeys(list.body, ["audioUrl", "audioFileName", "audioMimeType"])).toEqual([]);
  });

  it("FR-3.3.1 rejects a lesson from another class", async () => {
    const other = await seedClass(w.schoolId, [w.teacher.uid]);
    const otherLesson = await seedLesson(other.classId);
    const res = await api().post(`/api/classes/${classId}/flashcards`).set(bearer(w.teacher)).send({ lessonId: otherLesson, term: "a", reading: "a", meaning: "a" });
    expect(res.status).toBe(400);
  });
});

describe("FR-3.3.2 / FR-3.4.2 templates", () => {
  const read = async (path: string, who: typeof w.teacher) => {
    const res = await api().get(path).set(bearer(who)).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    return { res, wb: XLSX.read(res.body as Buffer, { type: "buffer" }) };
  };

  it("FR-3.3.2 the teacher flashcard template has headers, the SRS example row, and Instructions", async () => {
    const { res, wb } = await read("/api/templates/flashcards", w.teacher);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(wb.SheetNames).toContain("Instructions");
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    expect(rows[0]).toEqual(["Term", "Reading", "Meaning", "Example Sentence"]);
    expect(rows[1]).toEqual(["食べる", "たべる", "to eat", "ご飯を食べる"]);
  });

  it("FR-3.4.2 the teacher quiz template has headers and the SRS example row", async () => {
    const { wb } = await read("/api/templates/quiz", w.teacher);
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    expect(rows[0]).toEqual(["Question", "Option A", "Option B", "Option C", "Option D", "Correct Option"]);
    expect(rows[1]).toEqual(["「食べる」の意味は？", "to eat", "to drink", "to sleep", "to walk", "A"]);
  });

  it("FR-3.5.3 the Content Admin variant adds Audio File Name", async () => {
    const { wb } = await read("/api/templates/flashcards", w.contentAdmin);
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    expect(rows[0]).toContain("Audio File Name");
    expect(rows[1]).toContain("taberu.mp3");
  });
});

describe("FR-3.3.3 / FR-3.3.4 flashcard import", () => {
  it("FR-3.3.4 imports the valid rows and reports each invalid row's number and reason", async () => {
    const file = xlsxBuffer([
      ["  term ", "READING", "Meaning", "Example Sentence"],
      ["猫", "ねこ", "cat", "猫がいます"],
      ["", "いぬ", "dog", ""],
      [],
      ["水", "みず", "", ""],
      ["山", "やま", "mountain", ""],
    ]);
    const res = await api().post(`/api/classes/${classId}/flashcards/import`).set(bearer(w.teacher)).field("lessonId", lessonId).attach("file", file, "cards.xlsx");
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(2);
    expect(res.body.errors).toEqual([
      { row: 3, reason: "Row 3: Term is required." },
      { row: 5, reason: "Row 5: Meaning is required." },
    ]);
    expect(typeof res.body.errorReport).toBe("string");
    const report = XLSX.read(Buffer.from(res.body.errorReport, "base64"), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(report.Sheets.Errors, { header: 1 });
    expect(rows[1][0]).toBe(3);
    const cards = await col.flashcards().where("lessonId", "==", lessonId).where("term", "==", "猫").get();
    expect(cards.docs[0].data().exampleSentence).toBe("猫がいます");
  });

  it("FR-3.3.4 rejects a file with missing headers or that isn't .xlsx", async () => {
    const bad = xlsxBuffer([["Word", "Reading"], ["a", "b"]]);
    const res = await api().post(`/api/classes/${classId}/flashcards/import`).set(bearer(w.teacher)).field("lessonId", lessonId).attach("file", bad, "bad.xlsx");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("missing_headers");
    const txt = await api().post(`/api/classes/${classId}/flashcards/import`).set(bearer(w.teacher)).field("lessonId", lessonId).attach("file", Buffer.from("Term,Reading"), "x.xlsx");
    expect(txt.body.error.code).toBe("invalid_file_type");
  });

  it("FR-3.3.4 rejects more than 500 rows", async () => {
    const rows = [["Term", "Reading", "Meaning"], ...Array.from({ length: 501 }, (_, i) => [`語${i}`, "ご", "word"])];
    const res = await api().post(`/api/classes/${classId}/flashcards/import`).set(bearer(w.teacher)).field("lessonId", lessonId).attach("file", xlsxBuffer(rows), "big.xlsx");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("too_many_rows");
  });

  it("SRS 5.1 a 200-row flashcard import finishes within 15 seconds", async () => {
    const rows = [["Term", "Reading", "Meaning", "Example Sentence"], ...Array.from({ length: 200 }, (_, i) => [`単語${i}`, `たんご${i}`, `word ${i}`, `これは単語${i}です`])];
    const started = Date.now();
    const res = await api().post(`/api/classes/${classId}/flashcards/import`).set(bearer(w.teacher)).field("lessonId", lessonId).attach("file", xlsxBuffer(rows), "200.xlsx");
    const elapsed = Date.now() - started;
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(200);
    expect(elapsed).toBeLessThan(15_000);
  });
});

describe("FR-3.4.3 / FR-3.4.4 quiz import", () => {
  it("FR-3.4.4 rejects rows whose Correct Option is E, blank, or A,B; the rest imports as one quiz", async () => {
    const file = xlsxBuffer([
      ["Question", "Option A", "Option B", "Option C", "Option D", "Correct Option"],
      ["「食べる」の意味は？", "to eat", "to drink", "to sleep", "to walk", "A"],
      ["「飲む」の意味は？", "to eat", "to drink", "to sleep", "to walk", "E"],
      ["「寝る」の意味は？", "to eat", "to drink", "to sleep", "to walk", ""],
      ["「歩く」の意味は？", "to eat", "to drink", "to sleep", "to walk", "A,B"],
      ["「見る」の意味は？", "to see", "to hear", "to say", "to go", " b "],
    ]);
    const res = await api()
      .post(`/api/classes/${classId}/quizzes/import`)
      .set(bearer(w.teacher))
      .field("lessonId", lessonId)
      .field("title", "動詞クイズ")
      .attach("file", file, "quiz.xlsx");
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(2);
    expect(res.body.errors.map((e: { row: number }) => e.row)).toEqual([3, 4, 5]);
    expect(res.body.errors[0].reason).toBe('Row 3: Correct Option must be A, B, C, or D. This row has "E".');
    expect(res.body.errors[2].reason).toContain('"A,B"');
    const quiz = (await col.quizzes().doc(res.body.quizId).get()).data()!;
    expect(quiz.title).toBe("動詞クイズ");
    expect(quiz.questions.map((q) => q.correctIndex)).toEqual([0, 1]);
    expect(quiz.source).toBe("teacher");
  });

  it("FR-3.4.3 requires a title", async () => {
    const file = xlsxBuffer([["Question", "Option A", "Option B", "Option C", "Option D", "Correct Option"], ["q", "a", "b", "c", "d", "A"]]);
    const res = await api().post(`/api/classes/${classId}/quizzes/import`).set(bearer(w.teacher)).field("lessonId", lessonId).attach("file", file, "quiz.xlsx");
    expect(res.status).toBe(400);
  });
});

describe("FR-3.4.1 / FR-3.4.5 manual quizzes", () => {
  it("FR-3.4.1 requires four choices and exactly one correct; FR-3.4.5 no audio", async () => {
    const good = await api()
      .post(`/api/classes/${classId}/quizzes`)
      .set(bearer(w.teacher))
      .send({ lessonId, title: "あいさつ", questions: [{ text: "「おはよう」は？", choices: ["Good morning", "Good night", "Thanks", "Sorry"], correctIndex: 0 }] });
    expect(good.status).toBe(201);
    const three = await api().post(`/api/classes/${classId}/quizzes`).set(bearer(w.teacher)).send({ lessonId, title: "x", questions: [{ text: "q", choices: ["a", "b", "c"], correctIndex: 0 }] });
    expect(three.status).toBe(400);
    const audio = await api()
      .post(`/api/classes/${classId}/quizzes`)
      .set(bearer(w.teacher))
      .send({ lessonId, title: "x", questions: [{ text: "q", choices: ["a", "b", "c", "d"], correctIndex: 0, audioUrl: "https://example.com/x.mp3" }] });
    expect(audio.status).toBe(400);
    const patch = await api().patch(`/api/quizzes/${good.body.id}`).set(bearer(w.teacher)).send({ title: "あいさつ 2" });
    expect(patch.body.title).toBe("あいさつ 2");
  });
});
