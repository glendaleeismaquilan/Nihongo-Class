import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { col, materialViewId, type MaterialDoc } from "../src/db";
import { putFile } from "../src/lib/storage";
import { now } from "../src/lib/time";
import type { SeedContext } from "./seed";

/** A one-page PDF with plain text lines (valid xref offsets, Helvetica). */
export function samplePdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 20 : 12} Tf 72 ${740 - i * 26} Td (${esc(l)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

export async function seedMaterials(ctx: SeedContext, classes: { n5: { id: string; lessonIds: string[] } }) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "audio");
  mkdirSync(dir, { recursive: true });
  const local = join(dir, "greetings-handout.pdf");
  writeFileSync(
    local,
    samplePdf([
      "Lesson 1: Greetings (aisatsu)",
      "ohayou gozaimasu - good morning (polite)",
      "konnichiwa - hello, good afternoon",
      "konbanwa - good evening",
      "arigatou gozaimasu - thank you (polite)",
      "sumimasen - excuse me; I'm sorry",
      "oyasuminasai - good night",
      "",
      "Practice: greet three classmates before Saturday's class.",
    ]),
  );
  const materialId = "n5-greetings-handout";
  const attId = "seedhandout01";
  const storagePath = `classes/${classes.n5.id}/materials/${materialId}/${attId}-greetings-handout.pdf`;
  await putFile(local, storagePath, "application/pdf");
  const doc: MaterialDoc = {
    classId: classes.n5.id,
    schoolId: ctx.schoolId,
    lessonId: classes.n5.lessonIds[0],
    sessionId: "n5-live-1",
    title: "Lesson 1 handout: あいさつ",
    description: "Print this or keep it open during Saturday's live class.",
    attachments: [
      { id: attId, kind: "file", name: "greetings-handout.pdf", mimeType: "application/pdf", sizeBytes: statSync(local).size, storagePath, uploadedBy: ctx.teacherUids[0] },
      { id: "seedlink01", kind: "link", name: "NHK Easy Japanese: greetings", url: "https://www.nhk.or.jp/lesson/en/" },
    ],
    status: "published",
    pinned: true,
    publishedAt: now(),
    createdBy: ctx.teacherUids[0],
    createdAt: now(),
    updatedAt: now(),
  };
  await col.materials().doc(materialId).set(doc);
  // Ana has opened it; Juan and Carlo haven't.
  await col.materialViews().doc(materialViewId(materialId, ctx.studentUids[1])).set({ materialId, classId: classes.n5.id, uid: ctx.studentUids[1], firstViewedAt: now(), lastViewedAt: now(), viewCount: 1 });
}
