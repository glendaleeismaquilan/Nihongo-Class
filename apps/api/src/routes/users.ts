import { Router } from "express";
import { addSchoolAdminSchema, createSchoolSchema, createSchoolUserSchema, patchUserSchema, schoolPatchSchema, type Role, type SchoolPersonDto, type SchoolSummaryDto } from "@nihongo/shared";
import { z } from "zod";
import { env } from "../env";
import { db, adminAuth } from "../firebase";
import { col, type SchoolDoc, type UserDoc } from "../db";
import { assertSchoolAdmin, currentUser, requireRole } from "../lib/auth";
import { audit } from "../lib/audit";
import { schoolDto, userDto } from "../lib/dto";
import { conflict, forbidden, notFound } from "../lib/errors";
import { now } from "../lib/time";
import { params, parse } from "../lib/validate";
import { assertTeacherSeat, seatsFor } from "../services/plan";

/**
 * Who creates which accounts:
 * - Students sign themselves up in the app (POST /auth/register).
 * - A School Admin adds teachers only, within the school's teacher slots.
 * - Only a Content Admin creates schools and School Admins.
 */
export const usersRouter = Router();

const listQuery = z.object({
  role: z.enum(["teacher", "student", "school_admin"]).optional(),
  q: z.string().trim().max(100).optional(),
});

/**
 * Creates the Firebase account, or reuses an Auth user that has no profile yet.
 * Any account that already has a profile is refused: roles never change by invite.
 */
async function createProfile(email: string, name: string, profile: Omit<UserDoc, "email" | "name" | "createdAt">) {
  let uid: string;
  try {
    uid = (await adminAuth.getUserByEmail(email)).uid;
  } catch (err: any) {
    if (err?.code !== "auth/user-not-found") throw err;
    uid = (await adminAuth.createUser({ email, displayName: name, emailVerified: false })).uid;
  }
  const ref = col.users().doc(uid);
  const doc = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const existing = snap.data()!;
      throw conflict(
        existing.role === "student" ? "This email belongs to a student account. Use a different email for the staff account." : "An account with this email already exists.",
        "email_in_use",
      );
    }
    const fresh: UserDoc = { ...profile, email, name, createdAt: now() };
    tx.set(ref, fresh);
    return fresh;
  });
  return { uid, doc };
}

// ---------- School Admin: people in their school (FR-3.10.2) ----------

usersRouter.get("/schools/:schoolId/users", requireRole("school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { schoolId } = params(req);
  assertSchoolAdmin(u, schoolId);
  const q = parse(listQuery, req.query);
  let query = col.users().where("schoolId", "==", schoolId);
  if (q.role) query = query.where("role", "==", q.role);
  const snap = await query.limit(2000).get();
  const people = new Map<string, UserDoc>(snap.docs.map((d) => [d.id, d.data()]));
  const classesOf = new Map<string, { id: string; name: string }[]>();
  if (!q.role || q.role === "student") {
    // Everyone enrolled in one of this school's classes is listed too, even when their
    // account was first linked to another school (or to none) before they joined.
    const [enrolled, classes] = await Promise.all([
      col.enrollments().where("schoolId", "==", schoolId).where("status", "==", "active").limit(5000).get(),
      col.classes().where("schoolId", "==", schoolId).get(),
    ]);
    const names = new Map(classes.docs.map((d) => [d.id, d.data().name]));
    for (const e of enrolled.docs) {
      const { uid, classId } = e.data();
      classesOf.set(uid, [...(classesOf.get(uid) ?? []), { id: classId, name: names.get(classId) ?? "Class" }]);
    }
    const missing = [...classesOf.keys()].filter((uid) => !people.has(uid));
    for (let i = 0; i < missing.length; i += 300) {
      const docs = await db.getAll(...missing.slice(i, i + 300).map((uid) => col.users().doc(uid)));
      for (const d of docs) {
        const doc = d.data() as UserDoc | undefined;
        if (doc?.role === "student") people.set(d.id, doc);
      }
    }
  }
  let items: SchoolPersonDto[] = [...people].map(([uid, d]) => ({
    ...userDto(uid, d),
    classes: (classesOf.get(uid) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    otherSchool: d.role === "student" && !!d.schoolId && d.schoolId !== schoolId,
  }));
  if (q.q) {
    const needle = q.q.toLowerCase();
    items = items.filter((i) => i.name.toLowerCase().includes(needle) || i.email.includes(needle));
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ items });
});

/**
 * A School Admin adds a teacher. The first 5 teachers are free; more need
 * purchased slots (402 seat_limit_reached). The web app then calls
 * sendPasswordResetEmail so the teacher sets a password.
 */
usersRouter.post("/schools/:schoolId/users", requireRole("school_admin"), async (req, res) => {
  const u = currentUser(req);
  const schoolId = params(req).schoolId;
  assertSchoolAdmin(u, schoolId);
  const body = parse(createSchoolUserSchema, req.body);
  const school = (await col.schools().doc(schoolId).get()).data();
  if (!school) throw notFound("School not found.");
  await assertTeacherSeat(schoolId);
  const { uid, doc } = await createProfile(body.email, body.name, {
    role: "teacher",
    schoolId,
    studyLevel: null,
    timeZone: school.timeZone,
    privacyConsentAt: null,
    disabled: false,
    storageUsedBytes: 0,
  });
  res.status(201).json({ user: userDto(uid, doc), sendPasswordReset: true, seats: await seatsFor(schoolId) });
});

/**
 * Someone the School Admin may manage: a member of the school, or a student in one
 * of its classes. A student with no school yet joins this one. A student whose
 * account belongs to another school is a guest: they can only leave this school's classes.
 */
async function loadSchoolPerson(adminSchoolId: string | null, uid: string) {
  const snap = await col.users().doc(uid).get();
  if (!snap.exists) throw notFound("Person not found.");
  const doc = snap.data()!;
  if (adminSchoolId && doc.schoolId === adminSchoolId) return { doc, guest: false };
  if (adminSchoolId && doc.role === "student") {
    const active = await col.enrollments().where("uid", "==", uid).where("status", "==", "active").get();
    if (active.docs.some((d) => d.data().schoolId === adminSchoolId)) {
      if (doc.schoolId) return { doc, guest: true };
      await col.users().doc(uid).update({ schoolId: adminSchoolId });
      return { doc: { ...doc, schoolId: adminSchoolId }, guest: false };
    }
  }
  throw forbidden("This person isn't in your school.", "wrong_school");
}

usersRouter.patch("/users/:uid", requireRole("school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { uid } = params(req);
  const body = parse(patchUserSchema, req.body);
  const { doc: target, guest } = await loadSchoolPerson(u.schoolId, uid);
  if (guest) throw forbidden("This student's account belongs to another school. You can remove them from your classes.", "other_school");
  const editableRoles: Role[] = ["teacher", "student"];
  if ((body.role || body.disabled !== undefined) && !editableRoles.includes(target.role)) {
    throw forbidden("Only teacher and student accounts can be changed here.");
  }
  const becomesActiveTeacher =
    (body.role === "teacher" && target.role !== "teacher" && !(body.disabled ?? target.disabled)) ||
    (body.disabled === false && target.disabled && (body.role ?? target.role) === "teacher");
  if (becomesActiveTeacher) await assertTeacherSeat(u.schoolId!);
  const update: Partial<UserDoc> = {};
  if (body.name) update.name = body.name;
  if (body.disabled !== undefined) update.disabled = body.disabled;
  if (body.role && body.role !== target.role) {
    if (target.role === "teacher") {
      const assigned = await col.classes().where("teacherIds", "array-contains", uid).limit(1).get();
      if (!assigned.empty) throw conflict("Remove this teacher from their classes before changing the role.", "teacher_assigned");
    }
    update.role = body.role;
    await audit({ actorUid: u.uid, action: "user.role_changed", targetType: "user", targetId: uid, schoolId: u.schoolId, before: { role: target.role }, after: { role: body.role } });
  }
  if (body.disabled !== undefined) await adminAuth.updateUser(uid, { disabled: body.disabled });
  if (body.name) await adminAuth.updateUser(uid, { displayName: body.name }).catch(() => undefined);
  await col.users().doc(uid).update(update);
  res.json(userDto(uid, { ...target, ...update }));
});

/**
 * Removing a person deactivates the account and ends their enrollments,
 * which frees a teacher slot. Attempts, payments, and attendance stay.
 */
usersRouter.delete("/users/:uid", requireRole("school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { uid } = params(req);
  const { doc: target, guest } = await loadSchoolPerson(u.schoolId, uid);
  if (guest) {
    // Their account belongs to another school: they only leave this school's classes.
    const mine = await col.enrollments().where("uid", "==", uid).where("status", "==", "active").get();
    const batch = db.batch();
    mine.docs.filter((d) => d.data().schoolId === u.schoolId).forEach((d) => batch.update(d.ref, { status: "removed" }));
    await batch.commit();
    await audit({ actorUid: u.uid, action: "user.removed_from_school_classes", targetType: "user", targetId: uid, schoolId: u.schoolId });
    res.status(204).end();
    return;
  }
  if (!["teacher", "student"].includes(target.role)) throw forbidden("Only teacher and student accounts can be removed here.");
  if (target.role === "teacher") {
    const assigned = await col.classes().where("teacherIds", "array-contains", uid).limit(1).get();
    if (!assigned.empty) throw conflict("Remove this teacher from their classes first.", "teacher_assigned");
  }
  await adminAuth.updateUser(uid, { disabled: true });
  await col.users().doc(uid).update({ disabled: true });
  const enrollments = await col.enrollments().where("uid", "==", uid).where("status", "==", "active").get();
  const batch = db.batch();
  enrollments.docs.forEach((d) => batch.update(d.ref, { status: "removed" }));
  await batch.commit();
  await audit({ actorUid: u.uid, action: "user.deactivated", targetType: "user", targetId: uid, schoolId: u.schoolId });
  res.status(204).end();
});

usersRouter.get("/schools/:schoolId", async (req, res) => {
  const u = currentUser(req);
  if (u.role !== "content_admin" && u.schoolId !== params(req).schoolId) throw forbidden("This isn't your school.", "wrong_school");
  const snap = await col.schools().doc(params(req).schoolId).get();
  if (!snap.exists) throw notFound("School not found.");
  res.json(schoolDto(snap.id, snap.data()!));
});

usersRouter.patch("/schools/:schoolId", requireRole("school_admin"), async (req, res) => {
  const u = currentUser(req);
  assertSchoolAdmin(u, params(req).schoolId);
  const body = parse(schoolPatchSchema, req.body);
  const ref = col.schools().doc(params(req).schoolId);
  const before = (await ref.get()).data();
  if (!before) throw notFound("School not found.");
  await ref.update(body as Partial<SchoolDoc>);
  res.json(schoolDto(ref.id, { ...before, ...body } as SchoolDoc));
});

// ---------- Content Admin: schools and School Admins ----------

async function schoolSummary(id: string, d: SchoolDoc): Promise<SchoolSummaryDto> {
  const [admins, seats, students, classes] = await Promise.all([
    col.users().where("schoolId", "==", id).where("role", "==", "school_admin").get(),
    seatsFor(id),
    col.users().where("schoolId", "==", id).where("role", "==", "student").count().get(),
    col.classes().where("schoolId", "==", id).count().get(),
  ]);
  return {
    ...schoolDto(id, d),
    admins: admins.docs
      .filter((a) => !a.data().disabled)
      .map((a) => ({ uid: a.id, name: a.data().name, email: a.data().email, invited: !a.data().privacyConsentAt })),
    seats,
    students: students.data().count,
    classes: classes.data().count,
  };
}

usersRouter.get("/schools", requireRole("content_admin"), async (_req, res) => {
  const snap = await col.schools().orderBy("createdAt", "desc").limit(500).get();
  res.json({ items: await Promise.all(snap.docs.map((d) => schoolSummary(d.id, d.data()))) });
});

/** Only a Content Admin creates a school, together with its first School Admin. */
usersRouter.post("/schools", requireRole("content_admin"), async (req, res) => {
  const u = currentUser(req);
  const body = parse(createSchoolSchema, req.body);
  const ref = col.schools().doc();
  const school: SchoolDoc = { name: body.name, timeZone: body.timeZone ?? env.DEFAULT_TIME_ZONE, extraTeacherSeats: 0, createdAt: now() };
  await ref.set(school);
  try {
    const { uid } = await createProfile(body.adminEmail, body.adminName, {
      role: "school_admin",
      schoolId: ref.id,
      studyLevel: null,
      timeZone: school.timeZone,
      privacyConsentAt: null,
      disabled: false,
    });
    await audit({ actorUid: u.uid, action: "school.created", targetType: "school", targetId: ref.id, schoolId: ref.id, after: { name: body.name, adminUid: uid } });
  } catch (err) {
    // Don't leave a school without an admin behind.
    await ref.delete();
    throw err;
  }
  res.status(201).json({ school: await schoolSummary(ref.id, school), sendPasswordResetTo: body.adminEmail });
});

/** Only a Content Admin adds another School Admin to a school. */
usersRouter.post("/schools/:schoolId/admins", requireRole("content_admin"), async (req, res) => {
  const u = currentUser(req);
  const { schoolId } = params(req);
  const body = parse(addSchoolAdminSchema, req.body);
  const school = (await col.schools().doc(schoolId).get()).data();
  if (!school) throw notFound("School not found.");
  const { uid } = await createProfile(body.email, body.name, {
    role: "school_admin",
    schoolId,
    studyLevel: null,
    timeZone: school.timeZone,
    privacyConsentAt: null,
    disabled: false,
  });
  await audit({ actorUid: u.uid, action: "school.admin_added", targetType: "user", targetId: uid, schoolId });
  res.status(201).json({ school: await schoolSummary(schoolId, school), sendPasswordResetTo: body.email });
});

/** A Content Admin removes a School Admin; every school keeps at least one. */
usersRouter.delete("/schools/:schoolId/admins/:uid", requireRole("content_admin"), async (req, res) => {
  const u = currentUser(req);
  const { schoolId, uid } = params(req);
  const target = (await col.users().doc(uid).get()).data();
  if (!target || target.role !== "school_admin" || target.schoolId !== schoolId) throw notFound("School Admin not found.");
  const admins = await col.users().where("schoolId", "==", schoolId).where("role", "==", "school_admin").where("disabled", "==", false).count().get();
  if (admins.data().count <= 1) throw conflict("A school needs at least one School Admin. Add another before removing this one.", "last_admin");
  await adminAuth.updateUser(uid, { disabled: true });
  await col.users().doc(uid).update({ disabled: true });
  await audit({ actorUid: u.uid, action: "school.admin_removed", targetType: "user", targetId: uid, schoolId });
  res.status(204).end();
});
