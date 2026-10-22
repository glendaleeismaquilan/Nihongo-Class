import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { EnrollmentStatus, RosterEntryDto } from "@nihongo/shared";
import { api, ApiError, errorMessage } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { Alert, Button, DataTable, Dialog, EmptyState, ErrorState, Loading, Panel, TextField, useToast } from "../../components/ui";
import { classKeys, useRoster } from "./hooks";
import { useWorkspace } from "./ClassWorkspace";

const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  active: "Enrolled",
  removed: "Removed",
};

export function RosterTab() {
  const { cls, readOnly } = useWorkspace();
  const roster = useRoster(cls.id);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<RosterEntryDto | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  const add = useMutation({
    mutationFn: () => api(`/classes/${cls.id}/roster`, { body: { email } }),
    onSuccess: () => {
      toast("Student added");
      setEmail("");
      void qc.invalidateQueries({ queryKey: classKeys.roster(cls.id) });
      void qc.invalidateQueries({ queryKey: classKeys.one(cls.id) });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (uid: string) => api(`/classes/${cls.id}/roster/${uid}`, { method: "DELETE" }),
    onSuccess: () => {
      setRemoving(null);
      toast("Removed from class");
      void qc.invalidateQueries({ queryKey: classKeys.roster(cls.id) });
    },
    onError: (err) => toast(errorMessage(err), "danger"),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter the student's email address.");
    add.mutate();
  }

  const all = roster.data ?? [];
  const items = all.filter((r) => showRemoved || r.status !== "removed");
  const hidden = all.length - all.filter((r) => r.status !== "removed").length;

  return (
    <>
      {!readOnly ? (
        <Panel className="mb-6 px-4 py-4">
          <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
            <h2 className="text-lg">Add a student</h2>
            <p className="text-sm text-ink-2">Students sign up in the app themselves. Once they have an account, add them here by email, or share the class code.</p>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <TextField label="Student email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button type="submit" loading={add.isPending}>
                  Add student
                </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {roster.isPending ? (
        <Loading />
      ) : roster.isError ? (
        <ErrorState error={roster.error} retry={() => roster.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState>No students yet. Share the class code {cls.code}, or add students by email.</EmptyState>
      ) : (
        <DataTable label="Roster">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Status</th>
              <th scope="col">Joined</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.uid}>
                <td className="font-medium">{r.name}</td>
                <td className="text-ink-2">{r.email}</td>
                <td>{STATUS_LABEL[r.status]}</td>
                <td className="whitespace-nowrap text-ink-2">{formatDate(r.joinedAt)}</td>
                <td className="whitespace-nowrap text-right">
                  {!readOnly && r.status !== "removed" ? (
                    <Button size="sm" variant="ghost" className="text-shu" onClick={() => setRemoving(r)}>
                        Remove
                      </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {hidden ? (
        <Button variant="ghost" className="mt-2" onClick={() => setShowRemoved((v) => !v)}>
          {showRemoved ? "Hide removed students" : `Show removed students (${hidden})`}
        </Button>
      ) : null}

      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? ""} from ${cls.name}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing.uid)}>
              Remove
            </Button>
          </>
        }
      >
        <p>They lose access to this class's lessons, live classes, and materials. Their past results stay in reports.</p>
      </Dialog>
    </>
  );
}

