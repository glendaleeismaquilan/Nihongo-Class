import { env, googleConfigured } from "../env";

export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];
const TIMEOUT_MS = 10_000;

export interface EventInput {
  /** Our own id (lowercase hex UUID without dashes, valid base32hex) so a retried insert returns 409. */
  id?: string;
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees?: { email: string }[];
}

export interface CreatedEvent {
  id: string;
  meetUrl: string | null;
  pending: boolean;
}

/** Google said the refresh token is no longer valid (FR-3.11.4). */
export class GoogleReconnectError extends Error {
  constructor() {
    super("invalid_grant");
  }
}

export interface CalendarProvider {
  authUrl(state: string): Promise<string>;
  exchangeCode(code: string): Promise<{ refreshToken: string; email: string; scopes: string[] }>;
  revoke(refreshToken: string): Promise<void>;
  insert(refreshToken: string, event: EventInput, sendUpdates: "all" | "none"): Promise<CreatedEvent>;
  get(refreshToken: string, eventId: string): Promise<CreatedEvent>;
  patch(refreshToken: string, eventId: string, event: Partial<EventInput>, sendUpdates: "all" | "none"): Promise<void>;
  remove(refreshToken: string, eventId: string, sendUpdates: "all" | "none"): Promise<void>;
}

function isInvalidGrant(err: unknown) {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error === "invalid_grant" || /invalid_grant/.test(e?.message ?? "");
}

function readEvent(data: { id?: string | null; hangoutLink?: string | null; conferenceData?: { createRequest?: { status?: { statusCode?: string | null } | null } | null; entryPoints?: { entryPointType?: string | null; uri?: string | null }[] | null } | null }): CreatedEvent {
  const video = data.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null;
  return {
    id: data.id ?? "",
    meetUrl: data.hangoutLink ?? video,
    pending: data.conferenceData?.createRequest?.status?.statusCode === "pending",
  };
}

/** Real Google Calendar v3 through googleapis, loaded on first use. */
function googleProvider(): CalendarProvider {
  const lib = () => import("googleapis").then((m) => m.google);
  const oauth = async () => {
    const google = await lib();
    return new google.auth.OAuth2(env.GOOGLE_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_SECRET, env.GOOGLE_OAUTH_REDIRECT_URI);
  };
  const calendarFor = async (refreshToken: string) => {
    const google = await lib();
    const client = await oauth();
    client.setCredentials({ refresh_token: refreshToken });
    return google.calendar({ version: "v3", auth: client, timeout: TIMEOUT_MS });
  };
  const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      if (isInvalidGrant(err)) throw new GoogleReconnectError();
      throw err;
    }
  };
  return {
    async authUrl(state) {
      return (await oauth()).generateAuthUrl({ access_type: "offline", prompt: "consent", scope: GOOGLE_SCOPES, state, include_granted_scopes: true });
    },
    async exchangeCode(code) {
      const client = await oauth();
      const { tokens } = await client.getToken(code);
      if (!tokens.refresh_token) throw new Error("Google didn't return a refresh token");
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token!, audience: env.GOOGLE_OAUTH_CLIENT_ID });
      return { refreshToken: tokens.refresh_token, email: ticket.getPayload()?.email ?? "", scopes: (tokens.scope ?? "").split(" ").filter(Boolean) };
    },
    async revoke(refreshToken) {
      const client = await oauth();
      await client.revokeToken(refreshToken).catch(() => undefined);
    },
    insert: (refreshToken, event, sendUpdates) =>
      guard(async () => {
        const cal = await calendarFor(refreshToken);
        const res = await cal.events.insert({
          calendarId: "primary",
          conferenceDataVersion: 1,
          sendUpdates,
          requestBody: {
            ...event,
            conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
          },
        });
        return readEvent(res.data);
      }),
    get: (refreshToken, eventId) =>
      guard(async () => {
        const cal = await calendarFor(refreshToken);
        return readEvent((await cal.events.get({ calendarId: "primary", eventId })).data);
      }),
    patch: (refreshToken, eventId, event, sendUpdates) =>
      guard(async () => {
        const cal = await calendarFor(refreshToken);
        await cal.events.patch({ calendarId: "primary", eventId, conferenceDataVersion: 1, sendUpdates, requestBody: event });
      }),
    remove: (refreshToken, eventId, sendUpdates) =>
      guard(async () => {
        const cal = await calendarFor(refreshToken);
        await cal.events.delete({ calendarId: "primary", eventId, sendUpdates }).catch((err: { code?: number }) => {
          if (err?.code !== 404 && err?.code !== 410) throw err;
        });
      }),
  };
}

let provider: CalendarProvider | null = null;

export function calendar(): CalendarProvider | null {
  if (!googleConfigured) return null;
  provider ??= googleProvider();
  return provider;
}

/** Tests replace the Google provider with a fake. */
export function setCalendarProvider(p: CalendarProvider | null) {
  provider = p;
}
