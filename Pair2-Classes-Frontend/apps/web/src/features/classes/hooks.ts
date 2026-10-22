import { useQuery } from "@tanstack/react-query";
import type { ClassDto, FlashcardDto, LessonDto, QuizDto, RosterEntryDto, UserDto } from "@nihongo/shared";
import { api } from "../../lib/api";

export const classKeys = {
  all: ["classes"] as const,
  one: (id: string) => ["class", id] as const,
  lessons: (id: string) => ["class", id, "lessons"] as const,
  flashcards: (id: string, lessonId?: string) => ["class", id, "flashcards", lessonId ?? "all"] as const,
  quizzes: (id: string, lessonId?: string) => ["class", id, "quizzes", lessonId ?? "all"] as const,
  roster: (id: string) => ["class", id, "roster"] as const,
};

export const useClasses = () => useQuery({ queryKey: classKeys.all, queryFn: () => api<{ items: ClassDto[] }>("/classes").then((r) => r.items) });

export const useClass = (id: string) => useQuery({ queryKey: classKeys.one(id), queryFn: () => api<ClassDto>(`/classes/${id}`) });

export const useLessons = (classId: string, enabled = true) =>
  useQuery({ queryKey: classKeys.lessons(classId), queryFn: () => api<{ items: LessonDto[] }>(`/classes/${classId}/lessons`).then((r) => r.items), enabled });

export const useFlashcards = (classId: string, lessonId?: string) =>
  useQuery({
    queryKey: classKeys.flashcards(classId, lessonId),
    queryFn: () => api<{ items: FlashcardDto[] }>(`/classes/${classId}/flashcards`, { query: { lessonId } }).then((r) => r.items),
    enabled: !!lessonId,
  });

export const useQuizzes = (classId: string, lessonId?: string) =>
  useQuery({
    queryKey: classKeys.quizzes(classId, lessonId),
    queryFn: () => api<{ items: QuizDto[] }>(`/classes/${classId}/quizzes`, { query: { lessonId } }).then((r) => r.items),
    enabled: !!lessonId,
  });

export const useRoster = (classId: string) =>
  useQuery({ queryKey: classKeys.roster(classId), queryFn: () => api<{ items: RosterEntryDto[] }>(`/classes/${classId}/roster`).then((r) => r.items) });

export const useSchoolTeachers = (schoolId: string | null, enabled = true) =>
  useQuery({
    queryKey: ["school-users", schoolId, "teacher"],
    queryFn: () => api<{ items: UserDto[] }>(`/schools/${schoolId}/users`, { query: { role: "teacher" } }).then((r) => r.items),
    enabled: enabled && !!schoolId,
  });
