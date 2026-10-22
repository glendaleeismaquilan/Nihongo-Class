import { useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sendPasswordResetEmail } from "firebase/auth";
import { JLPT_LEVELS, type JlptLevel } from "@nihongo/shared";
import { api, ApiError } from "../../lib/api";
import { auth } from "../../lib/firebase";
import { ROLE_LABEL, useAuth, useMe } from "../../lib/auth";
import { viewerTimeZone } from "../../lib/format";
import { Button, PageHeader, Panel, SelectField, TextField, useToast } from "../../components/ui";

const TIME_ZONES = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["Asia/Manila", "Asia/Tokyo", "Asia/Singapore", "UTC"];
  }
})();

export function TimeZoneSelect({ value, onChange, label = "Time zone", hint }: { value: string; onChange: (v: string) => void; label?: string; hint?: ReactNode }) {
  const zones = TIME_ZONES.includes(value) ? TIME_ZONES : [value, ...TIME_ZONES];
  return (
    <SelectField label={label} value={value} onChange={(e) => onChange(e.target.value)} hint={hint}>
      {zones.map((z) => (
        <option key={z} value={z}>
          {z.replace(/_/g, " ")}
        </option>
      ))}
    </SelectField>
  );
}

export function ProfilePage({ children }: { children?: ReactNode }) {
  const me = useMe();
  const { signOut } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(me.name);
  const [timeZone, setTimeZone] = useState(me.timeZone);
  const [studyLevel, setStudyLevel] = useState<JlptLevel | "">(me.studyLevel ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api("/me", { method: "PATCH", body: { name, timeZone, ...(me.role === "student" && studyLevel ? { studyLevel } : {}) } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast("Saved");
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      toast(err instanceof ApiError ? err.message : "Couldn't save. Try again.", "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Profile" description={`${ROLE_LABEL[me.role]}${me.school ? ` at ${me.school.name}` : ""}. Signed in as ${me.email}.`} />
      {children}
      <Panel className="max-w-xl px-5 py-5">
        <form onSubmit={save} className="flex flex-col gap-4">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required />
          {me.role === "student" ? (
            <SelectField label="Self-study level" value={studyLevel} onChange={(e) => setStudyLevel(e.target.value as JlptLevel)} hint="Self-Study shows built-in lessons for this JLPT level. Change it anytime.">
              {JLPT_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </SelectField>
          ) : null}
          <TimeZoneSelect value={timeZone} onChange={setTimeZone} hint={`Your device is set to ${viewerTimeZone().replace(/_/g, " ")}. Study streaks count days in this zone.`} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy}>
              Save
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                await sendPasswordResetEmail(auth, me.email).catch(() => undefined);
                toast("We sent you a link to change your password.", "info");
              }}
            >
              Change password
            </Button>
          </div>
        </form>
      </Panel>
      <Button variant="ghost" icon="logout" className="mt-6" onClick={() => void signOut()}>
        Sign out
      </Button>
    </>
  );
}
