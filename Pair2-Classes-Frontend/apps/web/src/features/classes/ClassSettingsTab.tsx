import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { JLPT_LEVELS, type JlptLevel } from "@nihongo/shared";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { Alert, Button, Dialog, Panel, SectionTitle, SelectField, TextField, useToast } from "../../components/ui";
import { classKeys } from "./hooks";
import { useWorkspace } from "./ClassWorkspace";
import { TeacherPicker } from "./ClassListPage";

export function ClassSettingsTab() {
  const { cls, readOnly } = useWorkspace();
  const me = useMe();
  const isAdmin = me.role === "school_admin";
  const [name, setName] = useState(cls.name);
  const [level, setLevel] = useState<JlptLevel>(cls.level);
  const [teacherIds, setTeacherIds] = useState(cls.teacherIds);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/classes/${cls.id}`, { method: "PATCH", body }),
    onSuccess: () => {
      toast("Saved");
      void qc.invalidateQueries({ queryKey: classKeys.one(cls.id) });
      void qc.invalidateQueries({ queryKey: classKeys.all });
    },
    onError: (err) => {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setFormError(errorMessage(err));
    },
  });
  const archive = useMutation({
    mutationFn: () => api(`/classes/${cls.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("Class archived");
      void qc.invalidateQueries({ queryKey: classKeys.all });
      navigate("/a/classes");
    },
    onError: (err) => toast(errorMessage(err), "danger"),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const body: Record<string, unknown> = { name, level };
    if (isAdmin) {
      if (teacherIds.length === 0) return setErrors({ teacherIds: "Assign at least one teacher." });
      Object.assign(body, { teacherIds });
    }
    save.mutate(body);
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-6" noValidate>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Panel className="px-5 py-5">
        <SectionTitle>Class details</SectionTitle>
        <div className="flex flex-col gap-4">
          <TextField label="Class name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} disabled={readOnly} />
          <SelectField label="JLPT level" value={level} onChange={(e) => setLevel(e.target.value as JlptLevel)} disabled={readOnly}>
            {JLPT_LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </SelectField>
          {isAdmin ? (
            <>
              <TeacherPicker schoolId={cls.schoolId} value={teacherIds} onChange={setTeacherIds} />
              {errors.teacherIds ? <p className="text-sm text-shu">{errors.teacherIds}</p> : null}
            </>
          ) : null}
        </div>
      </Panel>
      {!isAdmin ? <p className="text-ink-2">Only your School Admin can assign teachers. Classes are free for students.</p> : null}
      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={save.isPending}>
            Save changes
          </Button>
          {isAdmin ? (
            <Button variant="secondary" className="text-shu" onClick={() => setArchiving(true)}>
              Archive class
            </Button>
          ) : null}
        </div>
      ) : null}
      <Dialog
        open={archiving}
        onClose={() => setArchiving(false)}
        title={`Archive ${cls.name}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setArchiving(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => archive.mutate()} loading={archive.isPending}>
              Archive class
            </Button>
          </>
        }
      >
        <p>Students keep read access and the history stays in reports. The class stops accepting new students, live classes, content, and materials. This can't be undone.</p>
      </Dialog>
    </form>
  );
}
