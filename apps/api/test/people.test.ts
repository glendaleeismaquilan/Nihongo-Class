import { beforeAll, describe, expect, it } from "vitest";
import type { SchoolPersonDto } from "@nihongo/shared";
import { api, bearer, createSchool, createUser, createWorld, db, seedClass, seedEnrollment, type TestUser, type World } from "./helpers";
import { col } from "../src/db";

let w: World;
let classId: string;
let member: TestUser;
let noSchool: TestUser;
let guest: TestUser;
let elsewhere: TestUser;

beforeAll(async () => {
  w = await createWorld();
  const otherSchool = await createSchool({ name: "Other School" });
  ({ classId } = await seedClass(w.schoolId, [w.teacher.uid], { name: "N5 Saturday Class" }));
  member = w.student;
  [noSchool, guest, elsewhere] = await Promise.all([
    createUser("student", { schoolId: null, name: "No School Yet" }),
    createUser("student", { schoolId: otherSchool, name: "Guest Student" }),
    createUser("student", { schoolId: otherSchool, name: "Only Elsewhere" }),
  ]);
  await Promise.all([
    seedEnrollment(classId, member.uid, w.schoolId),
    seedEnrollment(classId, noSchool.uid, w.schoolId),
    seedEnrollment(classId, guest.uid, w.schoolId),
  ]);
});

const students = async () => {
  const res = await api().get(`/api/schools/${w.schoolId}/users`).query({ role: "student" }).set(bearer(w.admin));
  expect(res.status).toBe(200);
  return res.body.items as SchoolPersonDto[];
};

describe("School Admin People list shows every student in the school's classes", () => {
  it("lists students enrolled in the school's classes, with their classes, whatever school their account has", async () => {
    const items = await students();
    const byUid = new Map(items.map((i) => [i.uid, i]));
    expect([...byUid.keys()]).toEqual(expect.arrayContaining([member.uid, noSchool.uid, guest.uid]));
    expect(byUid.has(elsewhere.uid)).toBe(false);
    expect(byUid.get(guest.uid)!.classes).toEqual([{ id: classId, name: "N5 Saturday Class" }]);
    expect(byUid.get(guest.uid)!.otherSchool).toBe(true);
    expect(byUid.get(member.uid)!.otherSchool).toBe(false);
    expect(byUid.get(noSchool.uid)!.otherSchool).toBe(false);
  });

  it("the teacher tab is unchanged: no students in it", async () => {
    const res = await api().get(`/api/schools/${w.schoolId}/users`).query({ role: "teacher" }).set(bearer(w.admin));
    expect(res.status).toBe(200);
    expect(res.body.items.every((i: SchoolPersonDto) => i.role === "teacher")).toBe(true);
  });

  it("a student with no school can be edited, and joins the school", async () => {
    const res = await api().patch(`/api/users/${noSchool.uid}`).send({ name: "Now Named" }).set(bearer(w.admin));
    expect(res.status).toBe(200);
    expect((await col.users().doc(noSchool.uid).get()).data()!.schoolId).toBe(w.schoolId);
  });

  it("a student from another school can't be edited; Remove only takes them out of this school's classes", async () => {
    const edit = await api().patch(`/api/users/${guest.uid}`).send({ name: "Renamed" }).set(bearer(w.admin));
    expect(edit.status).toBe(403);
    expect(edit.body.error.code).toBe("other_school");
    const del = await api().delete(`/api/users/${guest.uid}`).set(bearer(w.admin));
    expect(del.status).toBe(204);
    const doc = (await col.users().doc(guest.uid).get()).data()!;
    expect(doc.disabled).toBe(false);
    const enr = await db.collection("enrollments").where("uid", "==", guest.uid).get();
    expect(enr.docs.map((d) => d.data().status)).toEqual(["removed"]);
    expect((await students()).some((i) => i.uid === guest.uid)).toBe(false);
  });

  it("a student only in another school's classes stays out of reach", async () => {
    const res = await api().delete(`/api/users/${elsewhere.uid}`).set(bearer(w.admin));
    expect(res.status).toBe(403);
  });
});
