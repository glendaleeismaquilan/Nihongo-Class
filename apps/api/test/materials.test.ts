import { beforeAll, describe, expect, it } from "vitest";
import { col, enrollmentId } from "../src/db";
import { objectExists } from "../src/lib/storage";
import { issueTicket } from "../src/lib/tickets";
import { api, bearer, createUser, createWorld, findKeys, seedClass, seedEnrollment, seedLesson, xlsxBuffer, type TestUser, type World } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a00000000049454e44ae426082", "hex");
const CFB = Buffer.concat([Buffer.from("d0cf11e0a1b11ae1", "hex"), Buffer.alloc(1024)]);

let w: World;
let classId: string;
let lessonId: string;

const pathOf = (url: string) => new URL(url).pathname + new URL(url).search;

async function createMaterial(title = "Lesson 1 slides") {
  const res = await api().post(`/api/classes/${classId}/materials`).set(bearer(w.teacher)).send({ title, lessonId });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function attachPdf(materialId: string, name = "slides.pdf") {
  const res = await api().post(`/api/materials/${materialId}/attachments`).set(bearer(w.teacher)).attach("file", PDF, name);
  expect(res.status).toBe(201);
  return res.body.attachments[res.body.attachments.length - 1].id as string;
}

const publish = (id: string) => api().patch(`/api/materials/${id}`).set(bearer(w.teacher)).send({ status: "published" });

beforeAll(async () => {
  w = await createWorld();
  ({ classId } = await seedClass(w.schoolId, [w.teacher.uid], { name: "Materials class" }));
  lessonId = await seedLesson(classId);
  await seedEnrollment(classId, w.student.uid, w.schoolId);
});

describe("FR-3.12.1 / FR-3.12.2 material posts and file checks", () => {
  it("FR-3.12.1 creates a draft with a file and a link; storage paths never leave the server", async () => {
    const id = await createMaterial();
    await attachPdf(id, "第1課スライド.pdf");
    const link = await api().post(`/api/materials/${id}/attachments`).set(bearer(w.teacher)).send({ kind: "link", name: "Lesson video", url: "https://www.youtube.com/watch?v=abc" });
    expect(link.status).toBe(201);
    expect(link.body.status).toBe("draft");
    expect(link.body.attachments.map((a: { name: string }) => a.name)).toEqual(["第1課スライド.pdf", "Lesson video"]);
    expect(findKeys(link.body, ["storagePath"])).toEqual([]);
    const doc = (await col.materials().doc(id).get()).data()!;
    expect(doc.attachments[0].storagePath).toMatch(new RegExp(`^classes/${classId}/materials/${id}/[a-f0-9]+-第1課スライド\\.pdf$`));
  });

  it("FR-3.12.2 accepts the allowed types by magic bytes and extension", async () => {
    const id = await createMaterial("Worksheets");
    for (const [buf, name] of [
      [PNG, "kana-chart.png"],
      [xlsxBuffer([["a"]]), "vocab.xlsx"],
      [CFB, "old-worksheet.doc"],
      [Buffer.from("あいうえお\nかきくけこ\n"), "hiragana.txt"],
    ] as const) {
      const res = await api().post(`/api/materials/${id}/attachments`).set(bearer(w.teacher)).attach("file", buf, name);
      expect(res.status, name).toBe(201);
    }
  });

  it("FR-3.12.2 rejects other types, mismatched contents, and non-https links with a per-file message", async () => {
    const id = await createMaterial("Bad files");
    const exe = await api().post(`/api/materials/${id}/attachments`).set(bearer(w.teacher)).attach("file", Buffer.from("MZ\x90\x00"), "setup.exe");
    expect(exe.status).toBe(400);
    expect(exe.body.error.message).toContain("setup.exe");
    const fake = await api().post(`/api/materials/${id}/attachments`).set(bearer(w.teacher)).attach("file", PNG, "notes.pdf");
    expect(fake.status).toBe(400);
    expect(fake.body.error.message).toContain("notes.pdf");
    const audio = await api().post(`/api/materials/${id}/attachments`).set(bearer(w.teacher)).attach("file", Buffer.from("ID3\x03\x00\x00\x00\x00\x00\x00"), "song.mp3");
    expect(audio.status).toBe(400);
    const binTxt = await api().post(`/api/materials/${id}/attachments`).set(bearer(w.teacher)).attach("file", Buffer.from([0, 1, 2, 3, 0xff]), "data.txt");
    expect(binTxt.status).toBe(400);
    const http = await api().post(`/api/materials/${id}/attachments`).set(bearer(w.teacher)).send({ kind: "link", name: "x", url: "http://example.com" });
    expect(http.status).toBe(400);
  });

  it("FR-3.12.1 allows up to 10 attachments", async () => {
    const id = await createMaterial("Many links");
    for (let i = 0; i < 10; i++) {
      expect((await api().post(`/api/materials/${id}/attachments`).set(bearer(w.teacher)).send({ kind: "link", name: `Link ${i}`, url: `https://example.com/${i}` })).status).toBe(201);
    }
    const eleventh = await api().post(`/api/materials/${id}/attachments`).set(bearer(w.teacher)).send({ kind: "link", name: "11", url: "https://example.com/11" });
    expect(eleventh.status).toBe(409);
  });
});

describe("FR-3.12.3 / FR-3.12.4 publishing and the student view", () => {
  it("FR-3.12.3 publishing notifies active students; FR-3.12.4 students see published only, pinned first", async () => {
    const draft = await createMaterial("Still a draft");
    await attachPdf(draft);
    const older = await createMaterial("Older post");
    await attachPdf(older);
    await publish(older);
    const pinned = await createMaterial("Pinned kana chart");
    await attachPdf(pinned);
    await publish(pinned);
    await api().patch(`/api/materials/${pinned}`).set(bearer(w.teacher)).send({ pinned: true });
    const newest = await createMaterial("Newest post");
    await attachPdf(newest);
    await publish(newest);

    const notes = await col.notifications().where("uid", "==", w.student.uid).where("type", "==", "material.published").get();
    expect(notes.size).toBeGreaterThanOrEqual(3);

    const res = await api().get(`/api/classes/${classId}/materials`).set(bearer(w.student));
    const titles = res.body.items.map((m: { title: string }) => m.title);
    expect(titles).not.toContain("Still a draft");
    expect(titles.slice(0, 3)).toEqual(["Pinned kana chart", "Newest post", "Older post"]);
    expect(res.body.items[0].viewed).toBe(false);

    await api().post(`/api/materials/${pinned}/view`).set(bearer(w.student));
    const again = await api().get(`/api/classes/${classId}/materials`).set(bearer(w.student));
    expect(again.body.items.find((m: { id: string }) => m.id === pinned).viewed).toBe(true);
  });

  it("FR-3.12.6 staff see Opened by X of Y and who hasn't opened it", async () => {
    const id = await createMaterial("Tracked");
    await attachPdf(id);
    await publish(id);
    const other = await createUser("student", { schoolId: w.schoolId, name: "Not Yet" });
    await seedEnrollment(classId, other.uid, w.schoolId);
    await api().post(`/api/materials/${id}/view`).set(bearer(w.student));
    await api().post(`/api/materials/${id}/view`).set(bearer(w.student));
    const views = await api().get(`/api/materials/${id}/views`).set(bearer(w.teacher));
    expect(views.body.opened).toHaveLength(1);
    expect(views.body.opened[0]).toMatchObject({ uid: w.student.uid, viewCount: 2 });
    expect(views.body.notOpened.map((p: { name: string }) => p.name)).toContain("Not Yet");
    const list = await api().get(`/api/classes/${classId}/materials`).set(bearer(w.teacher));
    const row = list.body.items.find((m: { id: string }) => m.id === id);
    expect(row.openedCount).toBe(1);
    expect(row.studentCount).toBe(views.body.total);
  });

  it("FR-3.12.7 deleting a material removes its files from Storage", async () => {
    const id = await createMaterial("To delete");
    await attachPdf(id);
    const path = (await col.materials().doc(id).get()).data()!.attachments[0].storagePath!;
    expect(await objectExists(path)).toBe(true);
    expect((await api().delete(`/api/materials/${id}`).set(bearer(w.teacher))).status).toBe(204);
    expect(await objectExists(path)).toBe(false);
  });
});

describe("FR-3.12.5 / FR-3.12.9 private files through tickets", () => {
  let materialId: string;
  let attId: string;
  beforeAll(async () => {
    materialId = await createMaterial("Private handout");
    attId = await attachPdf(materialId, "プリント.pdf");
    await publish(materialId);
  });

  it("FR-3.12.9 a ticket streams the file with the right headers, inline for previews", async () => {
    const t = await api().post(`/api/materials/${materialId}/attachments/${attId}/ticket`).set(bearer(w.student)).send({ disposition: "inline" });
    expect(t.status).toBe(200);
    expect(t.body.url).toMatch(/\/api\/files\/[^/]+$/);
    const file = await api().get(pathOf(t.body.url));
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toBe("application/pdf");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    expect(file.headers["content-disposition"]).toContain("inline");
    expect(file.headers["content-disposition"]).toContain(`filename*=UTF-8''${encodeURIComponent("プリント.pdf")}`);
    expect(file.headers["content-disposition"]).toMatch(/filename="[\x20-\x7e]+"/);
    expect(Buffer.from(file.body).subarray(0, 5).toString()).toBe("%PDF-");
    const dl = await api().post(`/api/materials/${materialId}/attachments/${attId}/ticket`).set(bearer(w.student)).send({ disposition: "attachment" });
    expect((await api().get(pathOf(dl.body.url))).headers["content-disposition"]).toMatch(/^attachment/);
  });

  it("ticket links use the origin the client reached the API at, not one configured URL", async () => {
    const path = `/api/materials/${materialId}/attachments/${attId}/ticket`;
    const lan = await api().post(path).set(bearer(w.student)).set("Host", "192.168.1.50:3000").send({});
    expect(lan.body.url).toMatch(/^http:\/\/192\.168\.1\.50:3000\/api\/files\/[^/]+$/);
    const proxied = await api().post(path).set(bearer(w.student)).set("X-Forwarded-Proto", "https").set("X-Forwarded-Host", "class.example.test").send({});
    expect(proxied.body.url).toMatch(/^https:\/\/class\.example\.test\/api\/files\/[^/]+$/);
  });

  it("FR-3.12.9 expired, tampered, and wrong-file tickets are rejected", async () => {
    const expired = issueTicket({ u: w.student.uid, k: "material", m: materialId, a: attId, d: "inline" }, -10).ticket;
    expect((await api().get(`/api/files/${expired}`)).status).toBe(403);

    const t = await api().post(`/api/materials/${materialId}/attachments/${attId}/ticket`).set(bearer(w.student));
    const ticket = t.body.url.split("/files/")[1] as string;
    const [body, sig] = ticket.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    const forged = Buffer.from(JSON.stringify({ ...payload, a: "someotherfile" })).toString("base64url");
    expect((await api().get(`/api/files/${forged}.${sig}`)).status).toBe(403);
    expect((await api().get(`/api/files/${body}.${sig.slice(0, -2)}xx`)).status).toBe(403);
    expect((await api().get(`/api/files/garbage`)).status).toBe(403);

    // A ticket for a file that has since been removed from the material.
    const extra = await attachPdf(materialId, "extra.pdf");
    const t2 = await api().post(`/api/materials/${materialId}/attachments/${extra}/ticket`).set(bearer(w.student));
    await api().delete(`/api/materials/${materialId}/attachments/${extra}`).set(bearer(w.teacher));
    expect((await api().get(pathOf(t2.body.url))).status).toBe(404);
  });

  it("FR-3.12.9 a student removed after the ticket was issued is denied", async () => {
    const s = await createUser("student", { schoolId: w.schoolId });
    await seedEnrollment(classId, s.uid, w.schoolId);
    const t = await api().post(`/api/materials/${materialId}/attachments/${attId}/ticket`).set(bearer(s));
    expect(t.status).toBe(200);
    await col.enrollments().doc(enrollmentId(classId, s.uid)).update({ status: "removed" });
    expect((await api().get(pathOf(t.body.url))).status).toBe(403);
  });

  it("FR-3.12.5 FR-3.13.6 pending, removed, and non-enrolled students get 403 from materials and tickets", async () => {
    const pending = await createUser("student", { schoolId: w.schoolId });
    await seedEnrollment(classId, pending.uid, w.schoolId, { status: "removed" });
    const removed = await createUser("student", { schoolId: w.schoolId });
    await seedEnrollment(classId, removed.uid, w.schoolId, { status: "removed" });
    const outsider = await createUser("student");
    for (const who of [pending, removed, outsider] as TestUser[]) {
      expect((await api().get(`/api/classes/${classId}/materials`).set(bearer(who))).status).toBe(403);
      expect((await api().get(`/api/materials/${materialId}`).set(bearer(who))).status).toBe(403);
      expect((await api().post(`/api/materials/${materialId}/attachments/${attId}/ticket`).set(bearer(who))).status).toBe(403);
      expect((await api().post(`/api/materials/${materialId}/view`).set(bearer(who))).status).toBe(403);
    }
  });

  it("FR-3.12.5 drafts are hidden from students", async () => {
    const id = await createMaterial("Hidden draft");
    const att = await attachPdf(id);
    expect((await api().post(`/api/materials/${id}/attachments/${att}/ticket`).set(bearer(w.student))).status).toBe(404);
  });
});
