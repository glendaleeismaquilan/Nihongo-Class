/**
 * `npm run seed`: demo data for the emulators (§15 step 5).
 * Refuses to touch a real project unless --force is passed.
 */
import { env, usingEmulators } from "../src/env";
import { adminAuth, db } from "../src/firebase";
import { col, type UserDoc } from "../src/db";
import { Timestamp } from "firebase-admin/firestore";
import { now } from "../src/lib/time";
import type { Role } from "@nihongo/shared";
import { seedClasses } from "./classes";
import { seedLibrary } from "./library";
import { seedMaterials } from "./materials";
import { seedLive } from "./live";
import { seedBilling } from "./payments";
import { seedDrive } from "./drive";

const force = process.argv.includes("--force");
if (!usingEmulators && !force) {
  console.error(`Refusing to seed ${env.FIREBASE_PROJECT_ID}: FIRESTORE_EMULATOR_HOST isn't set. Pass --force to seed a real project.`);
  process.exit(1);
}

const PASSWORD = "nihongo123";
const logins: { role: string; name: string; email: string }[] = [];

async function upsertUser(role: Role, name: string, email: string, schoolId: string | null, extra: Partial<UserDoc> = {}) {
  let uid: string;
  try {
    uid = (await adminAuth.getUserByEmail(email)).uid;
    await adminAuth.updateUser(uid, { password: PASSWORD, displayName: name, disabled: false });
  } catch {
    uid = (await adminAuth.createUser({ email, password: PASSWORD, displayName: name, emailVerified: true })).uid;
  }
  await col.users().doc(uid).set({
    role,
    name,
    email,
    schoolId,
    studyLevel: null,
    timeZone: "Asia/Manila",
    privacyConsentAt: now(),
    disabled: false,
    createdAt: now(),
    ...extra,
  });
  logins.push({ role, name, email });
  return uid;
}

export interface SeedContext {
  schoolId: string;
  adminUid: string;
  contentAdminUid: string;
  teacherUids: string[];
  studentUids: string[];
}

async function seedPeople(): Promise<SeedContext> {
  const schoolId = "demo-school";
  await col.schools().doc(schoolId).set({
    name: "Demo Nihongo School",
    timeZone: "Asia/Manila",
    extraTeacherSeats: 0,
    createdAt: now(),
  });

  const adminUid = await upsertUser("school_admin", "Maria Santos", "admin@demo.nihongo", schoolId);
  const contentAdminUid = await upsertUser("content_admin", "Kenji Mori", "content@demo.nihongo", null);
  const teacherUids = [
    // Tanaka has Premium (15-minute calls, 1 GB); Sato is on the free plan.
    await upsertUser("teacher", "Yuki Tanaka", "tanaka@demo.nihongo", schoolId, { premiumSince: Timestamp.fromMillis(Date.now() - 10 * 86_400_000), storageUsedBytes: 0 }),
    await upsertUser("teacher", "Hiroshi Sato", "sato@demo.nihongo", schoolId, { storageUsedBytes: 0 }),
  ];
  const students: [string, string, string][] = [
    ["Juan dela Cruz", "juan@demo.nihongo", "N5"],
    ["Ana Reyes", "ana@demo.nihongo", "N5"],
    ["Paolo Garcia", "paolo@demo.nihongo", "N4"],
    ["Bea Mendoza", "bea@demo.nihongo", "N4"],
    ["Carlo Bautista", "carlo@demo.nihongo", "N5"],
    ["Liza Villanueva", "liza@demo.nihongo", "N4"],
  ];
  const studentUids: string[] = [];
  for (const [name, email, level] of students) {
    studentUids.push(await upsertUser("student", name, email, schoolId, { studyLevel: level as UserDoc["studyLevel"] }));
  }
  return { schoolId, adminUid, contentAdminUid, teacherUids, studentUids };
}

async function main() {
  const ctx = await seedPeople();
  const classes = await seedClasses(ctx);
  console.log("Classes: N5 Saturday Class (code N5SATK), N4 Evening Class (code N4EVE7). Both free");
  await seedLibrary(ctx);
  console.log("Built-in library: N5 and N4 flashcards and quizzes, two reading tests, one listening test (spoken clips from seed/clips/)");
  await seedLive(ctx, classes);
  console.log("Live classes: an upcoming Saturday class with a pasted Meet link, last week's with attendance");
  await seedMaterials(ctx, classes);
  console.log("Materials: a pinned handout PDF in N5 Saturday Class");
  await seedDrive(ctx);
  console.log("My Drive: Tanaka has a Lesson plans folder with a PDF");
  await seedBilling(ctx);
  console.log("Billing: Tanaka paid for Premium; the school uses 2 of its 5 free teacher slots");
  await db.terminate();
  console.log("\nDemo logins (password for all: %s)", PASSWORD);
  console.table(logins);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
