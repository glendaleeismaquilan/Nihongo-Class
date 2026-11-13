/**
 * Change (or just inspect) a Firebase user's role.
 *
 *   # See what role the server thinks an email has:
 *   npm run set-role -w @nihongo/api -- --email tanaka@demo.nihongo
 *
 *   # Promote a user to teacher inside a school:
 *   npm run set-role -w @nihongo/api -- --email tanaka@demo.nihongo --role teacher --school demo-school
 *
 *   # Content admin (no school):
 *   npm run set-role -w @nihongo/api -- --email content@demo.nihongo --role content_admin
 *
 * Writes Firebase Auth + Firestore and prints the new record.
 */
import { parseArgs } from "node:util";
import { env } from "../src/env";
import { adminAuth, db } from "../src/firebase";
import { col } from "../src/db";
import { now } from "../src/lib/time";

const ROLES = ["student", "teacher", "school_admin", "content_admin"] as const;
type Role = (typeof ROLES)[number];

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    role: { type: "string" },
    school: { type: "string" },
    name: { type: "string" },
  },
});

async function main() {
  if (!values.email) throw new Error("--email is required");
  const email = values.email.toLowerCase();

  // Find the Firebase Auth user first — the Firestore doc id matches.
  const fbUser = await adminAuth.getUserByEmail(email).catch(() => null);
  if (!fbUser) throw new Error(`No Firebase Auth user has email ${email}. Sign in on the app at least once first.`);
  const uid = fbUser.uid;

  // Read what's currently in Firestore.
  const ref = col.users().doc(uid);
  const snap = await ref.get();
  const current = snap.exists ? snap.data()! : null;

  console.log("\n=== Current ===");
  console.log("Firebase Auth uid:", uid);
  console.log("Firebase Auth displayName:", fbUser.displayName ?? "(unset)");
  console.log("Firebase Auth emailVerified:", fbUser.emailVerified);
  console.log("Firestore doc exists:", !!current);
  if (current) {
    console.log("Firestore role:", current.role);
    console.log("Firestore name:", current.name);
    console.log("Firestore schoolId:", current.schoolId ?? "(none)");
  }

  if (!values.role) {
    console.log("\nNo --role passed, so just inspecting. Run again with --role <student|teacher|school_admin|content_admin> to change it.");
    await db.terminate();
    return;
  }

  const role = values.role as Role;
  if (!ROLES.includes(role)) throw new Error(`--role must be one of: ${ROLES.join(", ")}`);

  // Enforce the schoolId rules the server itself enforces.
  let schoolId: string | null = null;
  if (role === "teacher" || role === "school_admin" || role === "student") {
    if (values.school) schoolId = values.school;
    else if (current?.schoolId) schoolId = current.schoolId;
    else if (role !== "student") throw new Error(`--school <schoolId> is required for ${role}. Try --school demo-school`);
  }
  if (schoolId) {
    const schoolSnap = await col.schools().doc(schoolId).get();
    if (!schoolSnap.exists) throw new Error(`No school with id ${schoolId}`);
  }

  const name = values.name ?? current?.name ?? fbUser.displayName ?? email.split("@")[0];
  const doc = {
    role,
    name,
    email,
    schoolId,
    studyLevel: role === "student" ? (current?.studyLevel ?? null) : null,
    timeZone: current?.timeZone ?? env.DEFAULT_TIME_ZONE,
    privacyConsentAt: current?.privacyConsentAt ?? now(),
    disabled: false,
    createdAt: current?.createdAt ?? now(),
  };
  await ref.set(doc, { merge: false });

  console.log("\n=== Updated ===");
  console.log("role:", role);
  console.log("name:", name);
  console.log("schoolId:", schoolId ?? "(none)");
  console.log("\nSign out and back in on the app for the role to take effect.");
  await db.terminate();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
