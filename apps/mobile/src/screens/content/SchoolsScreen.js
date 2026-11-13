// Only a Content Admin creates schools and their School Admins (mirror of
// apps/web/src/roles/content/SchoolsPage.tsx). New School Admins get a Firebase
// password-reset email as their invitation; if that email can't be sent the
// screen says so (and offers Resend) instead of claiming it went out.
import { useMemo, useState } from "react";
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../config/firebase";
import { api, ApiError, errorMessage } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { DEFAULT_TIME_ZONE } from "../../shared/constants";
import { useToast } from "../../components/Toast";
import { Loading, ErrorState, EmptyState } from "../../components/QueryState";
import { Badge, Btn, Dialog, Field, Header, Notice, s as ui } from "./ui";
import { colors, spacing, text } from "../../styles/theme";

const sendInvite = (email) => sendPasswordResetEmail(auth, email).then(() => true, () => false);

// Same list the web page offers (Intl's zones, or its fallback when unsupported).
const TIME_ZONES = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["Asia/Manila", "Asia/Tokyo", "Asia/Singapore", "UTC"];
  }
})();

const isValidZone = (tz) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export function SchoolsScreen() {
  const q = useQuery({ queryKey: ["schools"], queryFn: () => api("/schools").then((r) => r.items) });
  const [creating, setCreating] = useState(false);
  const [addingTo, setAddingTo] = useState(null);
  const [removing, setRemoving] = useState(null);
  const qc = useQueryClient();
  const toast = useToast();
  const remove = useMutation({
    mutationFn: (r) => api(`/schools/${r.school.id}/admins/${r.uid}`, { method: "DELETE" }),
    onSuccess: () => {
      setRemoving(null);
      toast.success("School Admin removed");
      void qc.invalidateQueries({ queryKey: ["schools"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  async function resend(email) {
    const ok = await sendInvite(email);
    if (ok) toast.info(`Sent a new sign-in link to ${email}`);
    else toast.error(`Couldn't send a sign-in link to ${email}. Try again.`);
  }

  const header = (
    <View>
      <Header title="Schools" right={<Btn small label="+ New school" onPress={() => setCreating(true)} />} />
      <Text style={[text.small, { paddingHorizontal: spacing.lg, marginBottom: spacing.md }]}>
        Create a school with its School Admin. School Admins add their teachers; students sign up in the app.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <FlatList
        data={q.isSuccess ? q.data : []}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} />}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        ListEmptyComponent={
          q.isPending ? (
            <Loading />
          ) : q.isError ? (
            <ErrorState error={q.error} retry={q.refetch} />
          ) : (
            <EmptyState action={<Btn label="New school" onPress={() => setCreating(true)} />}>No schools yet.</EmptyState>
          )
        }
        renderItem={({ item: s }) => (
          <View style={[ui.panel, { marginHorizontal: spacing.lg }]}>
            <Text style={styles.schoolName}>{s.name}</Text>
            <Text style={text.small}>{s.timeZone} · since {formatDate(s.createdAt)}</Text>
            <Btn small variant="secondary" label="+ Add School Admin" onPress={() => setAddingTo(s)} style={{ alignSelf: "flex-start", marginTop: spacing.sm }} />
            <View style={styles.stats}>
              <Stat label="Teachers" value={`${s.seats.used} of ${s.seats.total}`} />
              <Stat label="Students" value={String(s.students)} />
              <Stat label="Classes" value={String(s.classes)} />
            </View>
            <Text style={[ui.label, { marginTop: spacing.md, color: colors.ink2 }]}>School Admins</Text>
            {s.admins.map((a) => (
              <View key={a.uid} style={styles.adminRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" }}>
                    <Text style={[text.body, { fontWeight: "600" }]} numberOfLines={1}>{a.name}</Text>
                    {a.invited ? <Badge tone="info">Invited</Badge> : null}
                  </View>
                  <Text style={text.small} numberOfLines={1}>{a.email}</Text>
                </View>
                {a.invited ? <Btn small variant="ghost" label="Resend" onPress={() => resend(a.email)} /> : null}
                {s.admins.length > 1 ? (
                  <Btn small variant="dangerGhost" label="Remove" accessibilityLabel={`Remove ${a.name}`} onPress={() => setRemoving({ school: s, uid: a.uid, name: a.name })} />
                ) : null}
              </View>
            ))}
          </View>
        )}
      />
      {creating ? <CreateSchoolDialog onClose={() => setCreating(false)} /> : null}
      {addingTo ? <AddAdminDialog school={addingTo} onClose={() => setAddingTo(null)} /> : null}
      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? ""}?`}
        footer={
          <>
            <Btn variant="secondary" label="Cancel" onPress={() => setRemoving(null)} />
            <Btn variant="danger" label="Remove" loading={remove.isPending} onPress={() => removing && remove.mutate(removing)} />
          </>
        }
      >
        <Text style={text.body}>They won't be able to sign in. The school keeps its other School Admins, teachers, and classes.</Text>
      </Dialog>
    </SafeAreaView>
  );
}

function Stat({ label, value }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={text.small}>{label}</Text>
      <Text style={[text.body, { fontWeight: "700" }]}>{value}</Text>
    </View>
  );
}

function useFormErrors() {
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const fail = (err) => {
    if (err instanceof ApiError && err.code === "validation_error") setErrors(err.fieldErrors());
    else setFormError(errorMessage(err));
  };
  const reset = () => {
    setErrors({});
    setFormError(null);
  };
  return { errors, formError, fail, reset };
}

function TimeZonePicker({ value, onChange, error }) {
  const [search, setSearch] = useState("");
  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase().replace(/\s+/g, "_");
    const list = needle ? TIME_ZONES.filter((z) => z.toLowerCase().includes(needle)) : TIME_ZONES;
    return list.slice(0, 8);
  }, [search]);
  const typed = search.trim().replace(/\s+/g, "_");
  const offerTyped = typed && !TIME_ZONES.includes(typed) && isValidZone(typed);
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={ui.label}>Time zone</Text>
      <Text style={[text.body, { fontWeight: "600" }]}>{value.replace(/_/g, " ")}</Text>
      <Field placeholder="Search time zones" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} style={{ marginTop: spacing.xs }} error={error} hint="Live classes are scheduled in this time zone." />
      {search ? (
        <View style={styles.zoneList}>
          {offerTyped ? (
            <Pressable style={styles.zone} onPress={() => (onChange(typed), setSearch(""))} accessibilityRole="button">
              <Text style={text.body}>{typed.replace(/_/g, " ")}</Text>
            </Pressable>
          ) : null}
          {matches.map((z) => (
            <Pressable key={z} style={[styles.zone, z === value && styles.zoneOn]} onPress={() => (onChange(z), setSearch(""))} accessibilityRole="button">
              <Text style={text.body}>{z.replace(/_/g, " ")}</Text>
            </Pressable>
          ))}
          {!matches.length && !offerTyped ? <Text style={[text.small, { padding: spacing.sm }]}>No time zone matches.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function CreateSchoolDialog({ onClose }) {
  const [name, setName] = useState("");
  const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const { errors, formError, fail, reset } = useFormErrors();
  const qc = useQueryClient();
  const toast = useToast();
  async function submit() {
    reset();
    setBusy(true);
    try {
      const res = await api("/schools", { body: { name, timeZone, adminName, adminEmail } });
      const sent = await sendInvite(res.sendPasswordResetTo);
      if (sent) toast.success(`Created ${res.school.name}. We emailed ${res.sendPasswordResetTo} a link to set a password.`);
      else toast.error(`Created ${res.school.name}, but couldn't email ${res.sendPasswordResetTo} a sign-in link. Use Resend.`);
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
          <Btn variant="secondary" label="Cancel" onPress={onClose} disabled={busy} />
          <Btn label="Create school" loading={busy} onPress={submit} />
        </>
      }
    >
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <Field label="School name" value={name} onChangeText={setName} error={errors.name} />
      <TimeZonePicker value={timeZone} onChange={setTimeZone} error={errors.timeZone} />
      <Text style={[text.body, { fontWeight: "600", marginTop: spacing.lg }]}>First School Admin</Text>
      <Field label="Name" value={adminName} onChangeText={setAdminName} error={errors.adminName} />
      <Field label="Email" value={adminEmail} onChangeText={setAdminEmail} error={errors.adminEmail} autoCapitalize="none" keyboardType="email-address" hint="They get an email to set their password." />
    </Dialog>
  );
}

function AddAdminDialog({ school, onClose }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const { errors, formError, fail, reset } = useFormErrors();
  const qc = useQueryClient();
  const toast = useToast();
  async function submit() {
    reset();
    setBusy(true);
    try {
      const res = await api(`/schools/${school.id}/admins`, { body: { name, email } });
      const sent = await sendInvite(res.sendPasswordResetTo);
      if (sent) toast.success(`Added ${name} to ${school.name}`);
      else toast.error(`Added ${name} to ${school.name}, but couldn't email ${res.sendPasswordResetTo} a sign-in link. Use Resend.`);
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
          <Btn variant="secondary" label="Cancel" onPress={onClose} disabled={busy} />
          <Btn label="Add School Admin" loading={busy} onPress={submit} />
        </>
      }
    >
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <Field label="Name" value={name} onChangeText={setName} error={errors.name} />
      <Field label="Email" value={email} onChangeText={setEmail} error={errors.email} autoCapitalize="none" keyboardType="email-address" />
    </Dialog>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  schoolName: { ...text.h2, fontSize: 18 },
  stats: { flexDirection: "row", marginTop: spacing.md },
  adminRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  zoneList: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, marginTop: spacing.xs, overflow: "hidden" },
  zone: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paper },
  zoneOn: { backgroundColor: "#eff6ff" },
});
