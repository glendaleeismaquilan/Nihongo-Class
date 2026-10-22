import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MaterialDto } from "@nihongo/shared";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { Badge, EmptyState, ErrorState, Icon, Loading, Panel, SectionTitle } from "../../components/ui";
import { useLessons } from "../../features/classes/hooks";
import { AttachmentList } from "../../features/materials/AttachmentList";
import { groupByLesson, materialKeys, useMaterials } from "../../features/materials/materialsApi";
import { useStudentClass } from "./ClassPage";

/** FR-3.12.4: published materials by lesson, pinned first then newest, "New" until opened. */
export function ClassMaterialsTab() {
  const { cls } = useStudentClass();
  const q = useMaterials(cls.id);
  const lessons = useLessons(cls.id);
  const qc = useQueryClient();
  const recorded = useRef(new Set<string>());

  function opened(m: MaterialDto) {
    if (m.viewed || recorded.current.has(m.id)) return;
    recorded.current.add(m.id);
    void api(`/materials/${m.id}/view`, { method: "POST" }).then(() => {
      qc.setQueryData<MaterialDto[]>(materialKeys.list(cls.id), (items) => items?.map((x) => (x.id === m.id ? { ...x, viewed: true } : x)));
    });
  }

  if (q.isPending || lessons.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data.length) return <EmptyState>No materials yet. Your teacher's slides, worksheets, and charts will appear here.</EmptyState>;
  return (
    <div className="flex flex-col gap-6">
      {groupByLesson(q.data, lessons.data ?? []).map((g) => (
        <section key={g.key}>
          <SectionTitle>{g.title}</SectionTitle>
          <ul className="flex flex-col gap-3">
            {g.items.map((m) => (
              <Panel as="li" key={m.id} className="px-4 py-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {m.pinned ? <Icon name="pin" size={16} aria-label="Pinned" className="text-ai" /> : null}
                  <h3 className="font-semibold">{m.title}</h3>
                  {!m.viewed ? <Badge tone="info">New</Badge> : null}
                  <span className="text-sm text-ink-2">{m.publishedAt ? formatDate(m.publishedAt) : ""}</span>
                </div>
                {m.description ? <p className="mb-3 max-w-[70ch] whitespace-pre-line text-ink-2">{m.description}</p> : null}
                {m.attachments.length ? <AttachmentList materialId={m.id} attachments={m.attachments} onOpen={() => opened(m)} /> : null}
              </Panel>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
