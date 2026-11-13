// Client-side protection against brute-force sign-in. Tracks failed attempts per email
// in AsyncStorage: 5 wrong passwords within the window locks the form for 5 minutes.
// Successful sign-in clears the counter. Firebase Auth has its own server-side limits
// too; this just surfaces a clearer, faster message before Firebase's generic one kicks in.
import AsyncStorage from "@react-native-async-storage/async-storage";

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;

const key = (email) => `login-lockout:${(email || "").toLowerCase().trim()}`;

export async function checkLockout(email) {
  if (!email) return null;
  try {
    const raw = await AsyncStorage.getItem(key(email));
    if (!raw) return null;
    const { count, firstAt } = JSON.parse(raw);
    if (!count || count < MAX_ATTEMPTS) return null;
    const until = firstAt + LOCK_MS;
    if (Date.now() >= until) {
      await AsyncStorage.removeItem(key(email));
      return null;
    }
    return { until, msLeft: until - Date.now() };
  } catch {
    return null;
  }
}

export async function recordFailure(email) {
  if (!email) return null;
  try {
    const raw = await AsyncStorage.getItem(key(email));
    const prev = raw ? JSON.parse(raw) : null;
    const now = Date.now();
    const withinWindow = prev && prev.firstAt && now - prev.firstAt < LOCK_MS;
    const next = withinWindow
      ? { count: (prev.count ?? 0) + 1, firstAt: prev.firstAt }
      : { count: 1, firstAt: now };
    await AsyncStorage.setItem(key(email), JSON.stringify(next));
    if (next.count >= MAX_ATTEMPTS) return { until: next.firstAt + LOCK_MS, msLeft: next.firstAt + LOCK_MS - now };
    return null;
  } catch {
    return null;
  }
}

export async function clearFailures(email) {
  if (!email) return;
  try { await AsyncStorage.removeItem(key(email)); } catch {}
}

export function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
