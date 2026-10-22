import { Router } from "express";
import { notificationsReadSchema, type NotificationDto } from "@nihongo/shared";
import { z } from "zod";
import { db } from "../firebase";
import { col } from "../db";
import { currentUser } from "../lib/auth";
import { iso } from "../lib/time";
import { parse } from "../lib/validate";

export const notificationsRouter = Router();

notificationsRouter.get("/notifications", async (req, res) => {
  const u = currentUser(req);
  const q = parse(z.object({ cursor: z.string().max(200).optional() }), req.query);
  let query = col.notifications().where("uid", "==", u.uid).orderBy("createdAt", "desc").limit(30);
  if (q.cursor) {
    const cursorSnap = await col.notifications().doc(q.cursor).get();
    if (cursorSnap.exists && cursorSnap.data()!.uid === u.uid) query = query.startAfter(cursorSnap);
  }
  const snap = await query.get();
  const items: NotificationDto[] = snap.docs.map((d) => {
    const n = d.data();
    return { id: d.id, type: n.type, title: n.title, body: n.body, link: n.link ?? null, read: n.read, createdAt: iso(n.createdAt) };
  });
  res.json({ items, nextCursor: snap.size === 30 ? snap.docs[snap.size - 1].id : null });
});

notificationsRouter.get("/notifications/unread-count", async (req, res) => {
  const u = currentUser(req);
  const agg = await col.notifications().where("uid", "==", u.uid).where("read", "==", false).count().get();
  res.json({ unread: agg.data().count });
});

notificationsRouter.post("/notifications/read", async (req, res) => {
  const u = currentUser(req);
  const body = parse(notificationsReadSchema, req.body);
  let refs: FirebaseFirestore.DocumentReference[] = [];
  if (body.all) {
    const snap = await col.notifications().where("uid", "==", u.uid).where("read", "==", false).limit(500).get();
    refs = snap.docs.map((d) => d.ref);
  } else if (body.ids?.length) {
    const snaps = await db.getAll(...body.ids.map((id) => col.notifications().doc(id)));
    refs = snaps.filter((s) => s.exists && s.data()!.uid === u.uid).map((s) => s.ref);
  }
  const batch = db.batch();
  refs.forEach((r) => batch.update(r, { read: true }));
  if (refs.length) await batch.commit();
  res.json({ updated: refs.length });
});
