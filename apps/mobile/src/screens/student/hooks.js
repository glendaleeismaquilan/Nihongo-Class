// Student data hooks: the same endpoints and query keys as the web app's
// apps/web/src/features/classes/hooks.ts and features/materials/materialsApi.ts.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { JOIN_OPENS_MINUTES_BEFORE } from "../../shared/constants";

export const useMyClasses = () => useQuery({ queryKey: ["classes"], queryFn: () => api("/classes").then((r) => r.items) });

export const useClass = (id) => useQuery({ queryKey: ["class", id], queryFn: () => api(`/classes/${id}`) });

export const useLessons = (classId) =>
  useQuery({ queryKey: ["class", classId, "lessons"], queryFn: () => api(`/classes/${classId}/lessons`).then((r) => r.items) });

export const useMaterials = (classId) =>
  useQuery({ queryKey: ["class", classId, "materials"], queryFn: () => api(`/classes/${classId}/materials`).then((r) => r.items) });

export const useClassSessions = (classId) =>
  useQuery({ queryKey: ["class", classId, "sessions"], queryFn: () => api(`/classes/${classId}/sessions`).then((r) => r.items), retry: false });

/** The current time, refreshed every `intervalMs` (for join windows). Mirror of web lib/useNow. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** FR-3.11.7: join opens 15 minutes before the start and closes at the end (web JoinButton joinState). */
export function joinState(s, now) {
  if (s.status === "cancelled") return "cancelled";
  const start = new Date(s.startAt).getTime();
  const end = new Date(s.endAt).getTime();
  if (s.status === "completed" || now > end) return "over";
  return now >= start - JOIN_OPENS_MINUTES_BEFORE * 60_000 ? "open" : "early";
}

/** Groups materials by lesson in lesson order; materials without a lesson come last ("General"). */
export function groupByLesson(items, lessons) {
  const groups = lessons.map((l) => ({ key: l.id, title: l.title, items: items.filter((m) => m.lessonId === l.id) })).filter((g) => g.items.length);
  const rest = items.filter((m) => !m.lessonId || !lessons.some((l) => l.id === m.lessonId));
  if (rest.length) groups.push({ key: "none", title: "General", items: rest });
  return groups;
}
