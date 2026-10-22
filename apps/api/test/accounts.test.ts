import { beforeAll, describe, expect, it } from "vitest";
import { adminAuth } from "../src/firebase";
import { col } from "../src/db";
import { api, bearer, createWorld, type World } from "./helpers";

let w: World;
beforeAll(async () => {
  w = await createWorld();
});

describe("Who creates which accounts", () => {
  it("only a Content Admin creates a school with its first School Admin", async () => {
    const body = { name: "Osaka Nihongo Center", adminName: "Rina Cruz", adminEmail: "Rina.Cruz@Example.com" };
    for (const who of [w.admin, w.teacher, w.student]) {
      expect((await api().post("/api/schools").set(bearer(who)).send(body)).status).toBe(403);
    }
    const res = await api().post("/api/schools").set(bearer(w.contentAdmin)).send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.sendPasswordResetTo).toBe("rina.cruz@example.com");
    expect(res.body.school).toMatchObject({ name: "Osaka Nihongo Center", seats: { free: 5, total: 5, used: 0 } });
    expect(res.body.school.admins).toEqual([expect.objectContaining({ name: "Rina Cruz", email: "rina.cruz@example.com", invited: true })]);
    const uid = (await adminAuth.getUserByEmail("rina.cruz@example.com")).uid;
    expect((await col.users().doc(uid).get()).data()).toMatchObject({ role: "school_admin", schoolId: res.body.school.id });

    const list = await api().get("/api/schools").set(bearer(w.contentAdmin));
    expect(list.body.items.map((s: { id: string }) => s.id)).toContain(res.body.school.id);
  });

  it("a school isn't created when its admin's email is already used", async () => {
    const before = (await col.schools().count().get()).data().count;
    const res = await api().post("/api/schools").set(bearer(w.contentAdmin)).send({ name: "Dup", adminName: "X", adminEmail: w.student.email });
    expect(res.status).toBe(409);
    expect((await col.schools().count().get()).data().count).toBe(before);
  });

  it("only a Content Admin adds or removes School Admins, and a school keeps at least one", async () => {
    const add = { name: "Second Admin", email: "second.admin@example.com" };
    expect((await api().post(`/api/schools/${w.schoolId}/admins`).set(bearer(w.admin)).send(add)).status).toBe(403);
    const res = await api().post(`/api/schools/${w.schoolId}/admins`).set(bearer(w.contentAdmin)).send(add);
    expect(res.status).toBe(201);
    const second = res.body.school.admins.find((a: { email: string }) => a.email === add.email);
    expect(second).toBeTruthy();

    expect((await api().delete(`/api/schools/${w.schoolId}/admins/${second.uid}`).set(bearer(w.admin))).status).toBe(403);
    expect((await api().delete(`/api/schools/${w.schoolId}/admins/${second.uid}`).set(bearer(w.contentAdmin))).status).toBe(204);
    const last = await api().delete(`/api/schools/${w.schoolId}/admins/${w.admin.uid}`).set(bearer(w.contentAdmin));
    expect(last.status).toBe(409);
    expect(last.body.error.code).toBe("last_admin");
  });

  it("a School Admin can't promote anyone to School Admin", async () => {
    const res = await api().patch(`/api/users/${w.teacher.uid}`).set(bearer(w.admin)).send({ role: "school_admin" });
    expect(res.status).toBe(400);
  });

  it("students register themselves and always get the student role", async () => {
    const email = "self.signup@example.com";
    await adminAuth.createUser({ email, password: "password-123" });
    const tokenRes = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password-123", returnSecureToken: true }),
    });
    const { idToken } = (await tokenRes.json()) as { idToken: string };
    const res = await api().post("/api/auth/register").set({ Authorization: `Bearer ${idToken}` }).send({ name: "Self", privacyConsent: true, role: "teacher" });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("student");
  });
});
