import { beforeAll, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { PLANS } from "@nihongo/shared";
import { col } from "../src/db";
import { api, bearer, createUser, createWorld, seedClass, type TestUser, type World } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
const pathOf = (url: string) => new URL(url).pathname + new URL(url).search;

let w: World;
beforeAll(async () => {
  w = await createWorld();
});

const used = async (uid: string) => (await col.users().doc(uid).get()).data()!.storageUsedBytes ?? 0;
const upload = (t: TestUser, name = "notes.pdf", parentId?: string) => {
  const req = api().post("/api/drive/files").set(bearer(t));
  if (parentId) req.field("parentId", parentId);
  return req.attach("file", PDF, name);
};

describe("My Drive", () => {
  it("a teacher makes folders, uploads, renames, moves, downloads, and deletes", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const folder = await api().post("/api/drive/folders").set(bearer(t)).send({ name: "Lesson plans" });
    expect(folder.status).toBe(201);
    const sub = await api().post("/api/drive/folders").set(bearer(t)).send({ name: "Week 1", parentId: folder.body.id });
    const file = await upload(t, "plan.pdf", folder.body.id);
    expect(file.status, JSON.stringify(file.body)).toBe(201);
    expect(file.body).toMatchObject({ kind: "file", name: "plan.pdf", mimeType: "application/pdf", sizeBytes: PDF.length, parentId: folder.body.id });
    expect(await used(t.uid)).toBe(PDF.length);

    const root = await api().get("/api/drive").set(bearer(t));
    expect(root.body.items.map((i: { name: string }) => i.name)).toEqual(["Lesson plans"]);
    expect(root.body.usage).toMatchObject({ usedBytes: PDF.length, limitBytes: PLANS.freeStorageBytes, premium: false });
    const inside = await api().get(`/api/drive?folderId=${sub.body.id}`).set(bearer(t));
    expect(inside.body.path.map((p: { name: string }) => p.name)).toEqual(["Lesson plans", "Week 1"]);

    const renamed = await api().patch(`/api/drive/${file.body.id}`).set(bearer(t)).send({ name: "week-1.pdf", parentId: sub.body.id });
    expect(renamed.body).toMatchObject({ name: "week-1.pdf", parentId: sub.body.id });
    const loop = await api().patch(`/api/drive/${folder.body.id}`).set(bearer(t)).send({ parentId: sub.body.id });
    expect(loop.status).toBe(409);

    const ticket = await api().post(`/api/drive/${file.body.id}/ticket`).set(bearer(t)).send({ disposition: "inline" });
    expect(ticket.status).toBe(200);
    const got = await api().get(pathOf(ticket.body.url));
    expect(got.status).toBe(200);
    expect(got.headers["content-type"]).toContain("application/pdf");

    // Deleting a folder deletes what's inside and gives the space back.
    expect((await api().delete(`/api/drive/${folder.body.id}`).set(bearer(t))).status).toBe(204);
    expect(await used(t.uid)).toBe(0);
    expect((await api().get("/api/drive").set(bearer(t))).body.items).toEqual([]);
    expect((await api().get(pathOf(ticket.body.url))).status).toBe(404);
  });

  it("files are private to their owner", async () => {
    const a = await createUser("teacher", { schoolId: w.schoolId });
    const b = await createUser("teacher", { schoolId: w.schoolId });
    const file = await upload(a);
    expect((await api().post(`/api/drive/${file.body.id}/ticket`).set(bearer(b)).send({})).status).toBe(404);
    expect((await api().patch(`/api/drive/${file.body.id}`).set(bearer(b)).send({ name: "mine.pdf" })).status).toBe(404);
    expect((await api().delete(`/api/drive/${file.body.id}`).set(bearer(b))).status).toBe(404);
    expect((await api().get("/api/drive").set(bearer(w.student))).status).toBe(403);
  });

  it("the free plan stops at 500 MB; Premium allows 1 GB", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    await col.users().doc(t.uid).update({ storageUsedBytes: PLANS.freeStorageBytes - 10 });
    const full = await upload(t);
    expect(full.status).toBe(413);
    expect(full.body.error.code).toBe("storage_full");
    expect(full.body.error.message).toContain("Premium");
    expect(await used(t.uid)).toBe(PLANS.freeStorageBytes - 10);

    await col.users().doc(t.uid).update({ premiumSince: Timestamp.now() });
    expect((await upload(t)).status).toBe(201);
    expect((await api().get("/api/drive").set(bearer(t))).body.usage).toMatchObject({ limitBytes: PLANS.premiumStorageBytes, premium: true });
    await col.users().doc(t.uid).update({ storageUsedBytes: PLANS.premiumStorageBytes - 10 });
    expect((await upload(t)).status).toBe(413);
  });

  it("class material uploads count toward the same quota and are released on delete", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const { classId } = await seedClass(w.schoolId, [t.uid]);
    const m = await api().post(`/api/classes/${classId}/materials`).set(bearer(t)).send({ title: "Handout" });
    expect(m.status, JSON.stringify(m.body)).toBe(201);
    const att = await api().post(`/api/materials/${m.body.id}/attachments`).set(bearer(t)).attach("file", PDF, "handout.pdf");
    expect(att.status, JSON.stringify(att.body)).toBe(201);
    expect(await used(t.uid)).toBe(PDF.length);
    await col.users().doc(t.uid).update({ storageUsedBytes: PLANS.freeStorageBytes });
    const over = await api().post(`/api/materials/${m.body.id}/attachments`).set(bearer(t)).attach("file", PDF, "more.pdf");
    expect(over.status).toBe(413);
    await col.users().doc(t.uid).update({ storageUsedBytes: PDF.length });
    expect((await api().delete(`/api/materials/${m.body.id}`).set(bearer(t))).status).toBe(204);
    expect(await used(t.uid)).toBe(0);
  });

  it("only material file types are allowed", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const exe = await api().post("/api/drive/files").set(bearer(t)).attach("file", Buffer.from("MZ\x90\x00"), "setup.exe");
    expect(exe.status).toBe(400);
    expect(await used(t.uid)).toBe(0);
  });
});
