// Mirror of apps/web/src/lib/format.ts so dates, sizes and money read the same on both.
export { formatPeso } from "../shared/money";

export const viewerTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila";

/** FR-3.11.7: times in the viewer's zone with the zone name shown. */
export function formatDateTime(iso, opts = {}) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: opts.timeZone,
    timeZoneName: opts.withZone === false ? undefined : "short",
  }).format(d);
}

export function formatTime(iso, opts = {}) {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: opts.timeZone,
    timeZoneName: opts.withZone ? "short" : undefined,
  }).format(new Date(iso));
}

export function formatDate(iso, opts = {}) {
  return new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric", timeZone: opts.timeZone }).format(new Date(iso));
}

export function formatRange(startIso, endIso) {
  const start = formatDateTime(startIso, { withZone: false });
  const end = formatTime(endIso, { withZone: true });
  return `${start} to ${end}`;
}

export function zoneLongName(timeZone = viewerTimeZone()) {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function formatBytes(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  const trim = (x) => x.toFixed(1).replace(/\.0$/, "");
  if (n < 1024 * 1024 * 1024) return `${trim(n / 1024 / 1024)} MB`;
  return `${trim(n / 1024 / 1024 / 1024)} GB`;
}

export function pct(n) {
  return n == null ? "No data" : `${Math.round(n)}%`;
}

export function relativeDay(iso) {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((new Date(d.toDateString()).getTime() - new Date(today.toDateString()).getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatDate(iso);
}
