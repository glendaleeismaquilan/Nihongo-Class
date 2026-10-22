import { beforeAll, describe, expect, it } from "vitest";
import { adminAuth } from "../src/firebase";
import { col } from "../src/db";
import { api, bearer, createUser, createWorld, signIn, type World } from "./helpers";

let w: World;
beforeAll(async () => {
  w = await createWorld();
});

describe("FR-3.1.1 account creation", () => {
  it("FR-3.1.1 self-registration always creates a student, ignoring a role in the body", async () => {
    const u = await createUser("student", { profile: false });
    const res = await api()
      .post("/api/auth/register")
      .set(bearer(u))
      .send({ name: "Hana", privacyConsent: true, role: "school_admin", studyLevel: "N4" });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("student");
    expect(res.body.privacyConsentAt).toBeTruthy();
    const again = await api().post("/api/auth/register").set(bearer(u)).send({ name: "Hana", privacyConsent: true });
    expect(again.status).toBe(200);
  });

  it("FR-3.1.1 registration requires privacy consent", async () => {
    const u = await createUser("student", { profile: false });
    const res = await api().post("/api/auth/register").set(bearer(u)).send({ name: "Ken" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("FR-3.1.1 a School Admin creates teacher accounts for their school", async () => {
    const res = await api()
      .post(`/api/schools/${w.schoolId}/users`)
      .set(bearer(w.admin))
      .send({ name: "Sato Sensei", email: "Sato.Teacher@Example.com", role: "teacher" });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("teacher");
    expect(res.body.user.email).toBe("sato.teacher@example.com");
    expect(res.body.sendPasswordReset).toBe(true);
    const authUser = await adminAuth.getUserByEmail("sato.teacher@example.com");
    expect(authUser.uid).toBe(res.body.user.uid);

    const dup = await api()
      .post(`/api/schools/${w.schoolId}/users`)
      .set(bearer(w.admin))
      .send({ name: "Sato", email: "sato.teacher@example.com" });
    expect(dup.status).toBe(409);
  });

  it("a School Admin can't create students or School Admins; students sign up themselves", async () => {
    for (const role of ["student", "school_admin", "content_admin"]) {
      const res = await api().post(`/api/schools/${w.schoolId}/users`).set(bearer(w.admin)).send({ name: "X", email: `no-${role}@example.com`, role });
      expect(res.status, role).toBe(400);
    }
    // A student's email can't be turned into a staff account.
    const taken = await api().post(`/api/schools/${w.schoolId}/users`).set(bearer(w.admin)).send({ name: "S", email: w.student.email });
    expect(taken.status).toBe(409);
    expect(taken.body.error.message).toContain("student account");
  });

  it("FR-3.1.1 a School Admin can't create users in another school", async () => {
    const res = await api()
      .post(`/api/schools/other-school/users`)
      .set(bearer(w.admin))
      .send({ name: "X", email: "x@example.com" });
    expect(res.status).toBe(403);
  });
});

describe("FR-3.1.2 invalid credentials", () => {
  it("FR-3.1.2 a request without a valid token gets 401 with a generic message", async () => {
    const res = await api().get("/api/me").set({ Authorization: "Bearer not-a-token" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).not.toMatch(/email/i);
  });

  it("FR-3.1.2 wrong password and unknown email both fail sign-in", async () => {
    await expect(signIn(w.student.email, "wrong-password")).rejects.toThrow();
    await expect(signIn("nobody@test.nihongo", "wrong-password")).rejects.toThrow();
  });
});

describe("FR-3.1.3 role routing", () => {
  it("FR-3.1.3 /me returns the role from users/{uid}", async () => {
    const res = await api().get("/api/me").set(bearer(w.teacher));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("teacher");
    expect(res.body.school.id).toBe(w.schoolId);
  });

  it("SRS 5.2 the role comes from Firestore, not custom claims", async () => {
    const u = await createUser("student");
    await adminAuth.setCustomUserClaims(u.uid, { role: "school_admin" });
    const token = await signIn(u.email, "password-123");
    const res = await api().get(`/api/schools/${w.schoolId}/users`).set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(403);
  });

  it("FR-3.1.3 disabled accounts are refused", async () => {
    const u = await createUser("student", { schoolId: w.schoolId });
    await col.users().doc(u.uid).update({ disabled: true });
    const res = await api().get("/api/me").set(bearer(u));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("account_disabled");
  });
});

describe("FR-3.10.2 people management", () => {
  it("FR-3.10.2 lists, renames, and deactivates teachers", async () => {
    const created = await api()
      .post(`/api/schools/${w.schoolId}/users`)
      .set(bearer(w.admin))
      .send({ name: "Yui Tanaka", email: "yui.tanaka@example.com" });
    const uid = created.body.user.uid;
    const list = await api().get(`/api/schools/${w.schoolId}/users?role=teacher`).set(bearer(w.admin));
    expect(list.status).toBe(200);
    expect(list.body.items.some((i: { uid: string }) => i.uid === uid)).toBe(true);

    const patched = await api().patch(`/api/users/${uid}`).set(bearer(w.admin)).send({ name: "Yui T." });
    expect(patched.body.name).toBe("Yui T.");

    const del = await api().delete(`/api/users/${uid}`).set(bearer(w.admin));
    expect(del.status).toBe(204);
    expect((await col.users().doc(uid).get()).data()!.disabled).toBe(true);
  });

  it("FR-3.10.2 PATCH /me records privacy consent once", async () => {
    const u = await createUser("student", { schoolId: w.schoolId });
    await col.users().doc(u.uid).update({ privacyConsentAt: null });
    const res = await api().patch("/api/me").set(bearer(u)).send({ privacyConsent: true, studyLevel: "N3" });
    expect(res.status).toBe(200);
    expect(res.body.privacyConsentAt).toBeTruthy();
    expect(res.body.studyLevel).toBe("N3");
  });
});
