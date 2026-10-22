import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { Button, PageHeader, Panel, SectionTitle, TextField, useToast } from "../../components/ui";
import { TimeZoneSelect } from "../../pages/common/ProfilePage";
import { GoogleConnectionCard } from "../../features/live/GoogleConnectionCard";

/** School details and time zone (§12 School Admin settings). */
export function SchoolSettingsPage() {
  const me = useMe();
  const school = me.school!;
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(school.name);
  const [timeZone, setTimeZone] = useState(school.timeZone);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api(`/schools/${school.id}`, {
        method: "PATCH",
        body: { name, timeZone },
      });
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
      <PageHeader title="Settings" description="School details and scheduling time zone." />
      <GoogleConnectionCard />
      <form onSubmit={save} className="flex max-w-2xl flex-col gap-6">
        <Panel className="px-5 py-5">
          <SectionTitle>School</SectionTitle>
          <div className="flex flex-col gap-4">
            <TextField label="School name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required />
            <TimeZoneSelect value={timeZone} onChange={setTimeZone} hint="Live classes are scheduled in this time zone. Students see times in their own zone." />
          </div>
        </Panel>
        <div>
          <Button type="submit" loading={busy}>
            Save settings
          </Button>
        </div>
      </form>
    </>
  );
}
