import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { JLPT_LEVELS, type FlashcardDto, type JlptLevel, type LibraryType, type ListeningTestDto, type Page, type QuizDto, type ReadingTestDto } from "@nihongo/shared";
import { api, errorMessage } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { Badge, Button, DataTable, Dialog, EmptyState, ErrorState, Icon, Loading, PageHeader, Segmented, useToast } from "../../components/ui";
import { LevelSwitcher } from "../../components/LevelSwitcher";
import { ListenButton } from "../../components/audio";
import { TYPE_LABEL, type LibraryItem } from "./libraryApi";
import { LibraryImportDialog } from "./LibraryImportDialog";

type AnyItem = FlashcardDto | QuizDto | ReadingTestDto | ListeningTestDto;

function titleOf(type: LibraryType, item: AnyItem) {
  return type === "flashcards" ? (item as FlashcardDto).term : (item as QuizDto).title;
}

function audioSummary(type: LibraryType, item: AnyItem) {
  if (type === "flashcards") return (item as FlashcardDto).audioUrl ? "Audio" : (item as FlashcardDto).expectedAudioName ? `Needs ${(item as FlashcardDto).expectedAudioName}` : "No audio";
  if (type === "quizzes") {
    const qs = (item as QuizDto).questions;
    return `${qs.filter((q) => q.audioUrl).length} of ${qs.length} with answer audio`;
  }
  if (type === "listening-tests") return (item as ListeningTestDto).audioUrl ? "Clip attached" : "Needs a clip";
  return `${(item as ReadingTestDto).questions.length} questions`;
}

export function LibraryListPage({ type }: { type: LibraryType }) {
  const [params, setParams] = useSearchParams();
  const level = (JLPT_LEVELS as readonly string[]).includes(params.get("level") ?? "") ? (params.get("level") as JlptLevel) : "N5";
  const status = (params.get("status") as "draft" | "published" | null) ?? "all";
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<AnyItem | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const label = TYPE_LABEL[type];

  const q = useInfiniteQuery({
    queryKey: ["library", type, "list", level, status],
    queryFn: ({ pageParam }) => api<Page<LibraryItem<typeof type>>>(`/library/${type}`, { query: { level, status: status === "all" ? undefined : status, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const publish = useMutation({
    mutationFn: ({ id, next }: { id: string; next: "draft" | "published" }) => api(`/library/${type}/${id}/publish`, { body: { status: next } }),
    onSuccess: (_d, v) => {
      toast(v.next === "published" ? "Published" : "Moved to drafts");
      void qc.invalidateQueries({ queryKey: ["library", type] });
    },
    onError: (err) => toast(errorMessage(err), "danger"),
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/library/${type}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleting(null);
      toast("Deleted");
      void qc.invalidateQueries({ queryKey: ["library"] });
    },
    onError: (err) => toast(errorMessage(err), "danger"),
  });

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const importable = type === "flashcards" || type === "quizzes";
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title={label.plural}
        description={`Built-in ${label.plural.toLowerCase()} for Self-Study. Students see published items only.`}
        actions={
          !importable ? (
            <Button icon="plus" onClick={() => navigate(`/c/${type}/new?level=${level}`)}>
              New {label.singular}
            </Button>
          ) : null
        }
      />
      {importable ? (
        <div className="mb-6 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => navigate(`/c/${type}/new?level=${level}`)} className="flex min-h-14 items-center gap-3 rounded-paper border border-line bg-paper px-4 py-3 text-left hover:border-ai">
            <Icon name="edit" className="text-ai" />
            <span>
              <span className="block font-medium">Enter manually</span>
              <span className="block text-sm text-ink-2">Create one {label.singular} with its audio.</span>
            </span>
          </button>
          <button type="button" onClick={() => setImporting(true)} className="flex min-h-14 items-center gap-3 rounded-paper border border-line bg-paper px-4 py-3 text-left hover:border-ai">
            <Icon name="upload" className="text-ai" />
            <span>
              <span className="block font-medium">Upload Excel</span>
              <span className="block text-sm text-ink-2">Import rows as drafts, then match the audio files.</span>
            </span>
          </button>
        </div>
      ) : null}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <LevelSwitcher value={level} onChange={(l) => set("level", l)} />
        <Segmented
          label="Status"
          value={status}
          onChange={(v) => set("status", v)}
          options={[
            { value: "all", label: "All" },
            { value: "draft", label: "Drafts" },
            { value: "published", label: "Published" },
          ]}
        />
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState>
          No {status === "all" ? "" : `${status} `}
          {label.plural.toLowerCase()} for {level} yet.
        </EmptyState>
      ) : (
        <DataTable label={`${label.plural} for ${level}`}>
          <thead>
            <tr>
              <th scope="col">{type === "flashcards" ? "Term" : "Title"}</th>
              {type === "flashcards" ? <th scope="col">Meaning</th> : <th scope="col">Questions</th>}
              <th scope="col">Audio</th>
              <th scope="col">Status</th>
              <th scope="col">Updated</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td lang="ja" className={type === "flashcards" ? "study-text text-lg" : "font-medium"}>
                  <Link to={`/c/${type}/${item.id}`}>{titleOf(type, item)}</Link>
                </td>
                <td>{type === "flashcards" ? (item as FlashcardDto).meaning : (item as QuizDto).questions.length}</td>
                <td className="whitespace-nowrap">
                  {type === "flashcards" && (item as FlashcardDto).audioUrl ? (
                    <ListenButton src={(item as FlashcardDto).audioUrl!} label={`Play pronunciation of ${(item as FlashcardDto).term}`} />
                  ) : (
                    <span className="text-ink-2">{audioSummary(type, item)}</span>
                  )}
                </td>
                <td>{item.status === "published" ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge>}</td>
                <td className="whitespace-nowrap text-ink-2">{formatDate(item.updatedAt)}</td>
                <td className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" onClick={() => publish.mutate({ id: item.id, next: item.status === "published" ? "draft" : "published" })}>
                    {item.status === "published" ? "Unpublish" : "Publish"}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-shu" onClick={() => setDeleting(item)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {q.hasNextPage ? (
        <Button variant="secondary" className="mt-4" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
          Show more
        </Button>
      ) : null}
      {importing && importable ? <LibraryImportDialog type={type} defaultLevel={level} onClose={() => setImporting(false)} /> : null}
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete this ${label.singular}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={del.isPending} onClick={() => deleting && del.mutate(deleting.id)}>
              Delete
            </Button>
          </>
        }
      >
        <p>Its audio is deleted too. Students' past scores stay in their history.</p>
      </Dialog>
    </>
  );
}
