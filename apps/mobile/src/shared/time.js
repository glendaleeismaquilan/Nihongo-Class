// Copy of packages/shared/src/time.ts (an EAS build uploads only apps/mobile, so
// the app can't import @nihongo/shared). packages/shared/test/mobile-mirror.test.ts
// fails when the two give different answers.
//
// One deliberate difference: zonedParts reads hour "24" as 0. Some engines print
// midnight as "24" even with hourCycle h23; V8 (web, API) never does, so the
// results match there, and a phone engine that does can't shift a time by a day.
const dtfCache = new Map();

function partsFormatter(timeZone) {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(date, timeZone) {
  const p = {};
  for (const part of partsFormatter(timeZone).formatToParts(date)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: p.weekday,
  };
}

function offsetMs(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts a wall-clock date and time in `timeZone` to a UTC instant (§14 Time). */
export function zonedTimeToUtc(date, time, timeZone) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = offsetMs(new Date(guess), timeZone);
  let result = guess - first;
  const second = offsetMs(new Date(result), timeZone);
  if (second !== first) result = guess - second;
  return new Date(result);
}

const pad = (n) => String(n).padStart(2, "0");

/** Calendar day (YYYY-MM-DD) of `date` in `timeZone`. Decision 5. */
export function dateKey(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Wall-clock HH:mm of `date` in `timeZone`. */
export function timeKey(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function addDaysToKey(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * Decision 5: consecutive calendar days with at least one graded attempt.
 * The streak ends today, or yesterday when nothing has been graded yet today
 * (the streak isn't broken until a whole day passes without study).
 */
export function computeStreak(dayKeys, todayKey) {
  const days = new Set(dayKeys);
  let cursor = days.has(todayKey) ? todayKey : addDaysToKey(todayKey, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDaysToKey(cursor, -1);
  }
  return streak;
}
