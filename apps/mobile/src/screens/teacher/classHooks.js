// Queries for the class workspace shared by teachers and School Admins — the
// mobile copy of apps/web/src/features/classes/hooks.ts and
// features/materials/materialsApi.ts (same endpoints, same query keys, so an
// invalidation reaches every screen that shows the data).
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export const classKeys = {
  all: ["classes"],
  one: (id) => ["class", id],
  lessons: (id) => ["class", id, "lessons"],
  flashcards: (id, lessonId) => ["class", id, "flashcards", lessonId ?? "all"],
  quizzes: (id, lessonId) => ["class", id, "quizzes", lessonId ?? "all"],
  roster: (id) => ["class", id, "roster"],
  sessions: (id) => ["class", id, "sessions"],
  reports: (id) => ["class", id, "reports"],
  call: (id) => ["class", id, "call"],
};

export const materialKeys = {
  list: (classId) => ["class", classId, "materials"],
  one: (id) => ["material", id],
  views: (id) => ["material", id, "views"],
};

export const useClasses = () => useQuery({ queryKey: classKeys.all, queryFn: () => api("/classes").then((r) => r.items) });

export const useClass = (id) => useQuery({ queryKey: classKeys.one(id), queryFn: () => api(`/classes/${id}`), enabled: !!id });

export const useLessons = (classId, enabled = true) =>
  useQuery({ queryKey: classKeys.lessons(classId), queryFn: () => api(`/classes/${classId}/lessons`).then((r) => r.items), enabled: enabled && !!classId });

export const useFlashcards = (classId, lessonId) =>
  useQuery({
    queryKey: classKeys.flashcards(classId, lessonId),
    queryFn: () => api(`/classes/${classId}/flashcards`, { query: { lessonId } }).then((r) => r.items),
    enabled: !!lessonId,
  });

export const useQuizzes = (classId, lessonId) =>
  useQuery({
    queryKey: classKeys.quizzes(classId, lessonId),
    queryFn: () => api(`/classes/${classId}/quizzes`, { query: { lessonId } }).then((r) => r.items),
    enabled: !!lessonId,
  });

export const useRoster = (classId) =>
  useQuery({ queryKey: classKeys.roster(classId), queryFn: () => api(`/classes/${classId}/roster`).then((r) => r.items) });

export const useSchoolTeachers = (schoolId, enabled = true) =>
  useQuery({
    queryKey: ["school-users", schoolId, "teacher"],
    queryFn: () => api(`/schools/${schoolId}/users`, { query: { role: "teacher" } }).then((r) => r.items),
    enabled: enabled && !!schoolId,
  });

export const useClassSessions = (classId) =>
  useQuery({
    queryKey: classKeys.sessions(classId),
    queryFn: () => api(`/classes/${classId}/sessions`).then((r) => r.items),
    retry: false,
  });

export const useMaterials = (classId) =>
  useQuery({ queryKey: materialKeys.list(classId), queryFn: () => api(`/classes/${classId}/materials`).then((r) => r.items) });

export const useMaterial = (id) => useQuery({ queryKey: materialKeys.one(id), queryFn: () => api(`/materials/${id}`), enabled: !!id });

/** Groups materials by lesson in lesson order; materials without a lesson come last (web groupByLesson). */
export function groupByLesson(items, lessons) {
  const groups = lessons.map((l) => ({ key: l.id, title: l.title, items: items.filter((m) => m.lessonId === l.id) })).filter((g) => g.items.length);
  const rest = items.filter((m) => !m.lessonId || !lessons.some((l) => l.id === m.lessonId));
  if (rest.length) groups.push({ key: "none", title: "General", items: rest });
  return groups;
}

export const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** Every class screen reads the workspace's read-only rule from the class itself (web: ClassWorkspace). */
export const isReadOnly = (cls) => cls?.status === "archived";
