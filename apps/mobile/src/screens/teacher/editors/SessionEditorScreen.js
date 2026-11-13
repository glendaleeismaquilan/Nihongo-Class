// Schedule or edit a live class — web: SessionDialog in features/live/StaffLiveTab.tsx
// (FR-3.11.2 to FR-3.11.4). Date and start time are in the school's time zone
// (me.school.timeZone), as the API reads them. With Google connected the Meet
// link can be made automatically; otherwise (or when Google fails) a pasted link.
// Route params: { classId, session? }.
import { useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "../../../lib/api";
import { DEFAULT_TIME_ZONE, LIMITS, MEET_URL_PATTERN } from "../../../shared/constants";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../components/Toast";
import { classKeys } from "../classHooks";
import { dateKey, timeKey } from "../../../shared/time";
import { Button, Check, Field, Header, InlineAlert, Picker, Radio, ui } from "../ui";
import { colors, spacing, text } from "../../../styles/theme";

const DURATIONS = [30, 45, 60, 75, 90, 120, 150, 180];
const durationLabel = (d) => (d < 60 ? `${d} minutes` : `${Math.floor(d / 60)} hour${d >= 120 ? "s" : ""}${d % 60 ? ` ${d % 60} minutes` : ""}`);

export function SessionEditorScreen({ route, navigation }) {
  const { classId, session } = route.params ?? {};
  const { me } = useAuth();
  const tz = me?.school?.timeZone ?? DEFAULT_TIME_ZONE;
  const googleReady = me?.google?.status === "connected";
  const editing = !!session;
  const [v, setV] = useState(() => {
    const start = session ? new Date(session.startAt) : new Date(Date.now() + 86_400_000);
    return {
      title: session?.title ?? "",
      description: session?.description ?? "",
      date: dateKey(start, tz),
      startTime: session ? timeKey(start, tz) : "09:00",
      durationMinutes: session ? Math.round((new Date(session.endAt).getTime() - start.getTime()) / 60_000) : 60,
      repeat: false,
      repeatWeeks: 4,
      inviteStudents: session?.inviteStudents ?? false,
      useGoogle: googleReady,
      meetUrl: session?.provider === "manual" ? (session.meetUrl ?? "") : "",
    };
  });
  const [weeksText, setWeeksText] = useState("4");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [needLink, setNeedLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const set = (k, val) => setV((s0) => ({ ...s0, [k]: val }));
  const showLink = editing ? session.provider === "manual" : !v.useGoogle || !googleReady || !!needLink;

  async function submit() {
    const errs = {};
    if (!v.title.trim()) errs.title = "Enter a title.";
    // The web form uses date and time pickers; here they are typed, so check the format first.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) errs.date = "Use YYYY-MM-DD";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.startTime)) errs.startTime = "Use HH:mm";
    if (showLink && !MEET_URL_PATTERN.test(v.meetUrl.trim())) errs.meetUrl = "Paste a Google Meet link that starts with https://meet.google.com/";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        await api(`/sessions/${session.id}`, {
          method: "PATCH",
          body: {
            title: v.title,
            description: v.description,
            date: v.date,
            startTime: v.startTime,
            durationMinutes: v.durationMinutes,
            ...(session.provider === "google" ? { inviteStudents: v.inviteStudents } : { meetUrl: v.meetUrl.trim() }),
          },
        });
        toast.success("Saved. Students were notified.");
      } else {
        const res = await api(`/classes/${classId}/sessions`, {
          body: {
            title: v.title,
            description: v.description || undefined,
            date: v.date,
            startTime: v.startTime,
            durationMinutes: v.durationMinutes,
            repeatWeeks: v.repeat ? v.repeatWeeks : 1,
            inviteStudents: v.useGoogle && googleReady && !needLink ? v.inviteStudents : false,
            useGoogle: v.useGoogle && googleReady && !needLink,
            ...(showLink ? { meetUrl: v.meetUrl.trim() } : {}),
          },
        });
        const done = res.items.length > 1 ? `Scheduled ${res.items.length} live classes` : "Live class scheduled";
        // One toast at a time on the phone: the fallback notice rides along.
        if (res.notice) toast.info(`${done}. ${res.notice}`);
        else toast.success(done);
      }
      await qc.invalidateQueries({ queryKey: classKeys.sessions(classId) });
      navigation.goBack();
    } catch (err) {
      if (err instanceof ApiError && err.code === "meet_link_required") {
        // FR-3.11.4: explain why the automatic link wasn't created.
        setNeedLink(err.message);
        void qc.invalidateQueries({ queryKey: ["me"] });
      } else if (err instanceof ApiError && err.code === "validation_error") setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  const durations = [...new Set([...DURATIONS, v.durationMinutes])].sort((a, b) => a - b);
  return (
    <SafeAreaView style={ui.root} edges={["top"]}>
      <Header title={editing ? "Edit live class" : "Schedule a live class"} onBack={() => navigation.goBack()} backLabel="Live classes" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled">
          {formError ? <InlineAlert tone="danger">{formError}</InlineAlert> : null}
          {needLink ? <InlineAlert tone="danger">{needLink}</InlineAlert> : null}
          <Field label="Title" placeholder="Saturday class: Lesson 3" value={v.title} onChangeText={(x) => set("title", x)} error={errors.title} />
          <View style={s.two}>
            <Field label="Date" placeholder="YYYY-MM-DD" value={v.date} onChangeText={(x) => set("date", x.trim())} error={errors.date} keyboardType="numbers-and-punctuation" style={{ flex: 1 }} />
            <Field label="Start time" placeholder="HH:mm" hint="24-hour" value={v.startTime} onChangeText={(x) => set("startTime", x.trim())} error={errors.startTime} keyboardType="numbers-and-punctuation" style={{ flex: 1 }} />
          </View>
          <Picker label="Duration" value={v.durationMinutes} onChange={(d) => set("durationMinutes", d)} options={durations.map((d) => ({ value: d, label: durationLabel(d) }))} error={errors.durationMinutes} />
          <Text style={[text.small, { marginTop: spacing.sm }]}>
            Times are in the school's time zone, {tz.replace(/_/g, " ")}. Students see them in their own zone.
          </Text>
          <Field label="Description" value={v.description} onChangeText={(x) => set("description", x)} multiline error={errors.description} />
          {!editing ? (
            <View style={{ marginTop: spacing.md }}>
              <Check label="Repeat weekly" checked={v.repeat} onChange={(on) => set("repeat", on)} />
              {v.repeat ? (
                <Field
                  label="Number of weeks"
                  keyboardType="number-pad"
                  value={weeksText}
                  onChangeText={(x) => {
                    setWeeksText(x);
                    set("repeatWeeks", Math.max(1, Math.min(LIMITS.maxRepeatWeeks, Number(x) || 1)));
                  }}
                  onBlur={() => setWeeksText(String(v.repeatWeeks))}
                  hint={`1 to ${LIMITS.maxRepeatWeeks} weeks.`}
                  error={errors.repeatWeeks}
                />
              ) : null}
            </View>
          ) : null}
          {!editing && googleReady && !needLink ? (
            <View style={{ marginTop: spacing.md }} accessibilityRole="radiogroup" accessibilityLabel="Meet link">
              <Text style={s.legend}>Meet link</Text>
              <Radio label={`Create a Meet link automatically with ${me.google.googleEmail}`} selected={v.useGoogle} onPress={() => set("useGoogle", true)} />
              <Radio label="Paste a Meet link" selected={!v.useGoogle} onPress={() => set("useGoogle", false)} />
            </View>
          ) : null}
          {!editing && !googleReady && !needLink ? (
            <InlineAlert>
              {`${me?.google?.status === "needs_reconnect" ? "Your Google connection has expired" : "Your Google account isn't connected"}, so paste a Google Meet link. Connect Google in Settings to create links automatically.`}
            </InlineAlert>
          ) : null}
          {showLink ? (
            <Field
              label="Google Meet link"
              placeholder="https://meet.google.com/abc-defg-hij"
              value={v.meetUrl}
              onChangeText={(x) => set("meetUrl", x)}
              error={errors.meetUrl}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : null}
          {(!editing && v.useGoogle && googleReady && !needLink) || (editing && session.provider === "google") ? (
            <View style={{ marginTop: spacing.md }}>
              <Check
                label="Send calendar invites to students"
                hint="Every enrolled student is added as a guest; students who join later are added too."
                checked={v.inviteStudents}
                onChange={(on) => set("inviteStudents", on)}
              />
            </View>
          ) : null}
        </ScrollView>
        <View style={s.bar}>
          <Button variant="secondary" onPress={() => navigation.goBack()} disabled={busy}>Cancel</Button>
          <Button onPress={submit} loading={busy}>{editing ? "Save changes" : "Schedule"}</Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  two: { flexDirection: "row", gap: spacing.sm },
  legend: { fontSize: 14, fontWeight: "500", color: colors.ink, marginBottom: spacing.xs },
  bar: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.kasumi },
});
