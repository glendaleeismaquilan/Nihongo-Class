// Roster: add a student by email, remove one, show removed students —
// web: features/classes/RosterTab.tsx.
import { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "../../../lib/api";
import { formatDate } from "../../../lib/format";
import { Loading, ErrorState, EmptyState } from "../../../components/QueryState";
import { useToast } from "../../../components/Toast";
import { classKeys, useRoster } from "../classHooks";
import { Button, ConfirmDialog, Field, InlineAlert, Panel, ui } from "../ui";
import { spacing, text } from "../../../styles/theme";

const STATUS_LABEL = { active: "Enrolled", removed: "Removed" };

export function RosterTab({ cls, readOnly }) {
  const roster = useRoster(cls.id);
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  const add = useMutation({
    mutationFn: () => api(`/classes/${cls.id}/roster`, { body: { email } }),
    onSuccess: () => {
      toast.success("Student added");
      setEmail("");
      void qc.invalidateQueries({ queryKey: classKeys.roster(cls.id) });
      void qc.invalidateQueries({ queryKey: classKeys.one(cls.id) });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (uid) => api(`/classes/${cls.id}/roster/${uid}`, { method: "DELETE" }),
    onSuccess: () => {
      setRemoving(null);
      toast.success("Removed from class");
      void qc.invalidateQueries({ queryKey: classKeys.roster(cls.id) });
      void qc.invalidateQueries({ queryKey: classKeys.one(cls.id) });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function submit() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter the student's email address.");
    add.mutate();
  }

  const all = roster.data ?? [];
  const items = all.filter((r) => showRemoved || r.status !== "removed");
  const hidden = all.length - all.filter((r) => r.status !== "removed").length;

  return (
    <View>
      {!readOnly ? (
        <Panel>
          <Text style={s.h}>Add a student</Text>
          <Text style={[text.small, { marginTop: spacing.xs }]}>
            Students sign up in the app themselves. Once they have an account, add them here by email, or share the class code.
          </Text>
          {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
          <Field
            label="Student email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            returnKeyType="send"
            onSubmitEditing={submit}
          />
          <Button style={{ marginTop: spacing.md }} onPress={submit} loading={add.isPending}>Add student</Button>
        </Panel>
      ) : null}

      {roster.isPending ? (
        <Loading />
      ) : roster.isError ? (
        <ErrorState error={roster.error} retry={() => roster.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState>No students yet. Share the class code {cls.code}, or add students by email.</EmptyState>
      ) : (
        items.map((r) => (
          <View key={r.uid} style={ui.card}>
            <View style={s.top}>
              <View style={{ flex: 1 }}>
                <Text style={ui.cardTitle}>{r.name}</Text>
                <Text style={text.small}>{r.email}</Text>
                <Text style={text.small}>
                  {STATUS_LABEL[r.status] ?? r.status} · Joined {formatDate(r.joinedAt)}
                </Text>
              </View>
              {!readOnly && r.status !== "removed" ? (
                <Button small variant="dangerGhost" onPress={() => setRemoving(r)}>Remove</Button>
              ) : null}
            </View>
          </View>
        ))
      )}
      {hidden ? (
        <Button variant="ghost" style={{ alignSelf: "flex-start", marginTop: spacing.xs }} onPress={() => setShowRemoved((v) => !v)}>
          {showRemoved ? "Hide removed students" : `Show removed students (${hidden})`}
        </Button>
      ) : null}

      <ConfirmDialog
        open={!!removing}
        title={`Remove ${removing?.name ?? ""} from ${cls.name}?`}
        body="They lose access to this class's lessons, live classes, and materials. Their past results stay in reports."
        confirmLabel="Remove"
        busy={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.uid)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  h: { ...text.h2, fontSize: 18 },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
