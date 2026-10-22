/**
 * Decision 2: creates a Content Admin, or a School Admin (and their school).
 *
 *   npm run create-admin -- --role content_admin --email kenji@example.com --name "Kenji Mori"
 *   npm run create-admin -- --role school_admin --email maria@example.com --name "Maria Santos" --school-name "Sakura Nihongo Center"
 *   npm run create-admin -- --role school_admin --email ben@example.com --name "Ben Cruz" --school <existingSchoolId>
 *
 * The new admin gets a password-reset link printed here (and emailed by the
 * web app's reset screen) to set a password.
 */
import { parseArgs } from "node:util";
import { env } from "../src/env";
import { adminAuth, db } from "../src/firebase";
import { col } from "../src/db";
import { now } from "../src/lib/time";

const { values } = parseArgs({
  options: {
    role: { type: "string" },
    email: { type: "string" },
    name: { type: "string" },
    school: { type: "string" },
    "school-name": { type: "string" },
    "time-zone": { type: "string" },
  },
});

async function main() {
  const role = values.role;
  if (role !== "content_admin" && role !== "school_admin") throw new Error("--role must be content_admin or school_admin");
  if (!values.email || !values.name) throw new Error("--email and --name are required");
  const email = values.email.toLowerCase();

  let schoolId: string | null = null;
  if (role === "school_admin") {
    if (values.school) {
      const snap = await col.schools().doc(values.school).get();
      if (!snap.exists) throw new Error(`No school with id ${values.school}`);
      schoolId = values.school;
    } else if (values["school-name"]) {
      const ref = col.schools().doc();
      await ref.set({
        name: values["school-name"],
        timeZone: values["time-zone"] ?? env.DEFAULT_TIME_ZONE,
        extraTeacherSeats: 0,
        createdAt: now(),
      });
      schoolId = ref.id;
      console.log(`Created school ${values["school-name"]} (${ref.id})`);
    } else throw new Error("A school_admin needs --school <id> or --school-name <name>");
  }

  let uid: string;
  try {
    uid = (await adminAuth.getUserByEmail(email)).uid;
  } catch {
    uid = (await adminAuth.createUser({ email, displayName: values.name })).uid;
  }
  await col.users().doc(uid).set({
    role,
    name: values.name,
    email,
    schoolId,
    studyLevel: null,
    timeZone: values["time-zone"] ?? env.DEFAULT_TIME_ZONE,
    privacyConsentAt: null,
    disabled: false,
    createdAt: now(),
  });
  const link = await adminAuth.generatePasswordResetLink(email).catch(() => null);
  console.log(`Created ${role} ${values.name} <${email}> (${uid})`);
  if (link) console.log(`Set-password link: ${link}`);
  await db.terminate();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
