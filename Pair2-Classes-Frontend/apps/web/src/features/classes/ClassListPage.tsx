import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { JLPT_LEVELS, type ClassDto, type JlptLevel } from "@nihongo/shared";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { Alert, Badge, Button, DataTable, Dialog, EmptyState, ErrorState, LevelTag, Loading, PageHeader, SelectField, TextField, useToast } from "../../components/ui";
import { classKeys, useClasses, useSchoolTeachers } from "./hooks";

export function TeacherPicker({ schoolId, value, onChange }: { schoolId: string | null; value: string[]; onChange: (ids: string[]) => void }) {
  const teachers = useSchoolTeachers(schoolId);
  if (teachers.isPending) return <Loading label="Loading teachers" />;
  const list = (teachers.data ?? []).filter((t) => !t.disabled);
  return (
    <fieldset>
      <legend className="text-sm font-medium">Teachers</legend>
      {list.length === 0 ? (
        <p className="mt-1 text-sm text-ink-2">No teachers yet. Add them in People.</p>
      ) : (
        <div className="mt-1 flex flex-col">
          {list.map((t) => (
            <label key={t.uid} className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--ai)]"
                checked={value.includes(t.uid)}
                onChange={(e) => onChange(e.target.checked ? [...value, t.uid] : value.filter((v) => v !== t.uid))}
              />
              <span>
                {t.name} <span className="text-ink-2">{t.email}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

export function CreateClassDialog({ open, onClose, basePath }: { open: boolean; onClose: () => void; basePath: string }) {
  const me = useMe();
  const isAdmin = me.role === "school_admin";
  const [name, setName] = useState("");
  const [level, setLevel] = useState<JlptLevel>("N5");
  const [teacherIds, setTeacherIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const cls = await api<ClassDto>("/classes", { body: { name, level, ...(isAdmin ? { teacherIds } : {}) } });
      await qc.invalidateQueries({ queryKey: classKeys.all });
      toast("Class created");
      onClose();
      navigate(`${basePath}/${cls.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "validation_error") setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create class"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-class" loading={busy}>
            Create class
          </Button>
        </>
      }
    >
      <form id="create-class" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <TextField label="Class name" placeholder="N5 Saturday Class" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required />
        <SelectField label="JLPT level" value={level} onChange={(e) => setLevel(e.target.value as JlptLevel)}>
          {JLPT_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </SelectField>
        {isAdmin ? <TeacherPicker schoolId={me.schoolId} value={teacherIds} onChange={setTeacherIds} /> : null}
        <p className="text-sm text-ink-2">
          Classes are free for students. They join with the class code
          shown after you create it.
        </p>
      </form>
    </Dialog>
  );
}

export function ClassListPage({ basePath }: { basePath: string }) {
  const me = useMe();
  const q = useClasses();
  const [creating, setCreating] = useState(false);
  const isAdmin = me.role === "school_admin";
  const items = q.data ?? [];

  return (
    <>
      <PageHeader
        title="Classes"
        description={isAdmin ? "Every class in your school." : "The classes you teach."}
        actions={
          <Button icon="plus" onClick={() => setCreating(true)}>
            Create class
          </Button>
        }
      />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState action={<Button onClick={() => setCreating(true)}>Create class</Button>}>No classes yet. Create one, then share its code with your students.</EmptyState>
      ) : (
        <DataTable label="Classes">
          <thead>
            <tr>
              <th scope="col">Class</th>
              <th scope="col">Level</th>
              {isAdmin ? <th scope="col">Teachers</th> : null}
              <th scope="col">Students</th>
              <th scope="col">Code</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">
                  <Link to={`${basePath}/${c.id}`}>{c.name}</Link>
                </td>
                <td>
                  <LevelTag level={c.level} />
                </td>
                {isAdmin ? <td className="text-ink-2">{c.teachers.map((t) => t.name).join(", ") || "No teacher yet"}</td> : null}
                <td>{c.studentCount ?? 0}</td>
                <td className="font-mono tracking-wider">{c.code}</td>
                <td>{c.status === "archived" ? <Badge>Archived</Badge> : <Badge tone="success">Active</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <CreateClassDialog open={creating} onClose={() => setCreating(false)} basePath={basePath} />
    </>
  );
}
