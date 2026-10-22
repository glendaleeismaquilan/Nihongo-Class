import { beforeAll, describe, expect, it } from "vitest";
import { CLASS_CODE_ALPHABET } from "@nihongo/shared";
import { col, enrollmentId } from "../src/db";
import { setCodeGenerator } from "../src/lib/codes";
import { api, bearer, createUser, createWorld, seedClass, seedEnrollment, type World } from "./helpers";

let w: World;
beforeAll(async () => {
  w = await createWorld();
});

describe("FR-3.2.1 class creation", () => {
  it("FR-3.2.1 a teacher creates a class and is its teacher; classes are free", async () => {
    const res = await api().post("/api/classes").set(bearer(w.teacher)).send({ name: "N5 Morning", level: "N5", teacherIds: [w.otherTeacher.uid] });
    expect(res.status).toBe(201);
    expect(res.body.teacherIds).toEqual([w.teacher.uid]);
    expect(res.body).not.toHaveProperty("feeCentavos");
    expect(res.body.schoolId).toBe(w.schoolId);
  });

  it("FR-3.2.1 a School Admin creates a class and assigns teachers", async () => {
    const res = await api().post("/api/classes").set(bearer(w.admin)).send({ name: "N4 Evening", level: "N4", teacherIds: [w.teacher.uid, w.otherTeacher.uid] });
    expect(res.status).toBe(201);
    expect(res.body.teachers.map((t: { uid: string }) => t.uid).sort()).toEqual([w.teacher.uid, w.otherTeacher.uid].sort());
  });

  it("FR-3.2.1 students and content admins can't create classes", async () => {
    expect((await api().post("/api/classes").set(bearer(w.student)).send({ name: "X", level: "N5" })).status).toBe(403);
    expect((await api().post("/api/classes").set(bearer(w.contentAdmin)).send({ name: "X", level: "N5" })).status).toBe(403);
  });
});

describe("FR-3.2.2 class codes", () => {
  it("FR-3.2.2 codes are 6 characters from the unambiguous alphabet", async () => {
    const res = await api().post("/api/classes").set(bearer(w.teacher)).send({ name: "Code check", level: "N5" });
    expect(res.body.code).toMatch(/^[A-Z0-9]{6}$/);
    for (const c of res.body.code) expect(CLASS_CODE_ALPHABET).toContain(c);
    expect(res.body.code).not.toMatch(/[0O1IL]/);
    const map = await col.classCodes().doc(res.body.code).get();
    expect(map.data()!.classId).toBe(res.body.id);
  });

  it("FR-3.2.2 concurrent class creation never produces duplicate codes", async () => {
    // Force collisions: every attempt draws from a pool of 40 codes.
    const pool = Array.from({ length: 40 }, (_, i) => `ZZZ${CLASS_CODE_ALPHABET[i % 31]}${CLASS_CODE_ALPHABET[Math.floor(i / 31)]}Z`);
    const restore = setCodeGenerator(() => pool[Math.floor(Math.random() * pool.length)]);
    try {
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) => api().post("/api/classes").set(bearer(w.teacher)).send({ name: `Concurrent ${i}`, level: "N5" })),
      );
      const ok = results.filter((r) => r.status === 201);
      expect(ok.length).toBe(12);
      const codes = ok.map((r) => r.body.code);
      expect(new Set(codes).size).toBe(codes.length);
      for (const r of ok) {
        const map = await col.classCodes().doc(r.body.code).get();
        expect(map.data()!.classId).toBe(r.body.id);
      }
    } finally {
      restore();
    }
  });

  it("FR-3.2.2 staff regenerate the code and the old one stops working", async () => {
    const created = await api().post("/api/classes").set(bearer(w.teacher)).send({ name: "Regen", level: "N5" });
    const regen = await api().post(`/api/classes/${created.body.id}/code`).set(bearer(w.teacher));
    expect(regen.status).toBe(200);
    expect(regen.body.code).not.toBe(created.body.code);
    const old = await api().get(`/api/classes/preview?code=${created.body.code}`).set(bearer(w.student));
    expect(old.status).toBe(404);
    const fresh = await api().get(`/api/classes/preview?code=${regen.body.code}`).set(bearer(w.student));
    expect(fresh.status).toBe(200);
  });
});

describe("FR-3.2.3 join with a code", () => {
  it("FR-3.2.3 a student previews and joins a free class", async () => {
    const { code } = await seedClass(w.schoolId, [w.teacher.uid], { name: "Free class" });
    const student = await createUser("student");
    const preview = await api().get(`/api/classes/preview?code=${code.toLowerCase()}`).set(bearer(student));
    expect(preview.status).toBe(200);
    expect(preview.body.name).toBe("Free class");
    expect(preview.body).not.toHaveProperty("feeCentavos");
    const join = await api().post("/api/classes/join").set(bearer(student)).send({ code });
    expect(join.status).toBe(201);
    expect(join.body.enrollment.status).toBe("active");
    expect(join.body.enrollment).not.toHaveProperty("paymentStatus");
    const again = await api().post("/api/classes/join").set(bearer(student)).send({ code });
    expect(again.status).toBe(200);
    // Joining links a school-less student to the class's school.
    expect((await col.users().doc(student.uid).get()).data()!.schoolId).toBe(w.schoolId);
  });

  it("Decision 19 archived classes accept no new joins", async () => {
    const { code } = await seedClass(w.schoolId, [w.teacher.uid], { status: "archived" });
    const res = await api().post("/api/classes/join").set(bearer(w.student)).send({ code });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("class_archived");
  });

  it("FR-3.2.3 invalid code formats are rejected", async () => {
    const res = await api().get("/api/classes/preview?code=OOO000").set(bearer(w.student));
    expect(res.status).toBe(400);
  });
});

describe("FR-3.2.4 roster", () => {
  it("FR-3.2.4 staff add students by email and remove them", async () => {
    const { classId } = await seedClass(w.schoolId, [w.teacher.uid]);
    const s = await createUser("student", { schoolId: w.schoolId });
    const add = await api().post(`/api/classes/${classId}/roster`).set(bearer(w.teacher)).send({ email: s.email });
    expect(add.status).toBe(201);
    expect(add.body.status).toBe("active");
    expect(add.body.addedBy).toBe("teacher");
    const roster = await api().get(`/api/classes/${classId}/roster`).set(bearer(w.teacher));
    expect(roster.body.items.map((r: { uid: string }) => r.uid)).toContain(s.uid);
    const del = await api().delete(`/api/classes/${classId}/roster/${s.uid}`).set(bearer(w.teacher));
    expect(del.status).toBe(204);
    expect((await col.enrollments().doc(enrollmentId(classId, s.uid)).get()).data()!.status).toBe("removed");
  });

  it("FR-3.2.4 adding an email with no student account asks the student to sign up first", async () => {
    const { classId } = await seedClass(w.schoolId, [w.teacher.uid]);
    const res = await api().post(`/api/classes/${classId}/roster`).set(bearer(w.admin)).send({ email: "nobody-here@test.nihongo" });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain("sign up");
  });

  it("FR-3.2.4 teachers can't manage another teacher's roster", async () => {
    const { classId } = await seedClass(w.schoolId, [w.teacher.uid]);
    const res = await api().get(`/api/classes/${classId}/roster`).set(bearer(w.otherTeacher));
    expect(res.status).toBe(403);
  });
});

describe("FR-3.10.1 school-wide class management", () => {
  it("FR-3.10.1 a School Admin edits and archives a class, keeping its history", async () => {
    const { classId } = await seedClass(w.schoolId, [w.teacher.uid]);
    await seedEnrollment(classId, w.student.uid, w.schoolId);
    const patch = await api().patch(`/api/classes/${classId}`).set(bearer(w.admin)).send({ name: "Renamed", teacherIds: [w.otherTeacher.uid] });
    expect(patch.status).toBe(200);
    expect(patch.body.teacherIds).toEqual([w.otherTeacher.uid]);
    const del = await api().delete(`/api/classes/${classId}`).set(bearer(w.admin));
    expect(del.status).toBe(204);
    const cls = (await col.classes().doc(classId).get()).data()!;
    expect(cls.status).toBe("archived");
    // Students keep read access to an archived class.
    const view = await api().get(`/api/classes/${classId}`).set(bearer(w.student));
    expect(view.status).toBe(200);
    // Archived classes accept no new content.
    const lesson = await api().post(`/api/classes/${classId}/lessons`).set(bearer(w.admin)).send({ title: "New" });
    expect(lesson.status).toBe(409);
  });

  it("FR-3.10.1 teachers can't reassign teachers", async () => {
    const { classId } = await seedClass(w.schoolId, [w.teacher.uid]);
    expect((await api().patch(`/api/classes/${classId}`).set(bearer(w.teacher)).send({ teacherIds: [w.otherTeacher.uid] })).status).toBe(403);
    expect((await api().patch(`/api/classes/${classId}`).set(bearer(w.teacher)).send({ name: "OK" })).status).toBe(200);
  });

  it("classes have no fee: a fee in the request is ignored", async () => {
    const { classId } = await seedClass(w.schoolId, [w.teacher.uid]);
    const res = await api().patch(`/api/classes/${classId}`).set(bearer(w.admin)).send({ name: "Still free", feeCentavos: 250000 });
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("feeCentavos");
    expect((await col.classes().doc(classId).get()).data()).not.toHaveProperty("feeCentavos");
  });
});

describe("Lessons (decision 9)", () => {
  it("creates, renames, reorders, and deletes only empty lessons", async () => {
    const { classId } = await seedClass(w.schoolId, [w.teacher.uid]);
    const a = await api().post(`/api/classes/${classId}/lessons`).set(bearer(w.teacher)).send({ title: "あいさつ" });
    const b = await api().post(`/api/classes/${classId}/lessons`).set(bearer(w.teacher)).send({ title: "家族" });
    expect(b.body.order).toBe(1);
    await api().patch(`/api/lessons/${b.body.id}`).set(bearer(w.teacher)).send({ order: 0 });
    const list = await api().get(`/api/classes/${classId}/lessons`).set(bearer(w.teacher));
    expect(list.body.items.map((l: { title: string }) => l.title)).toEqual(["家族", "あいさつ"]);
    await api().post(`/api/classes/${classId}/flashcards`).set(bearer(w.teacher)).send({ lessonId: a.body.id, term: "おはよう", reading: "おはよう", meaning: "good morning" });
    expect((await api().delete(`/api/lessons/${a.body.id}`).set(bearer(w.teacher))).status).toBe(409);
    expect((await api().delete(`/api/lessons/${b.body.id}`).set(bearer(w.teacher))).status).toBe(204);
  });
});
