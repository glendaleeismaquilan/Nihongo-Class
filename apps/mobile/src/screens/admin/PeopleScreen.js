// FR-3.10.2 (mirror of apps/web/src/roles/admin/PeoplePage.tsx): a School Admin
// sees teachers and students, adds teachers (5 free, more with bought slots),
// edits names, resends invites and removes people. Students sign themselves up.
import { useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../config/firebase";
import { api, ApiError, errorMessage } from "../../lib/api";
import { formatDate, formatPeso } from "../../lib/format";
import { PLANS } from "../../shared/constants";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/Toast";
import { Loading, ErrorState, EmptyState } from "../../components/QueryState";
import { useSchoolBilling } from "./SchoolBillingScreen";
import { PageHeader, Badge } from "./adminUi";
import { colors, spacing, text } from "../../styles/theme";

const TABS = [
  { value: "teacher", label: "Teachers" },
  { value: "student", label: "Students" },
];

export function PeopleScreen({ navigation }) {
  const { me } = useAuth();
  const schoolId = me?.schoolId;
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState("teacher");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);

  const q = useQuery({
    queryKey: ["school-users", schoolId, tab],
    queryFn: () => api(`/schools/${schoolId}/users`, { query: { role: tab } }),
  });
  const billing = useSchoolBilling();
  const seats = billing.data?.seats;

  const remove = useMutation({
    mutationFn: (uid) => api(`/users/${uid}`, { method: "DELETE" }),
    onSuccess: () => {
      setRemoving(null);
      toast.success("Removed");
      void qc.invalidateQueries({ queryKey: ["school-users"] });
      void qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  async function resendInvite(u) {
    try {
      await sendPasswordResetEmail(auth, u.email);
      toast.info(`Sent a new sign-in link to ${u.email}`);
    } catch {
      toast.error(`Couldn't send a sign-in link to ${u.email}. Try again.`);
    }
  }

  const goBuySlots = () => navigation.navigate("Billing", { screen: "SchoolBillingHome" });
  const s = search.trim().toLowerCase();
  const items = (q.data?.items ?? []).filter((u) => !s || u.name.toLowerCase().includes(s) || u.email.includes(s));

  const header = (
    <View>
      <PageHeader
        title="People"
        description="Add teachers here; they get an email to set their password. Students create their own accounts in the app and join with a class code."
        action={
          <Pressable style={styles.primarySm} onPress={() => setAdding(true)} accessibilityRole="button">
            <Text style={styles.primarySmText}>+ Add teacher</Text>
          </Pressable>
        }
      />
      {billing.isError ? (
        <ErrorState error={billing.error} retry={billing.refetch} />
      ) : seats ? (
        seats.available ? (
          <View style={styles.info}><Text style={text.body}>{seats.used} of {seats.total} teacher slots in use. {seats.available} left.</Text></View>
        ) : (
          <View style={styles.warn}>
            <Text style={styles.warnTitle}>All teacher slots are in use</Text>
            <Text style={text.body}>
              Your school has {seats.total} teacher slots and all are taken. Add {PLANS.seatPackSize} more for {formatPeso(PLANS.seatPackPriceCentavos)} (one-time), or remove a teacher.
            </Text>
            <Pressable style={[styles.primarySm, { alignSelf: "flex-start", marginTop: spacing.sm }]} onPress={goBuySlots} accessibilityRole="button">
              <Text style={styles.primarySmText}>Buy teacher slots</Text>
            </Pressable>
          </View>
        )
      ) : null}

      <View style={styles.segment} accessibilityRole="tablist">
        {TABS.map((t) => (
          <Pressable key={t.value} onPress={() => setTab(t.value)} style={[styles.segBtn, tab === t.value && styles.segOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === t.value }}>
            <Text style={[styles.segText, tab === t.value && styles.segTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.search}
        placeholder="Name or email"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search"
        placeholderTextColor={colors.ink2}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      {q.isPending ? (
        <View style={styles.pad}>{header}<Loading /></View>
      ) : q.isError ? (
        <View style={styles.pad}>{header}<ErrorState error={q.error} retry={q.refetch} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(u) => u.uid}
          contentContainerStyle={styles.pad}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { void q.refetch(); void billing.refetch(); }} />}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              action={tab === "teacher" && !search ? (
                <Pressable style={styles.primarySm} onPress={() => setAdding(true)} accessibilityRole="button"><Text style={styles.primarySmText}>Add teacher</Text></Pressable>
              ) : undefined}
            >
              {search ? "No one matches that search." : tab === "teacher" ? "No teachers yet. Add a teacher so they can run classes." : "No students yet. Share a class code: students sign up in the app and join with it."}
            </EmptyState>
          }
          renderItem={({ item: u }) => (
            <View style={styles.row}>
              <View style={styles.rowTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{u.name}</Text>
                  <Text style={text.small}>{u.email}</Text>
                </View>
                {u.disabled ? <Badge>Removed</Badge> : u.privacyConsentAt ? <Badge tone="success">Active</Badge> : <Badge tone="info">Invited</Badge>}
              </View>
              <Text style={[text.small, { marginTop: spacing.xs }]}>Added {formatDate(u.createdAt)}</Text>
              {!u.disabled ? (
                <View style={styles.actions}>
                  <Pressable style={styles.ghost} onPress={() => setEditing(u)} accessibilityRole="button" accessibilityLabel={`Edit ${u.name}`}>
                    <Text style={styles.ghostText}>Edit</Text>
                  </Pressable>
                  {!u.privacyConsentAt ? (
                    <Pressable style={styles.ghost} onPress={() => void resendInvite(u)} accessibilityRole="button" accessibilityLabel={`Resend invite to ${u.name}`}>
                      <Text style={styles.ghostText}>Resend invite</Text>
                    </Pressable>
                  ) : null}
                  <Pressable style={styles.ghost} onPress={() => setRemoving(u)} accessibilityRole="button" accessibilityLabel={`Remove ${u.name}`}>
                    <Text style={[styles.ghostText, { color: colors.shu }]}>Remove</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
        />
      )}

      <AddTeacherDialog open={adding} onClose={() => setAdding(false)} schoolId={schoolId} onBuySlots={() => { setAdding(false); goBuySlots(); }} />
      {editing ? <EditPersonDialog person={editing} onClose={() => setEditing(null)} /> : null}

      <Sheet open={!!removing} onClose={() => !remove.isPending && setRemoving(null)} title={`Remove ${removing?.name ?? ""}?`}>
        <Text style={text.body}>They won't be able to sign in, and they'll leave their classes. Removing a teacher frees their slot. Past results and attendance stay in your reports.</Text>
        <View style={styles.sheetActions}>
          <Pressable style={[styles.btn, styles.btnSecondary]} onPress={() => setRemoving(null)} disabled={remove.isPending} accessibilityRole="button">
            <Text style={styles.btnSecondaryText}>Cancel</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnDanger, remove.isPending && styles.busy]} onPress={() => removing && remove.mutate(removing.uid)} disabled={remove.isPending} accessibilityRole="button">
            {remove.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Remove</Text>}
          </Pressable>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

function AddTeacherDialog({ open, onClose, schoolId, onBuySlots }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
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

  async function submit() {
    setBusy(true);
    setErrors({});
    setFormError(null);
    setNoSlots(false);
    try {
      const res = await api(`/schools/${schoolId}/users`, { body: { name, email } });
      void qc.invalidateQueries({ queryKey: ["school-users"] });
      void qc.invalidateQueries({ queryKey: ["billing"] });
      // Decision 2: right after the API creates the account, send the set-password email.
      let emailed = true;
      if (res.sendPasswordReset) emailed = await sendPasswordResetEmail(auth, res.user.email).then(() => true, () => false);
      if (emailed) toast.success(`Added ${res.user.name}. We emailed them a link to set a password.`);
      else toast.error(`Added ${res.user.name}, but the set-password email didn't send. Use Resend invite.`);
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
    <Sheet open={open} onClose={() => !busy && close()} title="Add teacher">
      {formError ? <View style={styles.alert}><Text style={styles.alertText}>{formError}</Text></View> : null}
      <Text style={styles.label}>Name</Text>
      <TextInput style={[styles.input, errors.name && styles.inputError]} value={name} onChangeText={setName} editable={!busy} accessibilityLabel="Name" autoComplete="name" />
      {errors.name ? <Text style={styles.err}>{errors.name}</Text> : null}
      <Text style={styles.label}>Email</Text>
      <TextInput
        style={[styles.input, errors.email && styles.inputError]}
        value={email}
        onChangeText={setEmail}
        editable={!busy}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        accessibilityLabel="Email"
        autoComplete="email"
      />
      {errors.email ? <Text style={styles.err}>{errors.email}</Text> : null}
      <Text style={[text.small, { marginTop: spacing.sm }]}>Your first {PLANS.freeTeacherSeats} teachers are free. Students don't need to be added: they sign up in the app.</Text>
      <View style={styles.sheetActions}>
        <Pressable style={[styles.btn, styles.btnSecondary]} onPress={close} disabled={busy} accessibilityRole="button">
          <Text style={styles.btnSecondaryText}>Cancel</Text>
        </Pressable>
        {noSlots ? (
          <Pressable style={styles.btn} onPress={onBuySlots} accessibilityRole="button">
            <Text style={styles.btnText}>Buy teacher slots</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.btn, busy && styles.busy]} onPress={submit} disabled={busy} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Add teacher</Text>}
          </Pressable>
        )}
      </View>
    </Sheet>
  );
}

function EditPersonDialog({ person, onClose }) {
  const [name, setName] = useState(person.name);
  const [error, setError] = useState(null);
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => api(`/users/${person.uid}`, { method: "PATCH", body: { name } }),
    onSuccess: () => {
      toast.success("Saved");
      void qc.invalidateQueries({ queryKey: ["school-users"] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  return (
    <Sheet open onClose={() => !save.isPending && onClose()} title={`Edit ${person.name}`}>
      {error ? <View style={styles.alert}><Text style={styles.alertText}>{error}</Text></View> : null}
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} editable={!save.isPending} accessibilityLabel="Name" />
      <View style={styles.sheetActions}>
        <Pressable style={[styles.btn, styles.btnSecondary]} onPress={onClose} disabled={save.isPending} accessibilityRole="button">
          <Text style={styles.btnSecondaryText}>Cancel</Text>
        </Pressable>
        <Pressable style={[styles.btn, save.isPending && styles.busy]} onPress={() => save.mutate()} disabled={save.isPending} accessibilityRole="button">
          {save.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save</Text>}
        </Pressable>
      </View>
    </Sheet>
  );
}

/** Bottom sheet used for the dialogs (web: Dialog). */
function Sheet({ open, onClose, title, children }) {
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetBack} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.sheetTitle}>{title}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  pad: { padding: spacing.lg, paddingBottom: spacing.xxl },
  primarySm: { backgroundColor: colors.ai, paddingHorizontal: spacing.md, borderRadius: 8, minHeight: 40, justifyContent: "center" },
  primarySmText: { ...text.button, fontSize: 14 },
  info: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md, marginBottom: spacing.md },
  warn: { backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a", borderRadius: 10, padding: spacing.md, marginBottom: spacing.md },
  warnTitle: { ...text.body, fontWeight: "600", marginBottom: spacing.xs },
  segment: { flexDirection: "row", backgroundColor: colors.paper, borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: 4, marginBottom: spacing.sm },
  segBtn: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  segOn: { backgroundColor: colors.ai },
  segText: { color: colors.ink2, fontWeight: "600" },
  segTextOn: { color: colors.paper },
  search: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, minHeight: 44, fontSize: 16, color: colors.ink, marginBottom: spacing.md },
  row: { backgroundColor: colors.paper, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.line },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  rowName: { ...text.body, fontWeight: "600" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.xs },
  ghost: { minHeight: 44, justifyContent: "center" },
  ghostText: { color: colors.ai, fontWeight: "600" },
  sheetBack: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: spacing.lg, paddingBottom: spacing.xxl },
  sheetTitle: { ...text.h2, marginBottom: spacing.md },
  sheetActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  btn: { flex: 1, backgroundColor: colors.ai, minHeight: 48, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  btnText: { ...text.button },
  btnSecondary: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  btnSecondaryText: { color: colors.ink, fontWeight: "600", fontSize: 16 },
  btnDanger: { backgroundColor: colors.shu },
  busy: { opacity: 0.6 },
  label: { ...text.small, color: colors.ink, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md, fontSize: 16, backgroundColor: colors.paper },
  inputError: { borderColor: colors.shu },
  err: { color: colors.shu, marginTop: spacing.xs, fontSize: 13 },
  alert: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
  alertText: { color: colors.shu },
});
