import { beforeAll, describe, expect, it } from "vitest";
import { ROLES, type Role } from "@nihongo/shared";
import { api, bearer, createWorld, type TestUser, type World } from "./helpers";

type Method = "get" | "post" | "patch" | "put" | "delete";
const T: Role = "teacher";
const A: Role = "school_admin";
const S: Role = "student";
const C: Role = "content_admin";

let w: World;
let byRole: Record<Role, TestUser>;

beforeAll(async () => {
  w = await createWorld();
  byRole = { student: w.student, teacher: w.teacher, school_admin: w.admin, content_admin: w.contentAdmin };
});

/** Every role-restricted route, with the roles allowed to call it (§5). */
const ROUTES = (school: string): [Method, string, Role[]][] => [
  ["get", `/schools/${school}/users`, [A]],
  ["post", `/schools/${school}/users`, [A]],
  ["patch", `/users/x`, [A]],
  ["delete", `/users/x`, [A]],
  ["patch", `/schools/${school}`, [A]],
  ["get", `/classes`, [T, A, S]],
  ["post", `/classes`, [T, A]],
  ["get", `/classes/preview?code=ABCDEF`, [S]],
  ["post", `/classes/join`, [S]],
  ["get", `/classes/x`, [T, A, S]],
  ["patch", `/classes/x`, [T, A]],
  ["delete", `/classes/x`, [A]],
  ["post", `/classes/x/code`, [T, A]],
  ["get", `/classes/x/roster`, [T, A]],
  ["post", `/classes/x/roster`, [T, A]],
  ["delete", `/classes/x/roster/u`, [T, A]],
  ["get", `/classes/x/lessons`, [T, A, S]],
  ["post", `/classes/x/lessons`, [T, A]],
  ["patch", `/lessons/x`, [T, A]],
  ["delete", `/lessons/x`, [T, A]],
  ["get", `/classes/x/flashcards`, [T, A]],
  ["post", `/classes/x/flashcards`, [T, A]],
  ["post", `/classes/x/flashcards/import`, [T, A]],
  ["get", `/classes/x/quizzes`, [T, A]],
  ["post", `/classes/x/quizzes`, [T, A]],
  ["post", `/classes/x/quizzes/import`, [T, A]],
  ["patch", `/flashcards/x`, [T, A]],
  ["delete", `/flashcards/x`, [T, A]],
  ["get", `/quizzes/x`, [T, A]],
  ["patch", `/quizzes/x`, [T, A]],
  ["delete", `/quizzes/x`, [T, A]],
  ["get", `/templates/flashcards`, [T, A, C]],
  ["get", `/library/overview`, [C]],
  ["get", `/library/flashcards`, [C]],
  ["post", `/library/quizzes`, [C]],
  ["get", `/library/reading-tests/x`, [C]],
  ["patch", `/library/listening-tests/x`, [C]],
  ["delete", `/library/flashcards/x`, [C]],
  ["post", `/library/flashcards/import`, [C]],
  ["post", `/library/flashcards/x/audio`, [C]],
  ["delete", `/library/flashcards/x/audio`, [C]],
  ["post", `/library/flashcards/x/publish`, [C]],
  ["post", `/library/flashcards/batch/b/publish`, [C]],
  ["get", `/study/library?level=N5&type=flashcards`, [S]],
  ["get", `/classes/x/study`, [S]],
  ["get", `/activities/quiz/x`, [S]],
  ["post", `/activities/quiz/x/submit`, [S]],
  ["get", `/progress/me`, [S]],
  ["get", `/classes/x/reports`, [T, A]],
  ["get", `/schools/${school}/reports`, [A]],
  ["get", `/integrations/google/connect`, [T, A]],
  ["delete", `/integrations/google`, [T, A]],
  ["get", `/classes/x/sessions`, [T, A, S]],
  ["post", `/classes/x/sessions`, [T, A]],
  ["patch", `/sessions/x`, [T, A]],
  ["delete", `/sessions/x`, [T, A]],
  ["post", `/sessions/x/check-in`, [S]],
  ["get", `/sessions/x/attendance`, [T, A]],
  ["put", `/sessions/x/attendance`, [T, A]],
  ["get", `/classes/x/materials`, [T, A, S]],
  ["post", `/classes/x/materials`, [T, A]],
  ["get", `/materials/x`, [T, A, S]],
  ["patch", `/materials/x`, [T, A]],
  ["delete", `/materials/x`, [T, A]],
  ["post", `/materials/x/attachments`, [T, A]],
  ["delete", `/materials/x/attachments/a`, [T, A]],
  ["post", `/materials/x/attachments/a/ticket`, [T, A, S]],
  ["post", `/materials/x/view`, [T, A, S]],
  ["get", `/materials/x/views`, [T, A]],
  ["get", `/billing/school`, [A]],
  ["post", `/billing/teacher-seats/checkout`, [A]],
  ["get", `/billing/premium`, [T]],
  ["post", `/billing/premium/checkout`, [T]],
  ["get", `/payments/x`, [T, A]],
  ["get", `/payments/x/receipt`, [T, A]],
  ["post", `/dev/mock-paymongo/x/pay`, [T, A]],
  ["get", `/schools`, [C]],
  ["post", `/schools`, [C]],
  ["post", `/schools/${school}/admins`, [C]],
  ["delete", `/schools/${school}/admins/x`, [C]],
  ["get", `/drive`, [T]],
  ["post", `/drive/folders`, [T]],
  ["post", `/drive/files`, [T]],
  ["patch", `/drive/x`, [T]],
  ["delete", `/drive/x`, [T]],
  ["post", `/drive/x/ticket`, [T]],
  ["get", `/calls/ice`, [T, A, S]],
  ["get", `/classes/x/calls/active`, [T, A, S]],
  ["post", `/classes/x/calls`, [T, A]],
  ["get", `/calls/x`, [T, A, S]],
  ["post", `/calls/x/end`, [T, A]],
  ["post", `/calls/x/extend`, [T]],
];

describe("SRS 5.2 role checks on every role-restricted route", () => {
  it("SRS 5.2 every role-restricted route answers 403 to each wrong role", async () => {
    const failures: string[] = [];
    for (const [method, path, allowed] of ROUTES(w.schoolId)) {
      for (const role of ROLES.filter((r) => !allowed.includes(r))) {
        const res = await api()[method](`/api${path}`).set(bearer(byRole[role])).send({});
        if (res.status !== 403) failures.push(`${method.toUpperCase()} ${path} as ${role}: ${res.status}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("SRS 5.2 every authenticated route answers 401 without a token", async () => {
    const failures: string[] = [];
    for (const [method, path] of ROUTES(w.schoolId)) {
      const res = await api()[method](`/api${path}`).send({});
      if (res.status !== 401) failures.push(`${method.toUpperCase()} ${path}: ${res.status}`);
    }
    expect(failures).toEqual([]);
  });
});

describe("§14 rate limits", () => {
  it("§14 class-code lookups are rate-limited", async () => {
    process.env.RATE_LIMIT_IN_TESTS = "1";
    try {
      let limited = false;
      for (let i = 0; i < 32 && !limited; i++) {
        const res = await api().get("/api/classes/preview?code=ABCDEF").set(bearer(w.student));
        if (res.status === 429) {
          limited = true;
          expect(res.body.error.code).toBe("rate_limited");
        }
      }
      expect(limited).toBe(true);
    } finally {
      delete process.env.RATE_LIMIT_IN_TESTS;
    }
  });
});
