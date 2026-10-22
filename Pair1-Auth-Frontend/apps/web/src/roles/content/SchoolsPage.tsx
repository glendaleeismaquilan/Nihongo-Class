import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sendPasswordResetEmail } from "firebase/auth";
import type { SchoolSummaryDto } from "@nihongo/shared";
import { api, ApiError, errorMessage } from "../../lib/api";
import { auth } from "../../lib/firebase";
import { formatDate } from "../../lib/format";
import { Alert, Badge, Button, Dialog, EmptyState, ErrorState, IconButton, Loading, PageHeader, Panel, TextField, useToast } from "../../components/ui";
import { TimeZoneSelect } from "../../pages/common/ProfilePage";

const sendInvite = (email: string) => sendPasswordResetEmail(auth, email, { url: `${window.location.origin}/login` }).catch(() => undefined);

/** Only a Content Admin creates schools and their School Admins. */
export function SchoolsPage() {
  const q = useQuery({ queryKey: ["schools"], queryFn: () => api<{ items: SchoolSummaryDto[] }>("/schools").then((r) => r.items) });
  const [creating, setCreating] = useState(false);
  const [addingTo, setAddingTo] = useState<SchoolSummaryDto | null>(null);
  const [removing, setRemoving] = useState<{ school: SchoolSummaryDto; uid: string; name: string } | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const remove = useMutation({
    mutationFn: (r: NonNullable<typeof removing>) => api(`/schools/${r.school.id}/admins/${r.uid}`, { method: "DELETE" }),
    onSuccess: () => {
      setRemoving(null);
      toast("School Admin removed");
      void qc.invalidateQueries({ queryKey: ["schools"] });
    },
    onError: (err) => toast(errorMessage(err), "danger"),
  });

  return (
    <>
      <PageHeader
        title="Schools"
        description="Create a school with its School Admin. School Admins add their teachers; students sign up in the app."
        actions={
          <Button icon="plus" onClick={() => setCreating(true)}>
            New school
          </Button>
        }
      />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState action={<Button onClick={() => setCreating(true)}>New school</Button>}>No schools yet.</EmptyState>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {q.data.map((s) => (
            <Panel as="li" key={s.id} className="px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg">{s.name}</h2>
                  <p className="text-sm text-ink-2">
                    {s.timeZone} · since {formatDate(s.createdAt)}
                  </p>
                </div>
                <Button size="sm" variant="secondary" icon="plus" onClick={() => setAddingTo(s)}>
                  Add School Admin
                </Button>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-ink-2">Teachers</dt>
                  <dd className="font-semibold">
                    {s.seats.used} of {s.seats.total}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-2">Students</dt>
                  <dd className="font-semibold">{s.students}</dd>
                </div>
                <div>
                  <dt className="text-ink-2">Classes</dt>
                  <dd className="font-semibold">{s.classes}</dd>
                </div>
              </dl>
              <h3 className="mt-4 text-sm font-medium text-ink-2">School Admins</h3>
              <ul className="mt-1 divide-y divide-line">
                {s.admins.map((a) => (
                  <li key={a.uid} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {a.name} {a.invited ? <Badge tone="info">Invited</Badge> : null}
                      </p>
                      <p className="truncate text-sm text-ink-2">{a.email}</p>
                    </div>
                    <div className="flex shrink-0">
                      {a.invited ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await sendInvite(a.email);
                            toast(`Sent a new sign-in link to ${a.email}`, "info");
                          }}
                        >
                          Resend
                        </Button>
                      ) : null}
                      {s.admins.length > 1 ? <IconButton icon="trash" label={`Remove ${a.name}`} className="text-shu" onClick={() => setRemoving({ school: s, uid: a.uid, name: a.name })} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </ul>
      )}
      {creating ? <CreateSchoolDialog onClose={() => setCreating(false)} /> : null}
      {addingTo ? <AddAdminDialog school={addingTo} onClose={() => setAddingTo(null)} /> : null}
      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? ""}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing)}>
              Remove
            </Button>
          </>
        }
      >
        <p>They won't be able to sign in. The school keeps its other School Admins, teachers, and classes.</p>
      </Dialog>
    </>
  );
}

function useFormErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const fail = (err: unknown) => {
    if (err instanceof ApiError && err.code === "validation_error") setErrors(err.fieldErrors());
    else setFormError(errorMessage(err));
  };
  const reset = () => {
    setErrors({});
    setFormError(null);
  };
  return { errors, formError, fail, reset };
}

function CreateSchoolDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [timeZone, setTimeZone] = useState("Asia/Manila");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const { errors, formError, fail, reset } = useFormErrors();
  const qc = useQueryClient();
  const toast = useToast();
  async function submit(e: FormEvent) {
    e.preventDefault();
    reset();
    setBusy(true);
    try {
      const res = await api<{ school: SchoolSummaryDto; sendPasswordResetTo: string }>("/schools", { body: { name, timeZone, adminName, adminEmail } });
      await sendInvite(res.sendPasswordResetTo);
      toast(`Created ${res.school.name}. We emailed ${res.sendPasswordResetTo} a link to set a password.`);
      void qc.invalidateQueries({ queryKey: ["schools"] });
      onClose();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="New school"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-school" loading={busy}>
            Create school
          </Button>
        </>
      }
    >
      <form id="new-school" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <TextField label="School name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required />
        <TimeZoneSelect value={timeZone} onChange={setTimeZone} hint="Live classes are scheduled in this time zone." />
        <h3 className="mt-2 font-medium">First School Admin</h3>
        <TextField label="Name" value={adminName} onChange={(e) => setAdminName(e.target.value)} error={errors.adminName} required />
        <TextField label="Email" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} error={errors.adminEmail} required hint="They get an email to set their password." />
      </form>
    </Dialog>
  );
}

function AddAdminDialog({ school, onClose }: { school: SchoolSummaryDto; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const { errors, formError, fail, reset } = useFormErrors();
  const qc = useQueryClient();
  const toast = useToast();
  async function submit(e: FormEvent) {
    e.preventDefault();
    reset();
    setBusy(true);
    try {
      const res = await api<{ sendPasswordResetTo: string }>(`/schools/${school.id}/admins`, { body: { name, email } });
      await sendInvite(res.sendPasswordResetTo);
      toast(`Added ${name} to ${school.name}`);
      void qc.invalidateQueries({ queryKey: ["schools"] });
      onClose();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Add a School Admin to ${school.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-admin" loading={busy}>
            Add School Admin
          </Button>
        </>
      }
    >
      <form id="add-admin" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required />
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required />
      </form>
    </Dialog>
  );
}
