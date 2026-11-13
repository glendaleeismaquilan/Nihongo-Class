// Same lockout logic as mobile, in localStorage. 5 failed attempts within 5 min → 5 min lockout.
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;

const key = (email: string) => `login-lockout:${(email || "").toLowerCase().trim()}`;

type Lock = { until: number; msLeft: number };

export function checkLockout(email: string): Lock | null {
  if (!email) return null;
  try {
    const raw = localStorage.getItem(key(email));
    if (!raw) return null;
    const { count, firstAt } = JSON.parse(raw) as { count: number; firstAt: number };
    if (!count || count < MAX_ATTEMPTS) return null;
    const until = firstAt + LOCK_MS;
    if (Date.now() >= until) {
      localStorage.removeItem(key(email));
      return null;
    }
    return { until, msLeft: until - Date.now() };
  } catch {
    return null;
  }
}

export function recordFailure(email: string): Lock | null {
  if (!email) return null;
  try {
    const raw = localStorage.getItem(key(email));
    const prev = raw ? (JSON.parse(raw) as { count: number; firstAt: number }) : null;
    const now = Date.now();
    const withinWindow = prev && prev.firstAt && now - prev.firstAt < LOCK_MS;
    const next = withinWindow
      ? { count: (prev!.count ?? 0) + 1, firstAt: prev!.firstAt }
      : { count: 1, firstAt: now };
    localStorage.setItem(key(email), JSON.stringify(next));
    if (next.count >= MAX_ATTEMPTS) return { until: next.firstAt + LOCK_MS, msLeft: next.firstAt + LOCK_MS - now };
    return null;
  } catch {
    return null;
  }
}

export function clearFailures(email: string) {
  if (!email) return;
  try { localStorage.removeItem(key(email)); } catch {}
}

export function formatCountdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
