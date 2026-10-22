import { col, enrollmentId, type ClassDoc, type EnrollmentDoc } from "../db";
import type { AuthedUser } from "./auth";
import { conflict, forbidden, notFound } from "./errors";

export type ClassAccessMode = "student" | "staff" | "member";

export interface ClassAccess {
  cls: ClassDoc;
  classId: string;
  isStaff: boolean;
  enrollment: EnrollmentDoc | null;
}

export async function loadClass(classId: string): Promise<ClassDoc> {
  const snap = await col.classes().doc(classId).get();
  if (!snap.exists) throw notFound("Class not found.");
  return snap.data()!;
}

export function isClassStaff(u: AuthedUser, cls: ClassDoc): boolean {
  if (u.role === "teacher") return cls.teacherIds.includes(u.uid);
  if (u.role === "school_admin") return !!u.schoolId && u.schoolId === cls.schoolId;
  return false;
}

/**
 * The one class-scoped access check (§5), used by every class-scoped route.
 * - "staff": a teacher of the class, or a School Admin of its school.
 * - "student": a student with an active enrollment.
 * - "member": either of the above.
 * Pass `write: true` for changes; archived classes accept none (decision 19).
 */
export async function assertClassAccess(
  u: AuthedUser,
  classId: string,
  mode: ClassAccessMode,
  opts: { write?: boolean; cls?: ClassDoc } = {},
): Promise<ClassAccess> {
  const cls = opts.cls ?? (await loadClass(classId));
  const staff = isClassStaff(u, cls);
  let enrollment: EnrollmentDoc | null = null;

  if (mode === "staff" || (mode === "member" && u.role !== "student")) {
    if (!staff) throw forbidden("Only this class's teachers and school admins can do this.", "not_class_staff");
  } else {
    if (u.role !== "student") throw forbidden("Only enrolled students can do this.", "not_enrolled");
    const snap = await col.enrollments().doc(enrollmentId(classId, u.uid)).get();
    enrollment = snap.exists ? snap.data()! : null;
    if (!enrollment || enrollment.status !== "active") throw forbidden("You aren't enrolled in this class.", "not_enrolled");
  }

  if (opts.write && cls.status === "archived") {
    throw conflict("This class is archived and can't be changed.", "class_archived");
  }
  return { cls, classId, isStaff: staff, enrollment };
}
