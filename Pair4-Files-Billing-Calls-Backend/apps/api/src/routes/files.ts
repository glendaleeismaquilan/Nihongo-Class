import { Router, type Response } from "express";
import { col } from "../db";
import { toAuthedUser, type AuthedUser } from "../lib/auth";
import { ApiError, forbidden, notFound } from "../lib/errors";
import { contentDisposition } from "../lib/http";
import { limiter } from "../lib/rateLimit";
import { openObject } from "../lib/storage";
import { verifyTicket, type TicketPayload } from "../lib/tickets";
import { params } from "../lib/validate";
import { logger } from "../logger";
import { assertMaterialAccess } from "./materials";


export const filesRouter = Router();

async function resolve(user: AuthedUser, p: TicketPayload): Promise<{ path: string; name: string; mime: string }> {
  if (p.k === "material") {
    const m = (await col.materials().doc(p.m).get()).data();
    if (!m) throw notFound("This file no longer exists.");
    // Re-check that the ticket's user still has access (FR-3.12.9).
    await assertMaterialAccess(user, m);
    const att = m.attachments.find((a) => a.id === p.a && a.kind === "file");
    if (!att?.storagePath) throw notFound("This file no longer exists.");
    return { path: att.storagePath, name: att.name, mime: att.mimeType ?? "application/octet-stream" };
  }
  // My Drive files are private to their owner.
  const item = (await col.driveItems().doc(p.m).get()).data();
  if (!item || item.kind !== "file" || !item.storagePath) throw notFound("This file no longer exists.");
  if (item.ownerUid !== user.uid) throw forbidden("You don't have access to this file.");
  return { path: item.storagePath, name: item.name, mime: item.mimeType ?? "application/octet-stream" };
}

function deny(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

/**
 * FR-3.12.9: public, ticket-checked. Verifies the signature and expiry,
 * re-checks access, and streams the object with the right Content-Type and
 * Content-Disposition. Lets <iframe> and <img> load files without an auth header.
 */
filesRouter.get("/files/:ticket", limiter("file-download", 300), async (req, res) => {
  const check = verifyTicket(params(req).ticket);
  if (!check.ok) {
    deny(res, 403, check.reason === "expired" ? "ticket_expired" : "ticket_invalid", check.reason === "expired" ? "This link has expired. Open the file again from the app." : "This link isn't valid.");
    return;
  }
  const p = check.payload;
  const snap = await col.users().doc(p.u).get();
  if (!snap.exists || snap.data()!.disabled) {
    deny(res, 403, "forbidden", "You don't have access to this file.");
    return;
  }
  let file: { path: string; name: string; mime: string };
  try {
    file = await resolve(toAuthedUser(p.u, snap.data()!), p);
  } catch (err) {
    if (err instanceof ApiError) {
      deny(res, err.status === 404 ? 404 : 403, err.status === 404 ? "not_found" : "forbidden", err.status === 404 ? err.message : "You don't have access to this file.");
      return;
    }
    throw err;
  }
  const object = await openObject(file.path);
  if (!object) {
    deny(res, 404, "not_found", "This file no longer exists.");
    return;
  }
  // The web app embeds previews from another origin: allow cross-origin
  // loading and framing, and never let the browser sniff the type (§14).
  res.removeHeader("X-Frame-Options");
  res.removeHeader("Content-Security-Policy");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Content-Type", file.mime);
  res.setHeader("Content-Disposition", contentDisposition(p.d, file.name));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  if (object.size) res.setHeader("Content-Length", String(object.size));
  object.stream
    .on("error", (err) => {
      logger.error({ err, path: file.path }, "file stream failed");
      if (!res.headersSent) deny(res, 500, "internal", "Couldn't load the file. Try again.");
      else res.destroy(err);
    })
    .pipe(res);
});

