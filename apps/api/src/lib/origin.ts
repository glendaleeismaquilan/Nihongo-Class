import type { Request } from "express";

/**
 * The API's origin as this client reached it: localhost for the web app on the
 * same machine, the laptop's LAN address for a phone, or a proxy's https host.
 * Links the API hands back (file tickets) use it, because one configured URL
 * can't be right for every client. `trust proxy` is on, so a proxy's
 * X-Forwarded-Proto and X-Forwarded-Host are honoured.
 */
export function requestOrigin(req: Request): string {
  return `${req.protocol}://${req.host}`;
}
