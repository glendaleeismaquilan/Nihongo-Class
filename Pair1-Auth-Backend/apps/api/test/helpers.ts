import { randomUUID } from "node:crypto";
import request from "supertest";
import * as XLSX from "xlsx";
import { CLASS_CODE_ALPHABET, type Role } from "@nihongo/shared";
import { createApp } from "../src/app";
import { adminAuth, db } from "../src/firebase";
import { col, enrollmentId, type ClassDoc, type EnrollmentDoc } from "../src/db";
import { now } from "../src/lib/time";

export const app = createApp();
export const api = () => request(app);

const AUTH_EMULATOR = "http://127.0.0.1:9099";

export interface TestUser {
  uid: string;
  email: string;
  token: string;
  role: Role;
  schoolId: string | null;
}

export async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const json = (await res.json()) as { idToken?: string; error?: unknown };
  if (!json.idToken) throw new Error(`sign-in failed: ${JSON.stringify(json.error)}`);
  return json.idToken;
}

/** Creates an Auth user and (unless profile: false) its users/{uid} document. */
export async function createUser(
  role: Role,
  opts: { schoolId?: string | null; name?: string; profile?: boolean; timeZone?: string } = {},
): Promise<TestUser> {
  const email = `${role.replace("_", "-")}-${randomUUID().slice(0, 8)}@test.nihongo`;
  const password = "password-123";
  const { uid } = await adminAuth.createUser({ email, password });
  if (opts.profile !== false) {
    await col.users().doc(uid).set({
      role,
      name: opts.name ?? `${role} ${uid.slice(0, 4)}`,
      email,
      schoolId: opts.schoolId ?? null,
      studyLevel: role === "student" ? "N5" : null,
      timeZone: opts.timeZone ?? "Asia/Manila",
      privacyConsentAt: now(),
      disabled: false,
      createdAt: now(),
    });
  }
  const token = await signIn(email, password);
  return { uid, email, token, role, schoolId: opts.schoolId ?? null };
}

export async function createSchool(overrides: Partial<{ name: string; extraTeacherSeats: number }> = {}) {
  const ref = col.schools().doc();
  await ref.set({
    name: overrides.name ?? "Test School",
    timeZone: "Asia/Manila",
    extraTeacherSeats: overrides.extraTeacherSeats ?? 0,
    createdAt: now(),
  });
  return ref.id;
}

export interface World {
  schoolId: string;
  admin: TestUser;
  teacher: TestUser;
  otherTeacher: TestUser;
  student: TestUser;
  contentAdmin: TestUser;
}

export async function createWorld(): Promise<World> {
  const schoolId = await createSchool();
  const [admin, teacher, otherTeacher, student, contentAdmin] = await Promise.all([
    createUser("school_admin", { schoolId }),
    createUser("teacher", { schoolId }),
    createUser("teacher", { schoolId }),
    createUser("student", { schoolId }),
    createUser("content_admin"),
  ]);
  return { schoolId, admin, teacher, otherTeacher, student, contentAdmin };
}

/** Writes a class directly (for tests that aren't about class creation). */
export async function seedClass(schoolId: string, teacherIds: string[], overrides: Partial<ClassDoc> = {}) {
  const ref = col.classes().doc();
  const code = Array.from({ length: 6 }, () => CLASS_CODE_ALPHABET[Math.floor(Math.random() * CLASS_CODE_ALPHABET.length)]).join("");
  await ref.set({
    schoolId,
    name: "Test Class",
    level: "N5",
    code,
    teacherIds,
    status: "active",
    createdBy: teacherIds[0] ?? "system",
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  });
  await col.classCodes().doc(code).set({ classId: ref.id });
  return { classId: ref.id, code };
}

export async function seedEnrollment(classId: string, uid: string, schoolId: string, overrides: Partial<EnrollmentDoc> = {}) {
  await col.enrollments().doc(enrollmentId(classId, uid)).set({
    classId,
    uid,
    schoolId,
    status: "active",
    addedBy: "self",
    joinedAt: now(),
    activatedAt: now(),
    ...overrides,
  });
}

export async function seedLesson(classId: string, title = "Lesson 1", order = 0) {
  const ref = col.lessons().doc();
  await ref.set({ classId, title, order, description: null });
  return ref.id;
}

export const bearer = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

/** Walks a JSON value and returns every path whose key is in `keys` with a non-null value. */
export function findKeys(value: unknown, keys: string[], path = "$"): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) value.forEach((v, i) => hits.push(...findKeys(v, keys, `${path}[${i}]`)));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (keys.includes(k) && v !== undefined && v !== null) hits.push(`${path}.${k}`);
      hits.push(...findKeys(v, keys, `${path}.${k}`));
    }
  }
  return hits;
}

export function xlsxBuffer(rows: unknown[][], sheet = "Sheet1"): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export { db };
