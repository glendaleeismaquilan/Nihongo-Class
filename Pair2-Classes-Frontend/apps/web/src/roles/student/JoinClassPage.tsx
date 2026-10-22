import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CLASS_CODE_ALPHABET, CLASS_CODE_LENGTH, type ClassPreviewDto } from "@nihongo/shared";
import { api, ApiError, errorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { Alert, Button, ButtonLink, ErrorState, LevelTag, Loading, PageHeader, Panel, TextField, levelStripe, useToast } from "../../components/ui";

/** FR-3.2.3 / FR-3.13.2: enter a code, see a preview, then join. Classes are free. */
export function JoinClassPage() {
  const { code: codeParam } = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(codeParam?.toUpperCase() ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCode(codeParam?.toUpperCase() ?? "");
  }, [codeParam]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (normalized.length !== CLASS_CODE_LENGTH || ![...normalized].every((c) => CLASS_CODE_ALPHABET.includes(c))) {
      setError("Class codes are 6 letters and numbers, like K7M2QX.");
      return;
    }
    setError(null);
    navigate(`/s/join/${normalized}`);
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Join a class" description="Enter the 6-character code your teacher gave you." />
      <form onSubmit={submit} className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
        <TextField
          label="Class code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 6))}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="sm:w-60"
          error={error}
          style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.2em", fontSize: "1.25rem" }}
        />
        <Button type="submit">Find class</Button>
      </form>
      {codeParam ? <ClassPreview key={codeParam} code={codeParam.toUpperCase()} /> : null}
    </div>
  );
}

function ClassPreview({ code }: { code: string }) {
  const q = useQuery({ queryKey: ["class-preview", code], queryFn: () => api<ClassPreviewDto>("/classes/preview", { query: { code } }), retry: false });
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  if (q.isPending) return <Loading label="Looking up the class" />;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404) return <Alert tone="danger">No class uses the code {code}. Check it with your teacher.</Alert>;
    return <ErrorState error={q.error} retry={() => q.refetch()} />;
  }
  const p = q.data;
  const enrolled = p.enrollment?.status === "active";

  async function join() {
    setJoining(true);
    setError(null);
    try {
      await api("/classes/join", { body: { code } });
      await qc.invalidateQueries({ queryKey: ["classes"] });
      toast("You're enrolled");
      navigate(`/s/classes/${p.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setJoining(false);
    }
  }

  return (
    <Panel className={`px-5 py-5 ${levelStripe(p.level)}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl">{p.name}</h2>
          <p className="mt-1 text-ink-2">{p.schoolName}</p>
        </div>
        <LevelTag level={p.level} />
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-ink-2">Teacher</dt>
          <dd>{p.teachers.join(", ") || "To be announced"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm text-ink-2">Upcoming live classes</dt>
          <dd>
            {p.upcomingSessions.length ? (
              <ul>
                {p.upcomingSessions.map((s) => (
                  <li key={s.startAt}>
                    {s.title}: {formatDateTime(s.startAt)}
                  </li>
                ))}
              </ul>
            ) : (
              "None scheduled yet"
            )}
          </dd>
        </div>
      </dl>
      {error ? (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
      <div className="mt-5">
        {p.status === "archived" ? (
          <Alert>This class is archived and isn't accepting students.</Alert>
        ) : enrolled ? (
          <ButtonLink to={`/s/classes/${p.id}`}>Open class</ButtonLink>
        ) : p.enrollment?.status === "removed" ? (
          <Alert>Your teacher removed you from this class. Ask them to add you back.</Alert>
        ) : (
          <Button onClick={join} loading={joining}>
            Join class
          </Button>
        )}
      </div>
    </Panel>
  );
}
