import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import {
  classCodeSchema,
  classCreateSchema,
  classPatchSchema,
  joinClassSchema,
  rosterAddSchema,
  type ClassDto,
  type ClassPreviewDto,
  type EnrollmentDto,
  type PersonRef,
  type RosterEntryDto,
} from "@nihongo/shared";
import { z } from "zod";
import { db } from "../firebase";
import { col, enrollmentId, type ClassDoc, type EnrollmentDoc, type UserDoc } from "../db";
import { assertClassAccess, isClassStaff, loadClass } from "../lib/access";
import { assertSchoolAdmin, currentUser, requireRole, type AuthedUser } from "../lib/auth";
import { audit } from "../lib/audit";
import { pickFreeCode } from "../lib/codes";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { limiter } from "../lib/rateLimit";
import { iso, now } from "../lib/time";
import { params, parse } from "../lib/validate";
import { afterEnrollmentActivated, linkStudentToSchool } from "../services/enrollment";

export const classesRouter = Router();

export async function peopleRefs(uids: string[]): Promise<Map<string, UserDoc>> {
  const unique = [...new Set(uids)].filter(Boolean);
  if (!unique.length) return new Map();
  const snaps = await db.getAll(...unique.map((u) => col.users().doc(u)));
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s.data() as UserDoc]));
}

export function enrollmentDto(d: EnrollmentDoc): EnrollmentDto {
  return {
    classId: d.classId,
    uid: d.uid,
    status: d.status,
    addedBy: d.addedBy,
    joinedAt: iso(d.joinedAt),
  };
}

export function classDto(
  id: string,
  d: ClassDoc,
  opts: { staff: boolean; people: Map<string, UserDoc>; enrollment?: EnrollmentDoc | null; studentCount?: number },
): ClassDto {
  const teachers: PersonRef[] = d.teacherIds.map((uid) => ({ uid, name: opts.people.get(uid)?.name ?? "Teacher" }));
  return {
    id,
    schoolId: d.schoolId,
    name: d.name,
    level: d.level,
    ...(opts.staff ? { code: d.code } : {}),
    teacherIds: d.teacherIds,
    teachers,
    status: d.status,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
    ...(opts.studentCount !== undefined ? { studentCount: opts.studentCount } : {}),
    ...(opts.enrollment !== undefined ? { enrollment: opts.enrollment ? enrollmentDto(opts.enrollment) : null } : {}),
  };
}

async function activeStudentCount(classId: string) {
  const agg = await col.enrollments().where("classId", "==", classId).where("status", "==", "active").count().get();
  return agg.data().count;
}

async function assertSchoolTeachers(schoolId: string, teacherIds: string[]) {
  const people = await peopleRefs(teacherIds);
  for (const id of teacherIds) {
    const p = people.get(id);
    if (!p || p.role !== "teacher" || p.schoolId !== schoolId || p.disabled) {
      throw badRequest("Choose teachers from your school.", { teacherId: id }, "invalid_teacher");
    }
  }
}

// ---------- List and create (FR-3.2.1) ----------

classesRouter.get("/classes", requireRole("teacher", "school_admin", "student"), async (req, res) => {
  const u = currentUser(req);
  let docs: { id: string; data: ClassDoc; enrollment?: EnrollmentDoc | null }[] = [];
  if (u.role === "teacher") {
    const snap = await col.classes().where("teacherIds", "array-contains", u.uid).get();
    docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  } else if (u.role === "school_admin") {
    if (!u.schoolId) throw forbidden("Your account isn't linked to a school.");
    const snap = await col.classes().where("schoolId", "==", u.schoolId).get();
    docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  } else {
    const enr = await col.enrollments().where("uid", "==", u.uid).where("status", "==", "active").get();
    if (!enr.empty) {
      const snaps = await db.getAll(...enr.docs.map((e) => col.classes().doc(e.data().classId)));
      const byClass = new Map(enr.docs.map((e) => [e.data().classId, e.data()]));
      docs = snaps.filter((s) => s.exists).map((s) => ({ id: s.id, data: s.data() as ClassDoc, enrollment: byClass.get(s.id) ?? null }));
    }
  }
  const people = await peopleRefs(docs.flatMap((d) => d.data.teacherIds));
  const staff = u.role !== "student";
  const counts = staff ? await Promise.all(docs.map((d) => activeStudentCount(d.id))) : [];
  const items = docs
    .map((d, i) => classDto(d.id, d.data, { staff, people, studentCount: staff ? counts[i] : undefined, enrollment: staff ? undefined : d.enrollment }))
    .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === "active" ? -1 : 1));
  res.json({ items });
});

classesRouter.post("/classes", requireRole("teacher", "school_admin"), async (req, res) => {
  const u = currentUser(req);
  const body = parse(classCreateSchema, req.body);
  if (!u.schoolId) throw forbidden("Your account isn't linked to a school.");
  let teacherIds: string[];
  if (u.role === "teacher") teacherIds = [u.uid];
  else {
    teacherIds = [...new Set(body.teacherIds ?? [])];
    await assertSchoolTeachers(u.schoolId, teacherIds);
  }
  const ref = col.classes().doc();
  const doc = await db.runTransaction(async (tx) => {
    const code = await pickFreeCode(tx);
    const data: ClassDoc = {
      schoolId: u.schoolId!,
      name: body.name,
      level: body.level,
      code,
      teacherIds,
      status: "active",
      createdBy: u.uid,
      createdAt: now(),
      updatedAt: now(),
    };
    tx.create(col.classCodes().doc(code), { classId: ref.id });
    tx.set(ref, data);
    return data;
  }, { maxAttempts: 10 });
  const people = await peopleRefs(teacherIds);
  res.status(201).json(classDto(ref.id, doc, { staff: true, people, studentCount: 0 }));
});

// ---------- Preview and join (FR-3.2.3, FR-3.13.2) ----------

const previewQuery = z.object({ code: classCodeSchema });

classesRouter.get("/classes/preview", requireRole("student"), limiter("class-preview", 30), async (req, res) => {
  const u = currentUser(req);
  const { code } = parse(previewQuery, req.query);
  const codeSnap = await col.classCodes().doc(code).get();
  if (!codeSnap.exists) throw notFound("No class uses this code. Check it with your teacher.");
  const classId = codeSnap.data()!.classId;
  const cls = await loadClass(classId);
  const [school, people, enrollmentSnap, sessions] = await Promise.all([
    col.schools().doc(cls.schoolId).get(),
    peopleRefs(cls.teacherIds),
    col.enrollments().doc(enrollmentId(classId, u.uid)).get(),
    col
      .liveSessions()
      .where("classId", "==", classId)
      .where("status", "==", "scheduled")
      .where("startAt", ">=", Timestamp.now())
      .orderBy("startAt")
      .limit(3)
      .get(),
  ]);
  const schoolDoc = school.data();
  const enrollment = enrollmentSnap.exists ? enrollmentSnap.data()! : null;
  const preview: ClassPreviewDto = {
    id: classId,
    code,
    name: cls.name,
    level: cls.level,
    teachers: cls.teacherIds.map((t) => people.get(t)?.name ?? "Teacher"),
    schoolName: schoolDoc?.name ?? "",
    status: cls.status,
    upcomingSessions: sessions.docs.map((s) => ({ title: s.data().title, startAt: iso(s.data().startAt), endAt: iso(s.data().endAt) })),
    enrollment: enrollment ? { status: enrollment.status } : null,
  };
  res.json(preview);
});

classesRouter.post("/classes/join", requireRole("student"), limiter("class-join", 20), async (req, res) => {
  const u = currentUser(req);
  const { code } = parse(joinClassSchema, req.body);
  const codeSnap = await col.classCodes().doc(code).get();
  if (!codeSnap.exists) throw notFound("No class uses this code. Check it with your teacher.");
  const classId = codeSnap.data()!.classId;
  const ref = col.enrollments().doc(enrollmentId(classId, u.uid));
  const result = await db.runTransaction(async (tx) => {
    const [clsSnap, enrSnap] = await Promise.all([tx.get(col.classes().doc(classId)), tx.get(ref)]);
    const cls = clsSnap.data();
    if (!cls) throw notFound("Class not found.");
    const existing = enrSnap.exists ? enrSnap.data()! : null;
    if (existing?.status === "active") return { enrollment: existing, activated: false };
    // Decision 19: archived classes accept no new joins.
    if (cls.status === "archived") throw conflict("This class is archived and isn't accepting students.", "class_archived");
    if (existing?.status === "removed") throw forbidden("Your teacher removed you from this class. Ask them to add you back.", "removed_from_class");
    const enrollment: EnrollmentDoc = {
      classId,
      uid: u.uid,
      schoolId: cls.schoolId,
      status: "active",
      addedBy: "self",
      joinedAt: existing?.joinedAt ?? now(),
      activatedAt: now(),
    };
    tx.set(ref, enrollment);
    return { enrollment, activated: true, schoolId: cls.schoolId };
  });
  if (result.activated) {
    await linkStudentToSchool(u.uid, result.enrollment.schoolId);
    await afterEnrollmentActivated(classId, u.uid);
  }
  res.status(result.activated ? 201 : 200).json({ classId, enrollment: enrollmentDto(result.enrollment) });
});

// ---------- Single class ----------

classesRouter.get("/classes/:id", requireRole("teacher", "school_admin", "student"), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const cls = await loadClass(id);
  let enrollment: EnrollmentDoc | null | undefined;
  const staff = isClassStaff(u, cls);
  if (!staff) {
    if (u.role !== "student") throw forbidden("Only this class's teachers and school admins can open it.", "not_class_staff");
    const snap = await col.enrollments().doc(enrollmentId(id, u.uid)).get();
    enrollment = snap.exists ? snap.data()! : null;
    if (!enrollment || enrollment.status !== "active") {
      throw forbidden("You aren't enrolled in this class.", "not_enrolled");
    }
  }
  const people = await peopleRefs(cls.teacherIds);
  const dto = classDto(id, cls, { staff, people, enrollment, studentCount: staff ? await activeStudentCount(id) : undefined });
  if (!staff) dto.schoolName = (await col.schools().doc(cls.schoolId).get()).data()?.name ?? "";
  res.json(dto);
});

classesRouter.patch("/classes/:id", requireRole("teacher", "school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const body = parse(classPatchSchema, req.body);
  const { cls } = await assertClassAccess(u, id, "staff", { write: true });
  if (body.teacherIds !== undefined && u.role !== "school_admin") throw forbidden("Only a School Admin can assign teachers.", "wrong_role");
  const update: Partial<ClassDoc> = { updatedAt: now() };
  if (body.name) update.name = body.name;
  if (body.level) update.level = body.level;
  if (body.teacherIds) {
    await assertSchoolTeachers(cls.schoolId, body.teacherIds);
    update.teacherIds = [...new Set(body.teacherIds)];
  }
  await col.classes().doc(id).update(update);
  const next = { ...cls, ...update } as ClassDoc;
  res.json(classDto(id, next, { staff: true, people: await peopleRefs(next.teacherIds) }));
});

/** FR-3.10.1: removing archives the class and keeps its history (decision 19). */
classesRouter.delete("/classes/:id", requireRole("school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const cls = await loadClass(id);
  assertSchoolAdmin(u, cls.schoolId);
  await col.classes().doc(id).update({ status: "archived", updatedAt: now() });
  await audit({ actorUid: u.uid, action: "class.archived", targetType: "class", targetId: id, schoolId: cls.schoolId });
  res.status(204).end();
});

/** FR-3.2.2: staff regenerate the code; the old one stops working. */
classesRouter.post("/classes/:id/code", requireRole("teacher", "school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  await assertClassAccess(u, id, "staff", { write: true });
  const code = await db.runTransaction(async (tx) => {
    const snap = await tx.get(col.classes().doc(id));
    const fresh = await pickFreeCode(tx);
    tx.delete(col.classCodes().doc(snap.data()!.code));
    tx.create(col.classCodes().doc(fresh), { classId: id });
    tx.update(col.classes().doc(id), { code: fresh, updatedAt: now() });
    return fresh;
  }, { maxAttempts: 10 });
  res.json({ code });
});

// ---------- Roster (FR-3.2.4) ----------

classesRouter.get("/classes/:id/roster", requireRole("teacher", "school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  await assertClassAccess(u, id, "staff");
  const snap = await col.enrollments().where("classId", "==", id).get();
  const people = await peopleRefs(snap.docs.map((d) => d.data().uid));
  const items: RosterEntryDto[] = snap.docs
    .map((d) => d.data())
    .map((e) => ({
      uid: e.uid,
      name: people.get(e.uid)?.name ?? "Student",
      email: people.get(e.uid)?.email ?? "",
      status: e.status,
      addedBy: e.addedBy,
      joinedAt: iso(e.joinedAt),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({ items });
});

classesRouter.post("/classes/:id/roster", requireRole("teacher", "school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const body = parse(rosterAddSchema, req.body);
  const { cls } = await assertClassAccess(u, id, "staff", { write: true });
  const found = await col.users().where("email", "==", body.email).limit(1).get();
  if (found.empty) throw notFound("No student account uses this email. Ask the student to sign up in the app first.");
  const student = found.docs[0];
  const sd = student.data();
  if (sd.role !== "student") throw badRequest("This email belongs to a staff account, not a student.", undefined, "not_a_student");
  if (sd.disabled) throw badRequest("This student's account is disabled.", undefined, "account_disabled");
  if (sd.schoolId && sd.schoolId !== cls.schoolId) throw forbidden("This student belongs to another school.", "wrong_school");

  const result = await addToRoster(u, id, cls, student.id);
  res.status(201).json(result);
});

/** Staff add an existing student account to a class. Classes are free, so it's active at once. */
async function addToRoster(u: AuthedUser, classId: string, cls: ClassDoc, studentUid: string) {
  const ref = col.enrollments().doc(enrollmentId(classId, studentUid));
  const existing = (await ref.get()).data();
  if (existing?.status === "active") throw conflict("This student is already in the class.", "already_enrolled");
  const enrollment: EnrollmentDoc = {
    classId,
    uid: studentUid,
    schoolId: cls.schoolId,
    status: "active",
    addedBy: u.role === "teacher" ? "teacher" : "admin",
    joinedAt: existing?.joinedAt ?? now(),
    activatedAt: now(),
  };
  await ref.set(enrollment);
  await linkStudentToSchool(studentUid, cls.schoolId);
  await afterEnrollmentActivated(classId, studentUid);
  return enrollmentDto(enrollment);
}

classesRouter.delete("/classes/:id/roster/:uid",requireRole("teacher", "school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { id, uid } = params(req);
  await assertClassAccess(u, id, "staff");
  const ref = col.enrollments().doc(enrollmentId(id, uid));
  const snap = await ref.get();
  if (!snap.exists) throw notFound("This student isn't in the class.");
  await ref.update({ status: "removed" });
  await audit({ actorUid: u.uid, action: "enrollment.removed", targetType: "enrollment", targetId: ref.id, schoolId: snap.data()!.schoolId });
  res.status(204).end();
});
