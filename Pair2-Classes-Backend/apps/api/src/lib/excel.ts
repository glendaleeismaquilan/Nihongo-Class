import * as XLSX from "xlsx";
import {
  AUDIO_FILE_HEADER,
  FLASHCARD_HEADERS,
  LIMITS,
  QUIZ_HEADERS,
  normalizeHeader,
  parseCorrectOption,
  type ImportRowError,
} from "@nihongo/shared";
import { badRequest } from "./errors";

export interface SheetRow {
  rowNumber: number;
  cells: Record<string, string>;
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/**
 * §7.4 Excel rules: read the first sheet, match headers case-insensitively
 * after trimming, skip fully empty rows, trim cell values, keep Japanese text
 * intact, accept up to 500 rows.
 */
export function readSheet(buffer: Buffer, required: readonly string[], optional: readonly string[] = []): SheetRow[] {
  if (buffer.length > LIMITS.importMaxBytes) throw badRequest("This file is larger than 5 MB. Split it into smaller files.", undefined, "file_too_large");
  if (!ZIP_MAGIC.every((b, i) => buffer[i] === b)) {
    throw badRequest("This isn't an .xlsx file. Save the sheet as Excel Workbook (.xlsx) and upload it again.", undefined, "invalid_file_type");
  }
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer", dense: true, cellFormula: false, cellHTML: false });
  } catch {
    throw badRequest("This .xlsx file couldn't be read. Open it in Excel, save it again, and re-upload.", undefined, "invalid_file_type");
  }
  const first = wb.SheetNames[0];
  if (!first) throw badRequest("This file has no sheets.", undefined, "empty_file");
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[first], { header: 1, raw: false, defval: "", blankrows: true });
  const headerRow = (grid[0] ?? []).map(normalizeHeader);
  const index = new Map<string, number>();
  for (const name of [...required, ...optional]) {
    const i = headerRow.indexOf(normalizeHeader(name));
    if (i !== -1) index.set(name, i);
  }
  const missing = required.filter((h) => !index.has(h));
  if (missing.length) {
    throw badRequest(`The first row must contain these column headers: ${missing.join(", ")}. Download the template to see the format.`, { missing }, "missing_headers");
  }
  const rows: SheetRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const raw = grid[r] ?? [];
    const cells: Record<string, string> = {};
    let any = false;
    for (const [name, i] of index) {
      const v = String(raw[i] ?? "").trim();
      cells[name] = v;
      if (v) any = true;
    }
    if (!any) continue;
    rows.push({ rowNumber: r + 1, cells });
  }
  if (rows.length === 0) throw badRequest("This file has no rows under the header row.", undefined, "empty_file");
  if (rows.length > LIMITS.importMaxRows) {
    throw badRequest(`This file has ${rows.length} rows. The limit is ${LIMITS.importMaxRows} per file; split it into smaller files.`, undefined, "too_many_rows");
  }
  return rows;
}

function tooLong(value: string, max: number) {
  return value.length > max;
}

export interface FlashcardRow {
  rowNumber: number;
  term: string;
  reading: string;
  meaning: string;
  exampleSentence: string | null;
  audioFileName: string | null;
}

export function parseFlashcardRows(rows: SheetRow[], withAudio: boolean) {
  const valid: FlashcardRow[] = [];
  const errors: ImportRowError[] = [];
  for (const { rowNumber, cells } of rows) {
    const reasons: string[] = [];
    const term = cells["Term"];
    const reading = cells["Reading"];
    const meaning = cells["Meaning"];
    const example = cells["Example Sentence"] ?? "";
    if (!term) reasons.push("Term is required.");
    if (!reading) reasons.push("Reading is required.");
    if (!meaning) reasons.push("Meaning is required.");
    if (tooLong(term, 200) || tooLong(reading, 200)) reasons.push("Term and Reading must be 200 characters or fewer.");
    if (tooLong(meaning, 500) || tooLong(example, 500)) reasons.push("Meaning and Example Sentence must be 500 characters or fewer.");
    const audio = withAudio ? (cells[AUDIO_FILE_HEADER] ?? "") : "";
    if (reasons.length) {
      errors.push({ row: rowNumber, reason: `Row ${rowNumber}: ${reasons.join(" ")}` });
      continue;
    }
    valid.push({ rowNumber, term, reading, meaning, exampleSentence: example || null, audioFileName: audio || null });
  }
  return { valid, errors };
}

export interface QuizRow {
  rowNumber: number;
  text: string;
  choices: [string, string, string, string];
  correctIndex: number;
  audioFileName: string | null;
}

export function parseQuizRows(rows: SheetRow[], withAudio: boolean) {
  const valid: QuizRow[] = [];
  const errors: ImportRowError[] = [];
  for (const { rowNumber, cells } of rows) {
    const reasons: string[] = [];
    const text = cells["Question"];
    const choices = [cells["Option A"], cells["Option B"], cells["Option C"], cells["Option D"]] as [string, string, string, string];
    if (!text) reasons.push("Question is required.");
    ["A", "B", "C", "D"].forEach((letter, i) => {
      if (!choices[i]) reasons.push(`Option ${letter} is required.`);
    });
    if (tooLong(text, 1000) || choices.some((c) => tooLong(c, 300))) reasons.push("Questions must be 1,000 characters or fewer and options 300 or fewer.");
    // FR-3.4.4: exactly one of A, B, C, D (trimmed, case-insensitive).
    const rawCorrect = cells["Correct Option"];
    const correctIndex = parseCorrectOption(rawCorrect);
    if (correctIndex === null) {
      reasons.push(rawCorrect ? `Correct Option must be A, B, C, or D. This row has "${rawCorrect}".` : "Correct Option must be A, B, C, or D. This row has none.");
    }
    if (reasons.length) {
      errors.push({ row: rowNumber, reason: `Row ${rowNumber}: ${reasons.join(" ")}` });
      continue;
    }
    const audio = withAudio ? (cells[AUDIO_FILE_HEADER] ?? "") : "";
    valid.push({ rowNumber, text, choices, correctIndex: correctIndex!, audioFileName: audio || null });
  }
  return { valid, errors };
}

function sheetFrom(rows: unknown[][], widths: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  return ws;
}

function toBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
}

/** FR-3.3.4: downloadable error report. */
export function errorReport(errors: ImportRowError[], rows: SheetRow[]): string {
  const byRow = new Map(rows.map((r) => [r.rowNumber, r.cells]));
  const headers = rows[0] ? Object.keys(rows[0].cells) : [];
  const data: unknown[][] = [["Row", "Reason", ...headers]];
  for (const e of errors) {
    const cells = byRow.get(e.row) ?? {};
    data.push([e.row, e.reason.replace(/^Row \d+: /, ""), ...headers.map((h) => cells[h] ?? "")]);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(data, [6, 60, ...headers.map(() => 20)]), "Errors");
  return toBuffer(wb).toString("base64");
}

export type TemplateKind = "flashcards" | "quiz";

/**
 * FR-3.3.2, FR-3.4.2, FR-3.5.3: header row, the SRS example row, and an
 * Instructions sheet. The Content Admin variant adds Audio File Name.
 */
export function buildTemplate(kind: TemplateKind, variant: "teacher" | "builtin"): Buffer {
  const withAudio = variant === "builtin";
  const wb = XLSX.utils.book_new();
  let data: unknown[][];
  let widths: number[];
  let instructions: string[];
  if (kind === "flashcards") {
    data = [[...FLASHCARD_HEADERS, ...(withAudio ? [AUDIO_FILE_HEADER] : [])], ["食べる", "たべる", "to eat", "ご飯を食べる", ...(withAudio ? ["taberu.mp3"] : [])]];
    widths = [18, 18, 28, 32, 22];
    instructions = [
      "Nihongo Class flashcard template",
      "",
      "Fill one flashcard per row on the first sheet, under the header row. Keep the header row as it is.",
      "Term (required): the word or phrase, for example 食べる.",
      "Reading (required): the reading in kana, for example たべる.",
      "Meaning (required): the English meaning, for example to eat.",
      "Example Sentence (optional): a short sentence that uses the term.",
      ...(withAudio
        ? [
            "Audio File Name (optional): the pronunciation clip's file name, for example taberu.mp3. After the import, drop the audio files on the review screen and they are matched to rows by file name.",
            "The JLPT level is chosen in the upload form and applies to every row.",
          ]
        : ["You choose the lesson in the upload form. Teacher flashcards have no audio."]),
      "",
      `Up to ${LIMITS.importMaxRows} rows and 5 MB per file. Rows with errors are skipped and listed after the upload; the other rows are imported.`,
      "Delete the example row before uploading, or it will be imported too.",
    ];
  } else {
    data = [
      [...QUIZ_HEADERS, ...(withAudio ? [AUDIO_FILE_HEADER] : [])],
      ["「食べる」の意味は？", "to eat", "to drink", "to sleep", "to walk", "A", ...(withAudio ? ["taberu-quiz.mp3"] : [])],
    ];
    widths = [32, 16, 16, 16, 16, 16, 22];
    instructions = [
      "Nihongo Class quiz template",
      "",
      "Fill one question per row on the first sheet, under the header row. Keep the header row as it is.",
      "Question (required): the question text.",
      "Option A to Option D (all required): the four choices.",
      "Correct Option (required): exactly one letter, A, B, C, or D.",
      ...(withAudio
        ? [
            "Audio File Name (optional): audio for the correct answer, for example taberu-quiz.mp3. Students hear it only on the results screen, after they submit.",
            "The JLPT level and the quiz title are chosen in the upload form.",
          ]
        : ["You type the quiz title and choose the lesson in the upload form. Teacher quizzes have no audio."]),
      "",
      "One file creates one quiz.",
      `Up to ${LIMITS.importMaxRows} rows and 5 MB per file. Rows with errors are skipped and listed after the upload; the other rows are imported.`,
      "Delete the example row before uploading, or it will be imported too.",
    ];
  }
  XLSX.utils.book_append_sheet(wb, sheetFrom(data, widths), kind === "flashcards" ? "Flashcards" : "Quiz");
  XLSX.utils.book_append_sheet(wb, sheetFrom(instructions.map((l) => [l]), [110]), "Instructions");
  return toBuffer(wb);
}

export function buildWorkbook(sheetName: string, rows: unknown[][], widths: number[]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(rows, widths), sheetName);
  return toBuffer(wb);
}

export function toCsv(rows: unknown[][]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens UTF-8 (Japanese names) correctly.
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export const flashcardColumns = { required: ["Term", "Reading", "Meaning"], optional: ["Example Sentence"] } as const;
export const quizColumns = { required: [...QUIZ_HEADERS], optional: [] as string[] } as const;
