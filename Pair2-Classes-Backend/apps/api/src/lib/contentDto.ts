import type { FlashcardDto, LessonDto, ListeningTestDto, QuestionDto, QuizDto, ReadingTestDto } from "@nihongo/shared";
import type { FlashcardDoc, LessonDoc, ListeningTestDoc, QuestionDoc, QuizDoc, ReadingTestDoc } from "../db";
import { iso } from "./time";

/** Staff and Content Admin view (includes correct answers). */
export function flashcardDto(id: string, d: FlashcardDoc): FlashcardDto {
  const dto: FlashcardDto = {
    id,
    term: d.term,
    reading: d.reading,
    meaning: d.meaning,
    exampleSentence: d.exampleSentence ?? null,
    source: d.source,
    level: d.level ?? null,
    classId: d.classId ?? null,
    lessonId: d.lessonId ?? null,
    status: d.status,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
  // FR-3.3.5: teacher flashcards carry no audio fields at all.
  if (d.source === "builtin") {
    dto.audioUrl = d.audioUrl ?? null;
    dto.audioMimeType = d.audioMimeType ?? null;
    dto.audioFileName = d.audioFileName ?? null;
    dto.expectedAudioName = d.expectedAudioName ?? null;
    dto.importBatchId = d.importBatchId ?? null;
  }
  return dto;
}

export function questionDto(q: QuestionDoc, builtin: boolean): QuestionDto {
  const dto: QuestionDto = { text: q.text, choices: q.choices, correctIndex: q.correctIndex };
  if (builtin) {
    dto.audioUrl = q.audioUrl ?? null;
    dto.audioFileName = q.audioFileName ?? null;
    dto.expectedAudioName = q.expectedAudioName ?? null;
  }
  return dto;
}

export function quizDto(id: string, d: QuizDoc): QuizDto {
  return {
    id,
    ...(d.source === "builtin" ? { importBatchId: d.importBatchId ?? null } : {}),
    title: d.title,
    questions: d.questions.map((q) => questionDto(q, d.source === "builtin")),
    source: d.source,
    level: d.level ?? null,
    classId: d.classId ?? null,
    lessonId: d.lessonId ?? null,
    status: d.status,
    passingScorePct: d.passingScorePct,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

export function readingTestDto(id: string, d: ReadingTestDoc): ReadingTestDto {
  return {
    id,
    title: d.title,
    level: d.level,
    passage: d.passage,
    questions: d.questions.map((q) => questionDto(q, false)),
    status: d.status,
    passingScorePct: d.passingScorePct,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

export function listeningTestDto(id: string, d: ListeningTestDoc): ListeningTestDto {
  return {
    id,
    title: d.title,
    level: d.level,
    audioUrl: d.audioUrl ?? null,
    audioFileName: d.audioFileName ?? null,
    questions: d.questions.map((q) => questionDto(q, false)),
    status: d.status,
    passingScorePct: d.passingScorePct,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

export function lessonDto(id: string, d: LessonDoc): LessonDto {
  return { id, classId: d.classId, title: d.title, order: d.order, description: d.description ?? null };
}
