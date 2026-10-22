import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dateKey, timeKey, type LiveSessionDto } from "@nihongo/shared";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { formatDateTime, formatTime } from "../../lib/format";
import { Alert, Badge, Button, ButtonAnchor, Checkbox, DataTable, Dialog, EmptyState, ErrorState, Loading, SectionTitle, SelectField, TextArea, TextField, useToast } from "../../components/ui";
import { useWorkspace } from "../classes/ClassWorkspace";
import { useClassSessions } from "../materials/materialsApi";

const DURATIONS = [30, 45, 60, 75, 90, 120, 150, 180];

function statusBadge(s: LiveSessionDto) {
  if (s.status === "cancelled") return <Badge>Cancelled</Badge>;
  if (s.status === "completed") return <Badge tone="success">Finished</Badge>;
  return <Badge tone="info">Scheduled</Badge>;
}

/** FR-3.11.2 to FR-3.11.4: schedule with an automatic Meet link, or a pasted one. */
function SessionDialog({ session, onClose }: { session?: LiveSessionDto | null; onClose: () => void }) {
  const { cls } = useWorkspace();
  const me = useMe();
  const tz = me.school?.timeZone ?? "Asia/Manila";
  const googleReady = me.google?.status === "connected";
  const editing = !!session;
  const start = session ? new Date(session.startAt) : new Date(Date.now() + 86_400_000);
  const [v, setV] = useState({
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
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [needLink, setNeedLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));
  const showLink = editing ? session!.provider === "manual" : !v.useGoogle || !googleReady || !!needLink;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!v.title.trim()) errs.title = "Enter a title.";
    if (showLink && !/^https:\/\/meet\.google\.com\/[A-Za-z0-9-]+/.test(v.meetUrl.trim())) errs.meetUrl = "Paste a Google Meet link that starts with https://meet.google.com/";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        await api(`/sessions/${session!.id}`, {
          method: "PATCH",
          body: { title: v.title, description: v.description, date: v.date, startTime: v.startTime, durationMinutes: v.durationMinutes, ...(session!.provider === "google" ? { inviteStudents: v.inviteStudents } : { meetUrl: v.meetUrl.trim() }) },
        });
        toast("Saved. Students were notified.");
      } else {
        const res = await api<{ items: LiveSessionDto[]; notice: string | null }>(`/classes/${cls.id}/sessions`, {
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
        toast(res.items.length > 1 ? `Scheduled ${res.items.length} live classes` : "Live class scheduled");
        if (res.notice) toast(res.notice, "info");
      }
      await qc.invalidateQueries({ queryKey: ["class", cls.id, "sessions"] });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "meet_link_required") {
        // FR-3.11.4: explain why the automatic link wasn't created.
        setNeedLink(err.message);
        void qc.invalidateQueries({ queryKey: ["me"] });
      } else if (err instanceof ApiError && err.code === "validation_error") setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={editing ? "Edit live class" : "Schedule a live class"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="session-form" loading={busy}>
            {editing ? "Save changes" : "Schedule"}
          </Button>
        </>
      }
    >
      <form id="session-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        {needLink ? <Alert tone="danger">{needLink}</Alert> : null}
        <TextField label="Title" placeholder="Saturday class: Lesson 3" value={v.title} onChange={(e) => set("title", e.target.value)} error={errors.title} required />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Date" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} error={errors.date} required />
          <TextField label="Start time" type="time" value={v.startTime} onChange={(e) => set("startTime", e.target.value)} error={errors.startTime} required />
          <SelectField label="Duration" value={v.durationMinutes} onChange={(e) => set("durationMinutes", Number(e.target.value))}>
            {[...new Set([...DURATIONS, v.durationMinutes])].sort((a, b) => a - b).map((d) => (
              <option key={d} value={d}>
                {d < 60 ? `${d} minutes` : `${Math.floor(d / 60)} hour${d >= 120 ? "s" : ""}${d % 60 ? ` ${d % 60} minutes` : ""}`}
              </option>
            ))}
          </SelectField>
        </div>
        <p className="-mt-2 text-sm text-ink-2">Times are in the school's time zone, {tz.replace(/_/g, " ")}. Students see them in their own zone.</p>
        <TextArea label="Description" rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} />
        {!editing ? (
          <div className="flex flex-wrap items-end gap-3">
            <Checkbox label="Repeat weekly" checked={v.repeat} onChange={(e) => set("repeat", e.target.checked)} />
            {v.repeat ? <TextField className="w-40" label="Number of weeks" inputMode="numeric" value={String(v.repeatWeeks)} onChange={(e) => set("repeatWeeks", Math.max(1, Math.min(26, Number(e.target.value) || 1)))} /> : null}
          </div>
        ) : null}
        {!editing && googleReady && !needLink ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">Meet link</legend>
            <label className="flex min-h-11 items-center gap-3">
              <input type="radio" name="link-mode" checked={v.useGoogle} onChange={() => set("useGoogle", true)} className="h-5 w-5 accent-[var(--ai)]" />
              Create a Meet link automatically with {me.google?.googleEmail}
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input type="radio" name="link-mode" checked={!v.useGoogle} onChange={() => set("useGoogle", false)} className="h-5 w-5 accent-[var(--ai)]" />
              Paste a Meet link
            </label>
          </fieldset>
        ) : null}
        {!editing && !googleReady && !needLink ? (
          <Alert>
            {me.google?.status === "needs_reconnect" ? "Your Google connection has expired" : "Your Google account isn't connected"}, so paste a Google Meet link. Connect Google in Settings to create links automatically.
          </Alert>
        ) : null}
        {showLink ? <TextField label="Google Meet link" type="url" placeholder="https://meet.google.com/abc-defg-hij" value={v.meetUrl} onChange={(e) => set("meetUrl", e.target.value)} error={errors.meetUrl} required /> : null}
        {(!editing && v.useGoogle && googleReady && !needLink) || (editing && session!.provider === "google") ? (
          <Checkbox
            label="Send calendar invites to students"
            hint="Every enrolled student is added as a guest; students who join later are added too."
            checked={v.inviteStudents}
            onChange={(e) => set("inviteStudents", e.target.checked)}
          />
        ) : null}
      </form>
    </Dialog>
  );
}

export function StaffLiveTab() {
  const { cls, basePath, readOnly } = useWorkspace();
  const q = useClassSessions(cls.id);
  const [dialog, setDialog] = useState<LiveSessionDto | "new" | null>(null);
  const [cancelling, setCancelling] = useState<LiveSessionDto | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setCancelling(null);
      toast("Live class cancelled. Students were notified.");
      void qc.invalidateQueries({ queryKey: ["class", cls.id, "sessions"] });
    },
    onError: (err) => toast(errorMessage(err), "danger"),
  });

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const nowMs = Date.now();
  const upcoming = q.data.filter((s) => s.status === "scheduled" && new Date(s.endAt).getTime() > nowMs);
  const past = q.data.filter((s) => !upcoming.includes(s)).reverse();

  const table = (rows: LiveSessionDto[], label: string) => (
    <DataTable label={label}>
      <thead>
        <tr>
          <th scope="col">Live class</th>
          <th scope="col">When</th>
          <th scope="col">Host</th>
          <th scope="col">Link</th>
          <th scope="col">Status</th>
          <th scope="col">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.id}>
            <td className="font-medium">{s.title}</td>
            <td className="whitespace-nowrap">
              {formatDateTime(s.startAt, { withZone: false })} to {formatTime(s.endAt, { withZone: true })}
            </td>
            <td className="text-ink-2">{s.hostName}</td>
            <td className="whitespace-nowrap text-ink-2">
              {s.provider === "google" ? "Automatic Meet link" : "Pasted link"}
              {s.inviteStudents ? ", invites sent" : ""}
            </td>
            <td>{statusBadge(s)}</td>
            <td className="whitespace-nowrap text-right">
              {s.status === "scheduled" && s.meetUrl ? (
                <ButtonAnchor size="sm" variant="ghost" href={s.meetUrl} target="_blank" rel="noopener noreferrer" icon="video">
                  Open Meet
                </ButtonAnchor>
              ) : null}
              {s.status !== "cancelled" && new Date(s.startAt).getTime() - 15 * 60_000 < nowMs ? (
                <Link to={`${basePath}/live/${s.id}`} className="inline-flex min-h-11 items-center px-3 text-sm font-medium no-underline">
                  Attendance
                </Link>
              ) : null}
              {!readOnly && s.status === "scheduled" ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setDialog(s)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="text-shu" onClick={() => setCancelling(s)}>
                    Cancel
                  </Button>
                </>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );

  return (
    <>
      <div className="mb-4 flex justify-end">
        {!readOnly ? (
          <Button icon="plus" onClick={() => setDialog("new")}>
            Schedule live class
          </Button>
        ) : null}
      </div>
      <section className="mb-8">
        <SectionTitle>Upcoming</SectionTitle>
        {upcoming.length ? table(upcoming, "Upcoming live classes") : <EmptyState action={!readOnly ? <Button onClick={() => setDialog("new")}>Schedule live class</Button> : null}>No live classes scheduled. Schedule one and every enrolled student gets a Join button.</EmptyState>}
      </section>
      {past.length ? (
        <section>
          <SectionTitle>Past and cancelled</SectionTitle>
          {table(past, "Past and cancelled live classes")}
        </section>
      ) : null}
      {dialog ? <SessionDialog session={dialog === "new" ? null : dialog} onClose={() => setDialog(null)} /> : null}
      <Dialog
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title={`Cancel ${cancelling?.title ?? "live class"}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancelling && cancel.mutate(cancelling.id)}>
              Cancel live class
            </Button>
          </>
        }
      >
        <p>Students get a notification{cancelling?.inviteStudents ? " and the calendar invite is removed" : ""}. It stays in the list as cancelled.</p>
      </Dialog>
    </>
  );
}
