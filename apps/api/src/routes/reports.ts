import { Router } from "express";
import type { ClassReportDto, SchoolReportDto } from "@nihongo/shared";
import { col, type AttemptDoc, type AttendanceDoc, type LiveSessionDoc } from "../db";
import { assertClassAccess } from "../lib/access";
import { assertSchoolAdmin, currentUser, requireRole } from "../lib/auth";
import { iso } from "../lib/time";
import { params } from "../lib/validate";
import { peopleRefs } from "./classes";

export const reportsRouter = Router();

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/**
 * FR-3.11.9: attendance rate = (present + late) / (present + late + absent).
 * Excused absences don't count against the student.
 */
export function attendanceRate(records: Pick<AttendanceDoc, "status">[]): number | null {
  let attended = 0;
  let counted = 0;
  for (const r of records) {
    if (r.status === "excused") continue;
    counted++;
    if (r.status === "present" || r.status === "late") attended++;
  }
  return counted ? Math.round((attended / counted) * 1000) / 10 : null;
}

/**
 * FR-3.11.9: rates count finished live classes only. Rows on an upcoming,
 * in-progress, or cancelled one (check-ins before the job finishes it, a
 * class moved or cancelled after check-ins) never count.
 */
const isFinished = (s: Pick<LiveSessionDoc, "status">) => s.status === "completed";

async function inChunks<T>(values: string[], run: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += 30) out.push(...(await run(values.slice(i, i + 30))));
  return out;
}

/** FR-3.9.3: class results per quiz and per student, attendance, and materials opened. */
reportsRouter.get("/classes/:id/reports", requireRole("teacher", "school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  await assertClassAccess(u, id, "staff");
  const [enrollments, quizzes, attempts, sessions, attendance, materials, views] = await Promise.all([
    col.enrollments().where("classId", "==", id).where("status", "==", "active").get(),
    col.quizzes().where("classId", "==", id).get(),
    col.attempts().where("classId", "==", id).limit(10000).get(),
    col.liveSessions().where("classId", "==", id).orderBy("startAt").get(),
    col.attendance().where("classId", "==", id).get(),
    col.materials().where("classId", "==", id).where("status", "==", "published").get(),
    col.materialViews().where("classId", "==", id).get(),
  ]);
  const studentIds = enrollments.docs.map((d) => d.data().uid);
  const people = await peopleRefs(studentIds);
  const atts = attempts.docs.map((d) => d.data() as AttemptDoc);
  const att = attendance.docs.map((d) => d.data());
  const finished = new Set(sessions.docs.filter((s) => isFinished(s.data())).map((s) => s.id));
  const viewDocs = views.docs.map((d) => d.data());
  const activeSet = new Set(studentIds);

  const report: ClassReportDto = {
    classId: id,
    studentCount: studentIds.length,
    quizzes: quizzes.docs.map((q) => {
      const mine = atts.filter((a) => a.activityId === q.id);
      const students = new Set(mine.map((a) => a.uid));
      const passedStudents = new Set(mine.filter((a) => a.passed).map((a) => a.uid));
      return {
        activityId: q.id,
        title: q.data().title,
        attempts: mine.length,
        students: students.size,
        averageScore: avg(mine.map((a) => a.score)),
        passRate: students.size ? Math.round((passedStudents.size / students.size) * 1000) / 10 : null,
      };
    }),
    students: studentIds
      .map((uid) => {
        const mine = atts.filter((a) => a.uid === uid);
        const bestScores: Record<string, number> = {};
        for (const a of mine) bestScores[a.activityId] = Math.max(bestScores[a.activityId] ?? 0, a.score);
        return {
          uid,
          name: people.get(uid)?.name ?? "Student",
          attempts: mine.length,
          averageScore: avg(mine.map((a) => a.score)),
          bestScores,
          attendanceRate: attendanceRate(att.filter((a) => a.uid === uid && finished.has(a.sessionId))),
          materialsOpened: new Set(viewDocs.filter((v) => v.uid === uid).map((v) => v.materialId)).size,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    sessions: sessions.docs
      .filter((s) => s.data().status !== "cancelled")
      .map((s) => {
        const rows = att.filter((a) => a.sessionId === s.id);
        const count = (st: string) => rows.filter((r) => r.status === st).length;
        return {
          sessionId: s.id,
          title: s.data().title,
          startAt: iso(s.data().startAt),
          status: s.data().status,
          present: count("present"),
          late: count("late"),
          absent: count("absent"),
          excused: count("excused"),
          attendanceRate: attendanceRate(rows),
        };
      }),
    materials: materials.docs.map((m) => ({
      materialId: m.id,
      title: m.data().title,
      opened: new Set(viewDocs.filter((v) => v.materialId === m.id && activeSet.has(v.uid)).map((v) => v.uid)).size,
      total: studentIds.length,
    })),
  };
  res.json(report);
});

/** FR-3.9.4 / FR-3.10.3: school-wide results across all classes and teachers. */
reportsRouter.get("/schools/:id/reports", requireRole("school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  assertSchoolAdmin(u, id);
  const [classes, teachers, students, enrollments, attempts] = await Promise.all([
    col.classes().where("schoolId", "==", id).get(),
    col.users().where("schoolId", "==", id).where("role", "==", "teacher").count().get(),
    col.users().where("schoolId", "==", id).where("role", "==", "student").count().get(),
    col.enrollments().where("schoolId", "==", id).where("status", "==", "active").get(),
    col.attempts().where("schoolId", "==", id).limit(20000).get(),
  ]);
  const classIds = classes.docs.map((c) => c.id);
  const [allAttendance, finishedIds] = await Promise.all([
    inChunks(classIds, async (chunk) => (await col.attendance().where("classId", "in", chunk).get()).docs.map((d) => d.data())),
    inChunks(classIds, async (chunk) => (await col.liveSessions().where("classId", "in", chunk).get()).docs.filter((d) => isFinished(d.data())).map((d) => d.id)),
  ]);
  // The same records as each class's own report: finished live classes only.
  const finished = new Set(finishedIds);
  const attendance = allAttendance.filter((a) => finished.has(a.sessionId));
  const atts = attempts.docs.map((d) => d.data() as AttemptDoc);
  const enr = enrollments.docs.map((d) => d.data());
  const teacherIds = [...new Set(classes.docs.flatMap((c) => c.data().teacherIds))];
  const people = await peopleRefs(teacherIds);

  const perClass = classes.docs.map((c) => {
    const mine = atts.filter((a) => a.classId === c.id);
    return {
      classId: c.id,
      name: c.data().name,
      level: c.data().level,
      status: c.data().status,
      teachers: c.data().teacherIds.map((t) => people.get(t)?.name ?? "Teacher"),
      students: enr.filter((e) => e.classId === c.id).length,
      attempts: mine.length,
      averageScore: avg(mine.map((a) => a.score)),
      passRate: mine.length ? Math.round((mine.filter((a) => a.passed).length / mine.length) * 1000) / 10 : null,
      attendanceRate: attendanceRate(attendance.filter((a) => a.classId === c.id)),
    };
  });

  const report: SchoolReportDto = {
    schoolId: id,
    totals: {
      classes: classes.size,
      activeClasses: classes.docs.filter((c) => c.data().status === "active").length,
      teachers: teachers.data().count,
      students: students.data().count,
      activeEnrollments: enr.length,
      attempts: atts.length,
      averageScore: avg(atts.map((a) => a.score)),
      attendanceRate: attendanceRate(attendance),
    },
    classes: perClass.sort((a, b) => a.name.localeCompare(b.name)),
    teachers: teacherIds
      .map((t) => {
        const theirs = classes.docs.filter((c) => c.data().teacherIds.includes(t)).map((c) => c.id);
        const mine = atts.filter((a) => a.classId && theirs.includes(a.classId));
        return { uid: t, name: people.get(t)?.name ?? "Teacher", classes: theirs.length, students: enr.filter((e) => theirs.includes(e.classId)).length, averageScore: avg(mine.map((a) => a.score)) };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
  res.json(report);
});
