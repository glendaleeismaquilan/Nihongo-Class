import { useState } from "react";
import { Link, Outlet, useOutletContext, useParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClassDto } from "@nihongo/shared";
import { api, errorMessage } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { Alert, Badge, Button, Dialog, ErrorState, Icon, LevelTag, Loading, RouteTabs, useToast } from "../../components/ui";
import { classKeys, useClass } from "./hooks";
import { ActiveCallBanner } from "../calls/ActiveCallBanner";

export interface WorkspaceContext {
  cls: ClassDto;
  basePath: string;
  readOnly: boolean;
}

export const useWorkspace = () => useOutletContext<WorkspaceContext>();

function CodeBox({ cls }: { cls: ClassDto }) {
  const [confirm, setConfirm] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const link = `${window.location.origin}/join/${cls.code}`;
  const regen = useMutation({
    mutationFn: () => api<{ code: string }>(`/classes/${cls.id}/code`, { method: "POST" }),
    onSuccess: () => {
      setConfirm(false);
      toast("New code created");
      void qc.invalidateQueries({ queryKey: classKeys.one(cls.id) });
      void qc.invalidateQueries({ queryKey: classKeys.all });
    },
    onError: (err) => toast(errorMessage(err), "danger"),
  });
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-paper border border-line bg-paper px-3 py-2">
      <span className="text-sm text-ink-2">Class code</span>
      <span className="font-mono text-lg font-semibold tracking-[0.2em]" aria-label={`Class code ${cls.code?.split("").join(" ")}`}>
        {cls.code}
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          await navigator.clipboard?.writeText(link).catch(() => undefined);
          toast("Join link copied");
        }}
      >
        Copy join link
      </Button>
      {cls.status === "active" ? (
        <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
          New code
        </Button>
      ) : null}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Create a new class code?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={() => regen.mutate()} loading={regen.isPending}>
              Create new code
            </Button>
          </>
        }
      >
        <p>The current code {cls.code} stops working. Students already in the class stay enrolled.</p>
      </Dialog>
    </div>
  );
}

export function ClassWorkspace({ basePath }: { basePath: string }) {
  const { classId = "" } = useParams();
  const me = useMe();
  const q = useClass(classId);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const cls = q.data;
  const readOnly = cls.status === "archived";
  const here = `${basePath}/${cls.id}`;
  return (
    <>
      <Link to={basePath} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm no-underline">
        <Icon name="chevron-left" size={16} />
        Classes
      </Link>
      <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl">{cls.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-ink-2">
            <LevelTag level={cls.level} />
            <span>{cls.teachers.map((t) => t.name).join(", ") || "No teacher assigned"}</span>
            <span>{cls.studentCount ?? 0} students</span>
            {readOnly ? <Badge>Archived</Badge> : null}
          </div>
        </div>
        <CodeBox cls={cls} />
      </header>
      {readOnly ? (
        <div className="mb-4">
          <Alert>This class is archived. Students can still open it, but it accepts no new students, live classes, content, or materials.</Alert>
        </div>
      ) : (
        <ActiveCallBanner classId={cls.id} />
      )}
      <RouteTabs
        label="Class sections"
        items={[
          { to: here, label: "Lessons and content", end: true },
          { to: `${here}/live`, label: "Live classes" },
          { to: `${here}/materials`, label: "Materials" },
          { to: `${here}/roster`, label: "Roster" },
          { to: `${here}/reports`, label: "Reports" },
          ...(me.role === "school_admin" || !readOnly ? [{ to: `${here}/settings`, label: "Class settings" }] : []),
        ]}
      />
      <Outlet context={{ cls, basePath: here, readOnly } satisfies WorkspaceContext} />
    </>
  );
}
