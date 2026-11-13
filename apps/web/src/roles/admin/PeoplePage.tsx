import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sendPasswordResetEmail } from "firebase/auth";
import { PLANS, type UserDto } from "@nihongo/shared";
import { api, ApiError, errorMessage } from "../../lib/api";
import { auth } from "../../lib/firebase";
import { useMe } from "../../lib/auth";
import { formatDate, formatPeso } from "../../lib/format";
import { useSchoolBilling } from "./BillingPage";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Segmented,
  TextField,
  useToast,
} from "../../components/ui";

type Tab = "teacher" | "student";

/**
 * FR-3.10.2: a School Admin adds teachers (5 free, more with bought slots).
 * Students sign up in the app themselves and join with a class code.
 */
export function PeoplePage() {
  const me = useMe();
  const schoolId = me.schoolId!;
  const [tab, setTab] = useState<Tab>("teacher");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [removing, setRemoving] = useState<UserDto | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  const q = useQuery({
    queryKey: ["school-users", schoolId, tab],
    queryFn: () => api<{ items: UserDto[] }>(`/schools/${schoolId}/users`, { query: { role: tab } }),
  });

  const remove = useMutation({
    mutationFn: (uid: string) => api(`/users/${uid}`, { method: "DELETE" }),
    onSuccess: () => {
      setRemoving(null);
      toast("Removed");
      void qc.invalidateQueries({ queryKey: ["school-users"] });
      void qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (err) => toast(errorMessage(err), "danger"),
  });
  const billing = useSchoolBilling();
  const seats = billing.data?.seats;

  const items = (q.data?.items ?? []).filter((u) => {
    const s = search.trim().toLowerCase();
    return !s || u.name.toLowerCase().includes(s) || u.email.includes(s);
  });

  return (
    <>
      <PageHeader
        title="People"
        description="Add teachers here; they get an email to set their password. Students create their own accounts in the app and join with a class code."
        actions={
          <Button icon="plus" onClick={() => setAdding(true)}>
            Add teacher
          </Button>
        }
      />
      {seats ? (
        <div className="mb-4">
          {seats.available ? (
            <Alert>
              {seats.used} of {seats.total} teacher slots in use. {seats.available} left.
            </Alert>
          ) : (
            <Alert title="All teacher slots are in use">
              <p>
                Your school has {seats.total} teacher slots and all are taken. Add {PLANS.seatPackSize} more for {formatPeso(PLANS.seatPackPriceCentavos)} (one-time), or remove a teacher.
              </p>
              <ButtonLink size="sm" className="mt-2" to="/a/billing">
                Buy teacher slots
              </ButtonLink>
            </Alert>
          )}
        </div>
      ) : null}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Segmented
          label="Role"
          value={tab}
          onChange={setTab}
          options={[
            { value: "teacher", label: "Teachers" },
            { value: "student", label: "Students" },
          ]}
        />
        <TextField label="Search" type="search" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:w-72" />
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState action={tab === "teacher" ? <Button onClick={() => setAdding(true)}>Add teacher</Button> : undefined}>
          {search ? "No one matches that search." : tab === "teacher" ? "No teachers yet. Add a teacher so they can run classes." : "No students yet. Share a class code: students sign up in the app and join with it."}
        </EmptyState>
      ) : (
        <DataTable label={tab === "teacher" ? "Teachers" : "Students"}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Status</th>
              <th scope="col">Added</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.uid}>
                <td className="font-medium">{u.name}</td>
                <td className="text-ink-2">{u.email}</td>
                <td>{u.disabled ? <Badge>Removed</Badge> : u.privacyConsentAt ? <Badge tone="success">Active</Badge> : <Badge tone="info">Invited</Badge>}</td>
                <td className="whitespace-nowrap text-ink-2">{formatDate(u.createdAt)}</td>
                <td className="whitespace-nowrap text-right">
                  {!u.disabled ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                        Edit
                      </Button>
                      {!u.privacyConsentAt ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const ok = await sendPasswordResetEmail(auth, u.email).then(() => true).catch(() => false);
                            if (ok) toast(`Sent a new sign-in link to ${u.email}`, "info");
                            else toast(`Couldn't send a sign-in link to ${u.email}. Try again.`, "danger");
                          }}
                        >
                          Resend invite
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" className="text-shu" onClick={() => setRemoving(u)}>
                        Remove
                      </Button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <AddTeacherDialog open={adding} onClose={() => setAdding(false)} schoolId={schoolId} />
      {editing ? <EditPersonDialog person={editing} onClose={() => setEditing(null)} /> : null}
      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? ""}?`}
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
        <p>They won't be able to sign in, and they'll leave their classes. Removing a teacher frees their slot. Past results and attendance stay in your reports.</p>
      </Dialog>
    </>
  );
}

function AddTeacherDialog({ open, onClose, schoolId }: { open: boolean; onClose: () => void; schoolId: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [noSlots, setNoSlots] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  function close() {
    setName("");
    setEmail("");
    setErrors({});
    setFormError(null);
    setNoSlots(false);
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    setNoSlots(false);
    try {
      const res = await api<{ user: UserDto; sendPasswordReset: boolean }>(`/schools/${schoolId}/users`, { body: { name, email } });
      // Decision 2: right after the API creates the account, send the set-password email.
      if (res.sendPasswordReset) await sendPasswordResetEmail(auth, res.user.email, { url: `${window.location.origin}/login` }).catch(() => undefined);
      toast(`Added ${res.user.name}. We emailed them a link to set a password.`);
      void qc.invalidateQueries({ queryKey: ["school-users"] });
      void qc.invalidateQueries({ queryKey: ["billing"] });
      close();
    } catch (err) {
      if (err instanceof ApiError && err.code === "validation_error") setErrors(err.fieldErrors());
      else if (err instanceof ApiError && err.code === "seat_limit_reached") setNoSlots(true);
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add teacher"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          {noSlots ? (
            <ButtonLink to="/a/billing">Buy teacher slots</ButtonLink>
          ) : (
            <Button type="submit" form="add-teacher" loading={busy}>
              Add teacher
            </Button>
          )}
        </>
      }
    >
      <form id="add-teacher" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required />
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required />
        <p className="text-sm text-ink-2">Your first {PLANS.freeTeacherSeats} teachers are free. Students don't need to be added: they sign up in the app.</p>
      </form>
    </Dialog>
  );
}

function EditPersonDialog({ person, onClose }: { person: UserDto; onClose: () => void }) {
  const [name, setName] = useState(person.name);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => api(`/users/${person.uid}`, { method: "PATCH", body: { name } }),
    onSuccess: () => {
      toast("Saved");
      void qc.invalidateQueries({ queryKey: ["school-users"] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit ${person.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
    </Dialog>
  );
}
