import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FlashcardDto, Page, QuizDto } from "@nihongo/shared";
import { api, errorMessage, upload } from "../../lib/api";
import { Alert, Badge, Button, DataTable, ErrorState, Icon, Loading, PageHeader, Panel, SectionTitle, useToast } from "../../components/ui";
import { FileDrop } from "../../components/FileDrop";
import { matchAudio, type AudioTarget } from "./matchAudio";

type RowState = "uploading" | "done" | "error";

/** FR-3.5.3 review screen: drop many audio files, match by name, publish. */
export function ImportReviewPage() {
  const { type = "flashcards", batchId = "" } = useParams() as { type: "flashcards" | "quizzes"; batchId: string };
  const qc = useQueryClient();
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [rowState, setRowState] = useState<Record<string, { state: RowState; message?: string }>>({});
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["library", type, "batch", batchId],
    queryFn: () => api<Page<FlashcardDto | QuizDto>>(`/library/${type}`, { query: { batch: batchId } }),
  });

  const targets: (AudioTarget & { itemId: string; questionIndex?: number; status: string })[] = useMemo(() => {
    const items = q.data?.items ?? [];
    if (type === "flashcards") {
      return (items as FlashcardDto[]).map((c) => ({ key: c.id, itemId: c.id, label: c.term, expected: c.expectedAudioName ?? null, hasAudio: !!c.audioUrl, status: c.status }));
    }
    return (items as QuizDto[]).flatMap((quiz) =>
      quiz.questions.map((qq, i) => ({ key: `${quiz.id}:${i}`, itemId: quiz.id, questionIndex: i, label: qq.text, expected: qq.expectedAudioName ?? null, hasAudio: !!qq.audioUrl, status: quiz.status })),
    );
  }, [q.data, type]);

  const match = matchAudio(targets, files);
  const drafts = (q.data?.items ?? []).filter((i) => i.status === "draft").length;

  const publishAll = useMutation({
    mutationFn: () => api<{ published: number }>(`/library/${type}/batch/${batchId}/publish`, { method: "POST" }),
    onSuccess: (r) => {
      toast(`Published ${r.published}`);
      void qc.invalidateQueries({ queryKey: ["library"] });
    },
    onError: (err) => toast(errorMessage(err), "danger"),
  });

  async function uploadMatched() {
    setBusy(true);
    for (const { target, file } of match.matched) {
      const t = targets.find((x) => x.key === target.key)!;
      setRowState((s) => ({ ...s, [t.key]: { state: "uploading" } }));
      const form = new FormData();
      if (t.questionIndex !== undefined) form.set("questionIndex", String(t.questionIndex));
      form.set("fileName", file.name);
      form.set("file", file);
      try {
        await upload(`/library/${type}/${t.itemId}/audio`, form);
        setRowState((s) => ({ ...s, [t.key]: { state: "done" } }));
      } catch (err) {
        setRowState((s) => ({ ...s, [t.key]: { state: "error", message: errorMessage(err) } }));
      }
    }
    setFiles((fs) => fs.filter((f) => !match.matched.some((m) => m.file === f)));
    await qc.invalidateQueries({ queryKey: ["library", type, "batch", batchId] });
    setBusy(false);
  }

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;

  return (
    <>
      <Link to={`/c/${type}`} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm no-underline">
        <Icon name="chevron-left" size={16} />
        {type === "quizzes" ? "Quizzes" : "Flashcards"}
      </Link>
      <PageHeader
        title="Review import"
        description="Drop the audio files named in the Audio File Name column. They're matched to rows by file name, ignoring upper and lower case."
        actions={
          drafts ? (
            <Button onClick={() => publishAll.mutate()} loading={publishAll.isPending}>
              Publish all {drafts}
            </Button>
          ) : (
            <Badge tone="success">Published</Badge>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <DataTable label="Imported rows">
          <thead>
            <tr>
              <th scope="col">{type === "quizzes" ? "Question" : "Term"}</th>
              <th scope="col">Audio file name</th>
              <th scope="col">Audio</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => {
              const m = match.matched.find((x) => x.target.key === t.key);
              const rs = rowState[t.key];
              return (
                <tr key={t.key}>
                  <td lang="ja" className="study-text">
                    {t.label}
                  </td>
                  <td className="text-ink-2">{t.expected ?? "None"}</td>
                  <td>
                    {rs?.state === "uploading" ? (
                      <span role="status">Uploading…</span>
                    ) : rs?.state === "error" ? (
                      <span className="text-shu">{rs.message}</span>
                    ) : t.hasAudio || rs?.state === "done" ? (
                      <Badge tone="success">Attached</Badge>
                    ) : m ? (
                      <Badge tone="info">Matched {m.file.name}</Badge>
                    ) : t.expected ? (
                      <Badge tone="danger">No file yet</Badge>
                    ) : (
                      <span className="text-ink-2">Not needed</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
        <div className="flex flex-col gap-4">
          <FileDrop multiple accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" label="Choose audio files" hint="Or drag many files here at once." onFiles={(f) => setFiles((prev) => [...prev, ...f])} disabled={busy} />
          <Panel className="px-4 py-3" as="div">
            <SectionTitle>Matching</SectionTitle>
            <p>
              {match.matched.length} matched, {match.unmatchedTargets.length} rows still missing a file.
            </p>
            {match.unmatchedFiles.length ? (
              <div className="mt-3">
                <Alert tone="danger" title="Files that match no row">
                  <ul className="list-disc pl-5">
                    {match.unmatchedFiles.map((f) => (
                      <li key={f.name}>{f.name}</li>
                    ))}
                  </ul>
                </Alert>
              </div>
            ) : null}
            {match.unmatchedTargets.length ? (
              <div className="mt-3">
                <p className="text-sm font-medium">Rows without a file</p>
                <ul className="list-disc pl-5 text-sm text-ink-2">
                  {match.unmatchedTargets.map((t) => (
                    <li key={t.key}>
                      <span lang="ja">{t.label}</span>: {t.expected}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Button className="mt-4 w-full" icon="upload" disabled={!match.matched.length} loading={busy} onClick={uploadMatched}>
              Attach {match.matched.length} matched file{match.matched.length === 1 ? "" : "s"}
            </Button>
          </Panel>
        </div>
      </div>
    </>
  );
}
