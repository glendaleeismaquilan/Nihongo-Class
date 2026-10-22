import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MaterialDto, MaterialViewsDto } from "@nihongo/shared";
import { api, errorMessage } from "../../lib/api";
import { formatDate, formatDateTime } from "../../lib/format";
import { Alert, Badge, Button, Dialog, EmptyState, ErrorState, Icon, Loading, Panel, SectionTitle, TextField, useToast } from "../../components/ui";
import { useLessons } from "../classes/hooks";
import { useWorkspace } from "../classes/ClassWorkspace";
import { groupByLesson, materialKeys, useMaterials } from "./materialsApi";

function NewMaterialDialog({ onClose }: { onClose: () => void }) {
  const { cls, basePath } = useWorkspace();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: () => api<MaterialDto>(`/classes/${cls.id}/materials`, { body: { title } }),
    onSuccess: (m) => navigate(`${basePath}/materials/${m.id}`),
    onError: (err) => setError(errorMessage(err)),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Enter a title.");
    create.mutate();
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Post material"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-material" loading={create.isPending}>
            Continue
          </Button>
        </>
      }
    >
      <form id="new-material" onSubmit={submit} noValidate className="flex flex-col gap-3">
        <TextField label="Title" placeholder="Lesson 3 slides" value={title} onChange={(e) => setTitle(e.target.value)} error={error} required />
        <p className="text-sm text-ink-2">Next you'll add files and links. It stays a draft until you publish it.</p>
      </form>
    </Dialog>
  );
}

function ViewsDialog({ material, onClose }: { material: MaterialDto; onClose: () => void }) {
  const q = useQuery({ queryKey: ["material", material.id, "views"], queryFn: () => api<MaterialViewsDto>(`/materials/${material.id}/views`) });
  return (
    <Dialog open onClose={onClose} title={material.title}>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="flex flex-col gap-4">
          <p>
            Opened by {q.data.opened.length} of {q.data.total} students.
          </p>
          <div>
            <h3 className="mb-1 font-semibold">Not opened yet</h3>
            {q.data.notOpened.length ? (
              <ul className="list-disc pl-5">
                {q.data.notOpened.map((p) => (
                  <li key={p.uid}>{p.name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-2">Everyone has opened it.</p>
            )}
          </div>
          {q.data.opened.length ? (
            <div>
              <h3 className="mb-1 font-semibold">Opened</h3>
              <ul className="flex flex-col gap-1">
                {q.data.opened.map((p) => (
                  <li key={p.uid}>
                    {p.name} <span className="text-sm text-ink-2">last {formatDateTime(p.lastViewedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

/** FR-3.12.1, FR-3.12.6, FR-3.12.7: post, track, pin, unpublish, or delete materials. */
export function StaffMaterialsTab() {
  const { cls, basePath, readOnly } = useWorkspace();
  const q = useMaterials(cls.id);
  const lessons = useLessons(cls.id);
  const [creating, setCreating] = useState(false);
  const [views, setViews] = useState<MaterialDto | null>(null);
  const [deleting, setDeleting] = useState<MaterialDto | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => qc.invalidateQueries({ queryKey: materialKeys.list(cls.id) });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/materials/${id}`, { method: "PATCH", body }),
    onSuccess: (_r, v) => {
      toast(v.body.status === "published" ? "Published" : v.body.status === "draft" ? "Unpublished" : v.body.pinned ? "Pinned" : "Unpinned");
      void refresh();
    },
    onError: (err) => toast(errorMessage(err), "danger"),
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/materials/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleting(null);
      toast("Deleted");
      void refresh();
    },
    onError: (err) => toast(errorMessage(err), "danger"),
  });

  if (q.isPending || lessons.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const groups = groupByLesson(q.data, lessons.data ?? []);

  return (
    <>
      <div className="mb-4 flex justify-end">
        {!readOnly ? (
          <Button icon="plus" onClick={() => setCreating(true)}>
            Post material
          </Button>
        ) : null}
      </div>
      {q.data.length === 0 ? (
        <EmptyState action={!readOnly ? <Button onClick={() => setCreating(true)}>Post material</Button> : null}>No materials yet. Post slides, worksheets, or a kana chart for your class.</EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.key}>
              <SectionTitle>{g.title}</SectionTitle>
              <ul className="flex flex-col gap-2">
                {g.items.map((m) => (
                  <Panel as="li" key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {m.pinned ? <Icon name="pin" size={16} aria-label="Pinned" className="text-ai" /> : null}
                        <Link to={`${basePath}/materials/${m.id}`}>{m.title}</Link>
                        {m.status === "draft" ? <Badge>Draft</Badge> : <Badge tone="success">Published</Badge>}
                      </p>
                      <p className="text-sm text-ink-2">
                        {m.attachments.length} file{m.attachments.length === 1 ? "" : "s"} and links, {m.publishedAt ? `published ${formatDate(m.publishedAt)}` : `created ${formatDate(m.createdAt)}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {m.status === "published" ? (
                        <Button size="sm" variant="ghost" onClick={() => setViews(m)}>
                          Opened by {m.openedCount ?? 0} of {m.studentCount ?? 0}
                        </Button>
                      ) : null}
                      {!readOnly ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: m.id, body: { pinned: !m.pinned } })}>
                            {m.pinned ? "Unpin" : "Pin"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: m.id, body: { status: m.status === "published" ? "draft" : "published" } })}>
                            {m.status === "published" ? "Unpublish" : "Publish"}
                          </Button>
                          <Button size="sm" variant="ghost" className="text-shu" onClick={() => setDeleting(m)}>
                            Delete
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </Panel>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {creating ? <NewMaterialDialog onClose={() => setCreating(false)} /> : null}
      {views ? <ViewsDialog material={views} onClose={() => setViews(null)} /> : null}
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.title ?? "material"}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => deleting && del.mutate(deleting.id)} loading={del.isPending}>
              Delete
            </Button>
          </>
        }
      >
        <Alert>Its files are deleted from storage and students lose access. This can't be undone.</Alert>
      </Dialog>
    </>
  );
}
