import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { JlptLevel, Role } from "@nihongo/shared";
import { env } from "../env";
import { adminAuth } from "../firebase";
import { col, type UserDoc } from "../db";
import { forbidden, unauthorized } from "./errors";

export interface AuthedUser {
  uid: string;
  role: Role;
  name: string;
  email: string;
  schoolId: string | null;
  studyLevel: JlptLevel | null;
  timeZone: string;
  disabled: boolean;
  doc: UserDoc;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      firebase?: { uid: string; email: string | null };
      user?: AuthedUser;
    }
  }
}

async function verifyBearer(req: Request) {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) throw unauthorized();
  try {
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    throw unauthorized("Your session has expired. Sign in again.");
  }
}

/** Verifies the Firebase ID token only (used by /auth/register before a profile exists). */
export const verifyToken: RequestHandler = async (req, _res, next) => {
  req.firebase = await verifyBearer(req);
  next();
};

export function toAuthedUser(uid: string, doc: UserDoc): AuthedUser {
  return {
    uid,
    role: doc.role,
    name: doc.name,
    email: doc.email,
    schoolId: doc.schoolId ?? null,
    studyLevel: doc.studyLevel ?? null,
    timeZone: doc.timeZone || env.DEFAULT_TIME_ZONE,
    disabled: doc.disabled,
    doc,
  };
}

/**
 * Decision 16 / SRS 5.2: verify the ID token, then read the role from
 * users/{uid} on every request. Custom claims are never trusted here.
 */
export const requireUser: RequestHandler = async (req, _res, next) => {
  const fb = await verifyBearer(req);
  req.firebase = fb;
  const snap = await col.users().doc(fb.uid).get();
  if (!snap.exists) throw forbidden("Finish creating your account first.", "profile_missing");
  const doc = snap.data()!;
  if (doc.disabled) throw forbidden("This account is disabled. Contact your school.", "account_disabled");
  req.user = toAuthedUser(fb.uid, doc);
  next();
};

/** FR-3.1.3: server-side route guard by role. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden("Your role can't do this.", "wrong_role");
    next();
  };
}

export function currentUser(req: Request): AuthedUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** School Admin rights apply only within their own schoolId. */
export function assertSchoolAdmin(u: AuthedUser, schoolId: string) {
  if (u.role !== "school_admin" || !u.schoolId || u.schoolId !== schoolId) {
    throw forbidden("Only this school's admins can do this.", "wrong_school");
  }
}
