import { beforeAll, describe, expect, it } from "vitest";
import { col } from "../src/db";
import { objectExists } from "../src/lib/storage";
import { toneWav } from "../seed/tone";
import { api, bearer, createWorld, xlsxBuffer, type World } from "./helpers";

let w: World;
beforeAll(async () => {
  w = await createWorld();
});

const question = (text: string, correctIndex = 0) => ({ text, choices: ["to eat", "to drink", "to sleep", "to walk"], correctIndex });

describe("FR-3.5.1 built-in flashcards with audio", () => {
  it("FR-3.5.1 creates a flashcard and attaches an uploaded pronunciation clip", async () => {
    const created = await api().post("/api/library/flashcards").set(bearer(w.contentAdmin)).send({ level: "N5", term: "食べる", reading: "たべる", meaning: "to eat", exampleSentence: "ご飯を食べる" });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("draft");
    expect(created.body.source).toBe("builtin");
    const audio = await api().post(`/api/library/flashcards/${created.body.id}/audio`).set(bearer(w.contentAdmin)).attach("file", toneWav(), { filename: "taberu.wav", contentType: "audio/wav" });
    expect(audio.status).toBe(200);
    expect(audio.body.audioUrl).toMatch(/\/v0\/b\/.+\/o\/builtin%2Faudio%2Fflashcards%2F.+\?alt=media&token=/);
    expect(audio.body.audioFileName).toBe("taberu.wav");
    expect(audio.body.audioMimeType).toBe("audio/wav");
    // The download URL serves the clip.
    const fetched = await fetch(audio.body.audioUrl);
    expect(fetched.status).toBe(200);
  });

  it("FR-3.5.1 accepts a browser recording and stores its actual MIME type", async () => {
    const created = await api().post("/api/library/flashcards").set(bearer(w.contentAdmin)).send({ level: "N5", term: "飲む", reading: "のむ", meaning: "to drink" });
    // A minimal WebM (EBML header) recorded by MediaRecorder.
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84]), Buffer.from("webm"), Buffer.from([0x42, 0x87, 0x81, 0x04, 0x42, 0x85, 0x81, 0x02]), Buffer.alloc(200)]);
    const res = await api().post(`/api/library/flashcards/${created.body.id}/audio`).set(bearer(w.contentAdmin)).field("fileName", "recording.webm").field("mimeType", "audio/webm;codecs=opus").attach("file", webm, { filename: "blob", contentType: "audio/webm" });
    expect(res.status).toBe(200);
    expect(res.body.audioMimeType).toBe("audio/webm;codecs=opus");
  });

  it("FR-3.5.1 rejects files that aren't audio", async () => {
    const created = await api().post("/api/library/flashcards").set(bearer(w.contentAdmin)).send({ level: "N5", term: "見る", reading: "みる", meaning: "to see" });
    const res = await api().post(`/api/library/flashcards/${created.body.id}/audio`).set(bearer(w.contentAdmin)).attach("file", Buffer.from("not audio at all"), "fake.mp3");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_file_type");
  });

  it("FR-3.5.6 built-in items require a JLPT level", async () => {
    const res = await api().post("/api/library/flashcards").set(bearer(w.contentAdmin)).send({ term: "a", reading: "a", meaning: "a" });
    expect(res.status).toBe(400);
  });
});

describe("FR-3.5.2 built-in quizzes", () => {
  it("FR-3.5.2 attaches audio to a question's correct answer and keeps it when questions are reordered", async () => {
    const quiz = await api().post("/api/library/quizzes").set(bearer(w.contentAdmin)).send({ level: "N5", title: "動詞", questions: [question("「食べる」の意味は？"), question("「飲む」の意味は？", 1)] });
    expect(quiz.status).toBe(201);
    const audio = await api().post(`/api/library/quizzes/${quiz.body.id}/audio`).set(bearer(w.contentAdmin)).field("questionIndex", "1").attach("file", toneWav(), "nomu.wav");
    expect(audio.body.questions[1].audioUrl).toBeTruthy();
    const url = audio.body.questions[1].audioUrl;
    const reordered = await api()
      .patch(`/api/library/quizzes/${quiz.body.id}`)
      .set(bearer(w.contentAdmin))
      .send({ questions: [{ ...question("「飲む」の意味は？", 1), audioUrl: url }, question("「食べる」の意味は？")] });
    expect(reordered.body.questions[0].audioUrl).toBe(url);
    expect(reordered.body.questions[1].audioUrl).toBeNull();
  });

  it("FR-3.5.2 a client can't point audioUrl at an arbitrary address", async () => {
    const quiz = await api().post("/api/library/quizzes").set(bearer(w.contentAdmin)).send({ level: "N5", title: "x", questions: [{ ...question("q"), audioUrl: "https://evil.example/a.mp3" }] });
    expect(quiz.body.questions[0].audioUrl).toBeNull();
  });
});

describe("FR-3.5.3 bulk import with audio matching", () => {
  it("FR-3.5.3 imports as drafts with the level from the form and the expected audio file names", async () => {
    const file = xlsxBuffer([
      ["Term", "Reading", "Meaning", "Example Sentence", "Audio File Name"],
      ["食べる", "たべる", "to eat", "ご飯を食べる", "taberu.mp3"],
      ["飲む", "のむ", "to drink", "", ""],
      ["", "みる", "to see", "", "miru.mp3"],
    ]);
    const res = await api().post("/api/library/flashcards/import").set(bearer(w.contentAdmin)).field("level", "N4").attach("file", file, "library.xlsx");
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(2);
    expect(res.body.errors[0].row).toBe(4);
    const batch = await api().get(`/api/library/flashcards?batch=${res.body.batchId}`).set(bearer(w.contentAdmin));
    expect(batch.body.items.map((i: { term: string }) => i.term)).toEqual(["食べる", "飲む"]);
    expect(batch.body.items[0]).toMatchObject({ level: "N4", status: "draft", expectedAudioName: "taberu.mp3" });
    const pub = await api().post(`/api/library/flashcards/batch/${res.body.batchId}/publish`).set(bearer(w.contentAdmin));
    expect(pub.body.published).toBe(2);
  });

  it("FR-3.5.3 a quiz file creates one draft quiz titled from the form", async () => {
    const file = xlsxBuffer([
      ["Question", "Option A", "Option B", "Option C", "Option D", "Correct Option", "Audio File Name"],
      ["「食べる」の意味は？", "to eat", "to drink", "to sleep", "to walk", "A", "taberu-quiz.mp3"],
    ]);
    const res = await api().post("/api/library/quizzes/import").set(bearer(w.contentAdmin)).field("level", "N5").field("title", "たべもの").attach("file", file, "q.xlsx");
    expect(res.status).toBe(201);
    const quiz = (await col.quizzes().doc(res.body.quizId).get()).data()!;
    expect(quiz).toMatchObject({ title: "たべもの", level: "N5", status: "draft", source: "builtin" });
    expect(quiz.questions[0].expectedAudioName).toBe("taberu-quiz.mp3");
  });
});

describe("FR-3.5.4 / FR-3.5.5 reading and listening tests", () => {
  it("FR-3.5.4 creates a reading test with a passage and questions", async () => {
    const res = await api()
      .post("/api/library/reading-tests")
      .set(bearer(w.contentAdmin))
      .send({ level: "N5", title: "わたしの家族", passage: "わたしの家族は四人です。", questions: [{ text: "家族は何人ですか。", choices: ["三人", "四人", "五人", "六人"], correctIndex: 1 }], status: "published" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("published");
  });

  it("FR-3.5.5 a listening test can't be published until its clip is uploaded", async () => {
    const res = await api().post("/api/library/listening-tests").set(bearer(w.contentAdmin)).send({ level: "N5", title: "駅で", questions: [{ text: "どこですか。", choices: ["駅", "学校", "病院", "銀行"], correctIndex: 0 }] });
    const early = await api().post(`/api/library/listening-tests/${res.body.id}/publish`).set(bearer(w.contentAdmin)).send({ status: "published" });
    expect(early.status).toBe(409);
    await api().post(`/api/library/listening-tests/${res.body.id}/audio`).set(bearer(w.contentAdmin)).attach("file", toneWav(), "eki.wav");
    const ok = await api().post(`/api/library/listening-tests/${res.body.id}/publish`).set(bearer(w.contentAdmin)).send({ status: "published" });
    expect(ok.status).toBe(200);
    expect(ok.body.audioUrl).toBeTruthy();
  });
});

describe("FR-3.5.7 draft and publish, and library access", () => {
  it("FR-3.5.7 publishes and unpublishes; overview counts drafts", async () => {
    const card = await api().post("/api/library/flashcards").set(bearer(w.contentAdmin)).send({ level: "N1", term: "概念", reading: "がいねん", meaning: "concept" });
    const pub = await api().post(`/api/library/flashcards/${card.body.id}/publish`).set(bearer(w.contentAdmin)).send({ status: "published" });
    expect(pub.body.status).toBe("published");
    const overview = await api().get("/api/library/overview").set(bearer(w.contentAdmin));
    expect(overview.body.levels.N1.flashcards).toBeGreaterThanOrEqual(1);
  });

  it("SRS 5.2 only Content Admins can use the library routes", async () => {
    for (const who of [w.teacher, w.admin, w.student]) {
      expect((await api().get("/api/library/flashcards").set(bearer(who))).status).toBe(403);
    }
  });

  it("deleting an item removes its audio from Storage", async () => {
    const created = await api().post("/api/library/flashcards").set(bearer(w.contentAdmin)).send({ level: "N5", term: "猫", reading: "ねこ", meaning: "cat" });
    await api().post(`/api/library/flashcards/${created.body.id}/audio`).set(bearer(w.contentAdmin)).attach("file", toneWav(), "neko.wav");
    const path = (await col.flashcards().doc(created.body.id).get()).data()!.audioPath!;
    expect(await objectExists(path)).toBe(true);
    await api().delete(`/api/library/flashcards/${created.body.id}`).set(bearer(w.contentAdmin));
    expect(await objectExists(path)).toBe(false);
  });
});
