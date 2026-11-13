// Class settings: name and level for staff; School Admins also assign teachers
// (at least one) and can archive — web: features/classes/ClassSettingsTab.tsx.
// An archived class shows its settings read-only.
import { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "../../../lib/api";
import { JLPT_LEVELS } from "../../../shared/constants";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../components/Toast";
import { classKeys } from "../classHooks";
import { TeacherPicker } from "../TeacherPicker";
import { Button, ConfirmDialog, Field, InlineAlert, Panel, Picker, SectionTitle } from "../ui";
import { spacing, text } from "../../../styles/theme";

/** Back to the Classes list, whichever role's stack this is (its first screen). */
export function backToClasses(navigation) {
  const state = navigation.getState();
  const root = state?.routeNames?.[0];
  if (!root) return;
  if (state.routes?.[0]?.name === root && state.index > 0) navigation.popToTop();
  else navigation.reset({ index: 0, routes: [{ name: root }] });
}

export function SettingsTab({ cls, readOnly, navigation }) {
  const { me } = useAuth();
  const isAdmin = me?.role === "school_admin";
  const [name, setName] = useState(cls.name);
  const [level, setLevel] = useState(cls.level);
  const [teacherIds, setTeacherIds] = useState(cls.teacherIds);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  const save = useMutation({
    mutationFn: (body) => api(`/classes/${cls.id}`, { method: "PATCH", body }),
    onSuccess: () => {
      toast.success("Saved");
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
      setArchiving(false);
      toast.success("Class archived");
      void qc.invalidateQueries({ queryKey: classKeys.all });
      void qc.invalidateQueries({ queryKey: classKeys.one(cls.id) });
      backToClasses(navigation);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function submit() {
    setErrors({});
    setFormError(null);
    const body = { name, level };
    if (isAdmin) {
      if (teacherIds.length === 0) return setErrors({ teacherIds: "Assign at least one teacher." });
      Object.assign(body, { teacherIds });
    }
    save.mutate(body);
  }

  return (
    <View>
      {formError ? <InlineAlert tone="danger">{formError}</InlineAlert> : null}
      <Panel>
        <SectionTitle>Class details</SectionTitle>
        <Field label="Class name" value={name} onChangeText={setName} error={errors.name} editable={!readOnly} />
        <Picker label="JLPT level" value={level} onChange={setLevel} options={JLPT_LEVELS.map((l) => ({ value: l, label: l }))} disabled={readOnly} error={errors.level} />
        {isAdmin ? <TeacherPicker schoolId={cls.schoolId} value={teacherIds} onChange={setTeacherIds} error={errors.teacherIds} disabled={readOnly} /> : null}
      </Panel>
      {!isAdmin ? <Text style={[text.bodyMuted, { marginBottom: spacing.md }]}>Only your School Admin can assign teachers. Classes are free for students.</Text> : null}
      {!readOnly ? (
        <View style={s.actions}>
          <Button onPress={submit} loading={save.isPending}>Save changes</Button>
          {isAdmin ? <Button variant="dangerSecondary" onPress={() => setArchiving(true)}>Archive class</Button> : null}
        </View>
      ) : null}
      <ConfirmDialog
        open={archiving}
        title={`Archive ${cls.name}?`}
        body="Students keep read access and the history stays in reports. The class stops accepting new students, live classes, content, and materials. This can't be undone."
        confirmLabel="Archive class"
        busy={archive.isPending}
        onCancel={() => setArchiving(false)}
        onConfirm={() => archive.mutate()}
      />
    </View>
  );
}

const s = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
