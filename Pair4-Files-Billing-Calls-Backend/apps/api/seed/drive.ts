import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { col, type DriveItemDoc } from "../src/db";
import { putFile } from "../src/lib/storage";
import { now } from "../src/lib/time";
import { samplePdf } from "./materials";
import type { SeedContext } from "./seed";

/** Tanaka's My Drive: one folder with a lesson plan. Run after seedMaterials. */
export async function seedDrive(ctx: SeedContext) {
  const [tanaka] = ctx.teacherUids;
  const dir = join(dirname(fileURLToPath(import.meta.url)), "audio");
  mkdirSync(dir, { recursive: true });
  const local = join(dir, "lesson-plan-week-1.pdf");
  writeFileSync(local, samplePdf(["Week 1 lesson plan", "Greetings, self-introduction, numbers 1-10", "Homework: N5 Hiragana flashcards"]));
  const size = statSync(local).size;
  const storagePath = `drive/${tanaka}/seed-lesson-plan`;
  await putFile(local, storagePath, "application/pdf");

  const folder: DriveItemDoc = { ownerUid: tanaka, kind: "folder", name: "Lesson plans", parentId: null, createdAt: now(), updatedAt: now() };
  await col.driveItems().doc("seed-drive-folder").set(folder);
  const file: DriveItemDoc = {
    ownerUid: tanaka,
    kind: "file",
    name: "lesson-plan-week-1.pdf",
    parentId: "seed-drive-folder",
    mimeType: "application/pdf",
    sizeBytes: size,
    storagePath,
    createdAt: now(),
    updatedAt: now(),
  };
  await col.driveItems().doc("seed-drive-file").set(file);

  // Storage used = My Drive files + class materials the teacher uploaded.
  for (const uid of ctx.teacherUids) {
    let used = 0;
    const drive = await col.driveItems().where("ownerUid", "==", uid).get();
    drive.docs.forEach((d) => (used += d.data().sizeBytes ?? 0));
    const materials = await col.materials().where("schoolId", "==", ctx.schoolId).get();
    materials.docs.forEach((m) => m.data().attachments.forEach((a) => a.uploadedBy === uid && (used += a.sizeBytes ?? 0)));
    await col.users().doc(uid).update({ storageUsedBytes: used });
  }
}
