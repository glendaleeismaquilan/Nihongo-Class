import { useQuery } from "@tanstack/react-query";
import type { FlashcardDto, LibraryType, ListeningTestDto, QuizDto, ReadingTestDto } from "@nihongo/shared";
import { api } from "../../lib/api";

export type LibraryItem<T extends LibraryType> = T extends "flashcards"
  ? FlashcardDto
  : T extends "quizzes"
    ? QuizDto
    : T extends "reading-tests"
      ? ReadingTestDto
      : ListeningTestDto;

export const TYPE_LABEL: Record<LibraryType, { plural: string; singular: string }> = {
  flashcards: { plural: "Flashcards", singular: "flashcard" },
  quizzes: { plural: "Quizzes", singular: "quiz" },
  "reading-tests": { plural: "Reading tests", singular: "reading test" },
  "listening-tests": { plural: "Listening tests", singular: "listening test" },
};

export function useLibraryItem<T extends LibraryType>(type: T, id: string | undefined) {
  return useQuery({
    queryKey: ["library", type, "item", id],
    queryFn: () => api<LibraryItem<T>>(`/library/${type}/${id}`),
    enabled: !!id,
  });
}
