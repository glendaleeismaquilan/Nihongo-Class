import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MATERIAL_FILE_TYPES, type DriveItemDto, type DriveListingDto } from "@nihongo/shared";
import { api, ApiError, errorMessage, upload } from "../../lib/api";
import { formatBytes, formatDate } from "../../lib/format";
import { Alert, Button, ButtonLink, DataTable, Dialog, EmptyState, ErrorState, Icon, IconButton, Loading, PageHeader, Panel, ProgressBar, SelectField, TextField, useToast } from "../../components/ui";
import { FileDrop } from "../../components/FileDrop";
import { downloadUrl } from "../../features/materials/materialsApi";

const ACCEPT = MATERIAL_FILE_TYPES.map((t) => `.${t.ext}`).join(",");
const canPreview = (i: DriveItemDto) => /^(application\/pdf|image\/(jpeg|png|webp))$/.test(i.mimeType ?? "");

interface Uploading {
  id: number;
  name: string;
  progress: number;
  error?: string;
}

/**
 * My Drive: a teacher's private files, in folders. 500 MB free, 1 GB with
 * Premium; class materials they upload count toward the same space.
 */
export function DrivePage() {
  const [params, setParams] = useSearchParams();
  const folderId = params.get("folder") ?? "";
  const qc = useQueryClient();
  const toast = useToast();
  const [uploads, setUploads] = useState<Uploading[]>([]);
  const [newFolder, setNewFolder] = useState(false);
  const [renaming, setRenaming] = useState<DriveItemDto | null>(null);
  const [moving, setMoving] = useState<DriveItemDto | null>(null);
  const [deleting, setDeleting] = useState<DriveItemDto | null>(null);

  const q = useQuery({ queryKey: ["drive", folderId], queryFn: () => api<DriveListingDto>("/drive", { query: { folderId } }) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["drive"] });
    void qc.invalidateQueries({ queryKey: ["me"] });
  };
  const open = (id: string | null) => setParams(id ? { folder: id } : {});

  const remove = useMutation({
    mutationFn: (id: string) => api(`/drive/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleting(null);
      toast("Deleted");
      refresh();
    },
    onError: (err) => toast(errorMessage(err), "danger"),
  });

  async function openFile(item: DriveItemDto, disposition: "inline" | "attachment") {
    try {
      const t = await api<{ url: string; disposition: string }>(`/drive/${item.id}/ticket`, { body: { disposition } });
      if (t.disposition === "inline") window.open(t.url, "_blank", "noopener");
      else downloadUrl(t.url);
    } catch (err) {
      toast(errorMessage(err), "danger");
    }
  }

  async function uploadFiles(files: File[]) {
    for (const file of files) {
      const id = Math.random();
      setUploads((u) => [...u, { id, name: file.name, progress: 0 }]);
      const update = (patch: Partial<Uploading>) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      const form = new FormData();
      if (folderId) form.set("parentId", folderId);
      form.set("file", file);
      try {
        await upload("/drive/files", form, (p) => update({ progress: p }));
        setUploads((u) => u.filter((x) => x.id !== id));
        refresh();
      } catch (err) {
        update({ error: errorMessage(err) });
      }
    }
  }

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { usage, items, path } = q.data;
  const full = usage.usedBytes >= usage.limitBytes;

  return (
    <>
      <PageHeader
        title="My Drive"
        description="Your private files for lesson planning. Only you can see them."
        actions={
          <Button icon="folder" variant="secondary" onClick={() => setNewFolder(true)}>
            New folder
          </Button>
        }
      />
      <Panel className="mb-4 px-4 py-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p>
            <span className="font-semibold">{formatBytes(usage.usedBytes)}</span> of {formatBytes(usage.limitBytes)} used
          </p>
          {usage.premium ? (
            <span className="inline-flex items-center gap-1 text-sm text-ink-2">
              <Icon name="star" size={16} className="text-ai" /> Premium
            </span>
          ) : (
            <Link to="/t/premium" className="text-sm">
              Get 1 GB with Premium
            </Link>
          )}
        </div>
        <ProgressBar value={usage.limitBytes ? usage.usedBytes / usage.limitBytes : 0} label="Storage used" />
        <p className="mt-2 text-sm text-ink-2">Files here and class materials you upload share this space.</p>
      </Panel>
      {full ? (
        <div className="mb-4">
          <Alert tone="danger" title="Your storage is full">
            <p>Delete files to make room{usage.premium ? "." : ", or go Premium for 1 GB."}</p>
            {!usage.premium ? (
              <ButtonLink size="sm" className="mt-2" to="/t/premium">
                See Premium
              </ButtonLink>
            ) : null}
          </Alert>
        </div>
      ) : null}

      <nav aria-label="Folder path" className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button type="button" className="min-h-11 rounded-control px-2 font-medium hover:bg-kasumi" onClick={() => open(null)}>
          My Drive
        </button>
        {path.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1">
            <Icon name="chevron-right" size={14} className="text-ink-2" />
            {i === path.length - 1 ? (
              <span className="px-2 font-medium" aria-current="page">
                {p.name}
              </span>
            ) : (
              <button type="button" className="min-h-11 rounded-control px-2 hover:bg-kasumi" onClick={() => open(p.id)}>
                {p.name}
              </button>
            )}
          </span>
        ))}
      </nav>

      <div className="mb-4">
        <FileDrop multiple accept={ACCEPT} label="Upload files" hint="PDF, Word, PowerPoint, Excel, text, JPG, PNG, or WebP." onFiles={(f) => void uploadFiles(f)} disabled={full} />
      </div>
      {uploads.length ? (
        <ul className="mb-4 flex flex-col gap-2" aria-live="polite">
          {uploads.map((u) => (
            <li key={u.id} className="rounded-paper border border-line px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{u.name}</span>
                {u.error ? (
                  <IconButton icon="x" label={`Dismiss ${u.name}`} onClick={() => setUploads((all) => all.filter((x) => x.id !== u.id))} />
                ) : (
                  <span className="text-sm text-ink-2">{Math.round(u.progress * 100)}%</span>
                )}
              </div>
              {u.error ? <p className="mt-1 text-sm text-shu">{u.error}</p> : <ProgressBar value={u.progress} label={`Uploading ${u.name}`} className="mt-2" />}
            </li>
          ))}
        </ul>
      ) : null}

      {items.length === 0 ? (
        <EmptyState>{folderId ? "This folder is empty." : "No files yet. Drop files above, or make a folder for each class."}</EmptyState>
      ) : (
        <DataTable label="Files and folders">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Size</th>
              <th scope="col">Modified</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.kind === "folder" ? (
                    <button type="button" className="inline-flex min-h-11 items-center gap-2 font-medium text-ai hover:underline" onClick={() => open(i.id)}>
                      <Icon name="folder" /> {i.name}
                    </button>
                  ) : (
                    <button type="button" className="inline-flex min-h-11 items-center gap-2 text-left hover:underline" onClick={() => void openFile(i, canPreview(i) ? "inline" : "attachment")}>
                      <Icon name="file" className="shrink-0 text-ink-2" /> <span className="break-all">{i.name}</span>
                    </button>
                  )}
                </td>
                <td className="whitespace-nowrap text-ink-2">{i.kind === "file" ? formatBytes(i.sizeBytes) : ""}</td>
                <td className="whitespace-nowrap text-ink-2">{formatDate(i.updatedAt)}</td>
                <td className="whitespace-nowrap text-right">
                  {i.kind === "file" ? <IconButton icon="download" label={`Download ${i.name}`} onClick={() => void openFile(i, "attachment")} /> : null}
                  <IconButton icon="edit" label={`Rename ${i.name}`} onClick={() => setRenaming(i)} />
                  <IconButton icon="folder" label={`Move ${i.name}`} onClick={() => setMoving(i)} />
                  <IconButton icon="trash" label={`Delete ${i.name}`} className="text-shu" onClick={() => setDeleting(i)} />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      {newFolder ? <NameDialog title="New folder" label="Folder name" onClose={() => setNewFolder(false)} onSave={(name) => api("/drive/folders", { body: { name, parentId: folderId || undefined } }).then(refresh)} /> : null}
      {renaming ? (
        <NameDialog
          title={`Rename ${renaming.kind}`}
          label="Name"
          initial={renaming.name}
          onClose={() => setRenaming(null)}
          onSave={(name) => api(`/drive/${renaming.id}`, { method: "PATCH", body: { name } }).then(refresh)}
        />
      ) : null}
      {moving ? <MoveDialog item={moving} onClose={() => setMoving(null)} onMoved={refresh} /> : null}
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? ""}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>
              Delete
            </Button>
          </>
        }
      >
        <p>{deleting?.kind === "folder" ? "Everything inside this folder is deleted too. This can't be undone." : "This can't be undone."}</p>
      </Dialog>
    </>
  );
}

function NameDialog({ title, label, initial = "", onClose, onSave }: { title: string; label: string; initial?: string; onClose: () => void; onSave: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Enter a name.");
    setBusy(true);
    try {
      await onSave(name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fieldErrors())[0] ?? err.message) : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="drive-name" loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="drive-name" onSubmit={submit} noValidate>
        <TextField label={label} value={name} onChange={(e) => setName(e.target.value)} error={error} autoFocus />
      </form>
    </Dialog>
  );
}

/** Picks a destination folder by walking the tree one level at a time. */
function MoveDialog({ item, onClose, onMoved }: { item: DriveItemDto; onClose: () => void; onMoved: () => void }) {
  const [target, setTarget] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const folders = useQuery({ queryKey: ["drive", "all-folders"], queryFn: () => allFolders(), gcTime: 0 });
  const move = useMutation({
    mutationFn: () => api(`/drive/${item.id}`, { method: "PATCH", body: { parentId: target || null } }),
    onSuccess: () => {
      onMoved();
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Move ${item.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => move.mutate()} loading={move.isPending} disabled={target === (item.parentId ?? "")}>
            Move here
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
      {folders.isPending ? (
        <Loading />
      ) : (
        <SelectField label="Destination" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">My Drive (top level)</option>
          {(folders.data ?? [])
            .filter((f) => f.id !== item.id)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
        </SelectField>
      )}
    </Dialog>
  );
}

async function allFolders(): Promise<{ id: string; label: string }[]> {
  const out: { id: string; label: string }[] = [];
  const walk = async (folderId: string, prefix: string, depth: number) => {
    if (depth > 6 || out.length > 300) return;
    const listing = await api<DriveListingDto>("/drive", { query: { folderId } });
    for (const f of listing.items.filter((i) => i.kind === "folder")) {
      const label = prefix ? `${prefix} / ${f.name}` : f.name;
      out.push({ id: f.id, label });
      await walk(f.id, label, depth + 1);
    }
  };
  await walk("", "", 0);
  return out;
}
