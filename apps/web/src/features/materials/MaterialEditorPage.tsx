import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LIMITS, MATERIAL_FILE_TYPES, type MaterialAttachmentDto, type MaterialDto } from "@nihongo/shared";
import { api, ApiError, errorMessage, upload } from "../../lib/api";
import { formatBytes, formatDateTime } from "../../lib/format";
import { Alert, Badge, Button, ErrorState, Icon, Loading, Panel, ProgressBar, SectionTitle, SelectField, TextArea, TextField, useToast } from "../../components/ui";
import { FileDrop } from "../../components/FileDrop";
import { useLessons } from "../classes/hooks";
import { useWorkspace } from "../classes/ClassWorkspace";
import { AttachmentList } from "./AttachmentList";
import { materialKeys, useClassSessions, useMaterial } from "./materialsApi";

interface QueuedFile {
  key: string;
  file: File;
  progress: number;
  state: "queued" | "uploading" | "error";
  error?: string;
}

const ACCEPT = MATERIAL_FILE_TYPES.map((t) => `.${t.ext}`).join(",");

/** FR-3.12.1 / FR-3.12.8: edit a post; drag several files, one request each with its own progress bar. */
export function MaterialEditorPage() {
  const { cls, basePath, readOnly } = useWorkspace();
  const { materialId = "" } = useParams();
  const q = useMaterial(materialId);
  const lessons = useLessons(cls.id);
  const sessions = useClassSessions(cls.id);
  const qc = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState({ title: "", description: "", lessonId: "", sessionId: "" });
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [link, setLink] = useState({ name: "", url: "" });
  const [linkError, setLinkError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.data) setValues({ title: q.data.title, description: q.data.description ?? "", lessonId: q.data.lessonId ?? "", sessionId: q.data.sessionId ?? "" });
  }, [q.data]);

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const m = q.data;
  const setMaterial = (next: MaterialDto) => qc.setQueryData(materialKeys.one(materialId), next);
  const room = LIMITS.materialMaxAttachments - m.attachments.length - queue.filter((f) => f.state !== "error").length;

  async function uploadAll(files: File[]) {
    const accepted = files.slice(0, Math.max(0, room));
    const items: QueuedFile[] = accepted.map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, progress: 0, state: "queued" }));
    if (files.length > accepted.length) toast(`A material can have up to ${LIMITS.materialMaxAttachments} files and links.`, "danger");
    setQueue((q0) => [...q0, ...items]);
    for (const item of items) {
      setQueue((q0) => q0.map((x) => (x.key === item.key ? { ...x, state: "uploading" } : x)));
      const form = new FormData();
      form.set("file", item.file, item.file.name);
      try {
        const next = await upload<MaterialDto>(`/materials/${materialId}/attachments`, form, (p) => setQueue((q0) => q0.map((x) => (x.key === item.key ? { ...x, progress: p } : x))));
        setMaterial(next);
        setQueue((q0) => q0.filter((x) => x.key !== item.key));
      } catch (err) {
        setQueue((q0) => q0.map((x) => (x.key === item.key ? { ...x, state: "error", error: errorMessage(err) } : x)));
      }
    }
    void qc.invalidateQueries({ queryKey: materialKeys.list(cls.id) });
  }

  async function addLink(e: FormEvent) {
    e.preventDefault();
    setLinkError(null);
    if (!link.name.trim()) return setLinkError("Name the link, for example Lesson video.");
    if (!/^https:\/\//.test(link.url.trim())) return setLinkError("Links must start with https://");
    try {
      setMaterial(await api<MaterialDto>(`/materials/${materialId}/attachments`, { body: { kind: "link", name: link.name.trim(), url: link.url.trim() } }));
      setLink({ name: "", url: "" });
    } catch (err) {
      setLinkError(errorMessage(err));
    }
  }

  async function removeAttachment(a: MaterialAttachmentDto) {
    try {
      setMaterial(await api<MaterialDto>(`/materials/${materialId}/attachments/${a.id}`, { method: "DELETE" }));
    } catch (err) {
      toast(errorMessage(err), "danger");
    }
  }

  async function save(status?: "draft" | "published") {
    if (!values.title.trim()) return setFormError("Enter a title.");
    setSaving(true);
    setFormError(null);
    try {
      const next = await api<MaterialDto>(`/materials/${materialId}`, {
        method: "PATCH",
        body: { title: values.title, description: values.description, lessonId: values.lessonId || null, sessionId: values.sessionId || null, ...(status ? { status } : {}) },
      });
      setMaterial(next);
      void qc.invalidateQueries({ queryKey: materialKeys.list(cls.id) });
      toast(status === "published" && m.status !== "published" ? "Published" : status === "draft" && m.status === "published" ? "Unpublished" : "Saved");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <Link to={`${basePath}/materials`} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm no-underline">
        <Icon name="chevron-left" size={16} />
        Materials
      </Link>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xl">Edit material</h2>
        {m.status === "published" ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge>}
      </div>
      {formError ? (
        <div className="mb-4">
          <Alert tone="danger">{formError}</Alert>
        </div>
      ) : null}
      <Panel className="mb-4 flex flex-col gap-4 px-4 py-4">
        <TextField label="Title" value={values.title} onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} required disabled={readOnly} />
        <TextArea label="Description" rows={3} value={values.description} onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))} disabled={readOnly} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Lesson" value={values.lessonId} onChange={(e) => setValues((v) => ({ ...v, lessonId: e.target.value }))} disabled={readOnly}>
            <option value="">No lesson</option>
            {(lessons.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </SelectField>
          <SelectField label="Live class" hint="For example, slides for Tuesday's class." value={values.sessionId} onChange={(e) => setValues((v) => ({ ...v, sessionId: e.target.value }))} disabled={readOnly}>
            <option value="">None</option>
            {(sessions.data ?? [])
              .filter((s) => s.status !== "cancelled")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}, {formatDateTime(s.startAt)}
                </option>
              ))}
          </SelectField>
        </div>
      </Panel>

      <Panel className="mb-4 px-4 py-4">
        <SectionTitle>
          Files and links ({m.attachments.length} of {LIMITS.materialMaxAttachments})
        </SectionTitle>
        {m.attachments.length ? (
          <div className="mb-4">
            <AttachmentList materialId={m.id} attachments={m.attachments} removable={!readOnly} onRemove={removeAttachment} />
          </div>
        ) : null}
        {queue.length ? (
          <ul className="mb-4 flex flex-col gap-2" aria-live="polite">
            {queue.map((f) => (
              <li key={f.key} className="rounded-paper border border-line px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {f.file.name} <span className="text-sm text-ink-2">{formatBytes(f.file.size)}</span>
                  </span>
                  {f.state === "error" ? (
                    <Button size="sm" variant="ghost" onClick={() => setQueue((q0) => q0.filter((x) => x.key !== f.key))}>
                      Dismiss
                    </Button>
                  ) : (
                    <span className="text-sm text-ink-2">{f.state === "queued" ? "Waiting" : `${Math.round(f.progress * 100)}%`}</span>
                  )}
                </div>
                {f.state === "error" ? <p className="mt-1 text-sm text-shu">{f.error}</p> : <ProgressBar className="mt-2" value={f.progress} label={`Uploading ${f.file.name}`} />}
              </li>
            ))}
          </ul>
        ) : null}
        {!readOnly && room > 0 ? (
          <>
            <FileDrop
              multiple
              accept={ACCEPT}
              label="Choose files"
              hint="Or drag several files here. PDF, Word, PowerPoint, Excel, text, JPG, PNG, or WebP. No audio or video; share videos as links."
              onFiles={(files) => void uploadAll(files)}
            />
            <form onSubmit={addLink} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end" noValidate>
              <TextField label="Link name" value={link.name} onChange={(e) => setLink((l) => ({ ...l, name: e.target.value }))} />
              <TextField label="Link (https)" type="url" placeholder="https://" value={link.url} onChange={(e) => setLink((l) => ({ ...l, url: e.target.value }))} />
              <Button type="submit" variant="secondary" icon="link">
                Add link
              </Button>
            </form>
            {linkError ? <p className="mt-2 text-sm text-shu">{linkError}</p> : null}
          </>
        ) : null}
      </Panel>

      {!readOnly ? (
        <div className="sticky bottom-16 flex flex-wrap gap-2 border-t border-line bg-kasumi py-3 md:bottom-0">
          {m.status === "draft" ? (
            <>
              <Button variant="secondary" onClick={() => void save()} loading={saving}>
                Save draft
              </Button>
              <Button onClick={() => void save("published")} disabled={saving || queue.some((f) => f.state === "uploading")}>
                Publish
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => void save()} loading={saving}>
                Save
              </Button>
              <Button variant="secondary" onClick={() => void save("draft")} disabled={saving}>
                Unpublish
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
