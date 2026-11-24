import { useQuery } from "@tanstack/react-query";
import type { LessonDto, LiveSessionDto, MaterialAttachmentDto, MaterialDto } from "@nihongo/shared";
import { api, openableUrl } from "../../lib/api";

export const materialKeys = {
  list: (classId: string) => ["class", classId, "materials"] as const,
  one: (id: string) => ["material", id] as const,
};

export const useMaterials = (classId: string) =>
  useQuery({ queryKey: materialKeys.list(classId), queryFn: () => api<{ items: MaterialDto[] }>(`/classes/${classId}/materials`).then((r) => r.items) });

export const useMaterial = (id: string) => useQuery({ queryKey: materialKeys.one(id), queryFn: () => api<MaterialDto>(`/materials/${id}`) });

export const useClassSessions = (classId: string) =>
  useQuery({
    queryKey: ["class", classId, "sessions"],
    queryFn: () => api<{ items: LiveSessionDto[] }>(`/classes/${classId}/sessions`).then((r) => r.items),
    retry: false,
  });

/** Groups materials by lesson in lesson order; materials without a lesson come last. */
export function groupByLesson(items: MaterialDto[], lessons: LessonDto[]) {
  const groups = lessons.map((l) => ({ key: l.id, title: l.title, items: items.filter((m) => m.lessonId === l.id) })).filter((g) => g.items.length);
  const rest = items.filter((m) => !m.lessonId || !lessons.some((l) => l.id === m.lessonId));
  if (rest.length) groups.push({ key: "none", title: "General", items: rest });
  return groups;
}

export async function fileTicket(materialId: string, att: MaterialAttachmentDto, disposition: "inline" | "attachment") {
  return api<{ url: string; disposition: "inline" | "attachment" }>(`/materials/${materialId}/attachments/${att.id}/ticket`, { body: { disposition } });
}

export const canPreview = (att: MaterialAttachmentDto) => att.kind === "file" && /^(application\/pdf|image\/(jpeg|png|webp))$/.test(att.mimeType ?? "");

export async function downloadUrl(url: string) {
  const file = await openableUrl(url);
  const a = document.createElement("a");
  a.href = file.url;
  if (file.filename) a.download = file.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
