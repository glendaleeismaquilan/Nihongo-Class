// Mirror of apps/web/src/roles/content/libraryApi.ts.
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export const TYPE_LABEL = {
  flashcards: { plural: "Flashcards", singular: "flashcard" },
  quizzes: { plural: "Quizzes", singular: "quiz" },
  "reading-tests": { plural: "Reading tests", singular: "reading test" },
  "listening-tests": { plural: "Listening tests", singular: "listening test" },
};

/** Library-stack route of each type's editor. */
export const EDITOR_ROUTE = {
  flashcards: "LibraryFlashcardEditor",
  quizzes: "LibraryQuizEditor",
  "reading-tests": "LibraryReadingEditor",
  "listening-tests": "LibraryListeningEditor",
};

export function useLibraryItem(type, id) {
  return useQuery({
    queryKey: ["library", type, "item", id],
    queryFn: () => api(`/library/${type}/${id}`),
    enabled: !!id,
  });
}
