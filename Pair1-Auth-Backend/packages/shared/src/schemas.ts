import { z } from "zod";
import {
  ATTENDANCE_STATUSES,
  CLASS_CODE_ALPHABET,
  CLASS_CODE_LENGTH,
  CONTENT_STATUSES,
  DEFAULT_PASSING_SCORE_PCT,
  JLPT_LEVELS,
  LIMITS,
  MATERIAL_STATUSES,
  MEET_URL_PATTERN,
  PLANS,
} from "./constants";
import { isValidTimeZone } from "./time";

const text = (max: number) => z.string().trim().min(1, { error: "Required" }).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const jlptLevelSchema = z.enum(JLPT_LEVELS);
export const timeZoneSchema = z.string().refine(isValidTimeZone, { error: "Unknown time zone" });
export const passingScoreSchema = z.number().int().min(1).max(100).default(DEFAULT_PASSING_SCORE_PCT);
export const idSchema = z.string().trim().min(1).max(128);

// ---------- Accounts (FR-3.1.1) ----------

/** Self-registration. The role is never accepted from the client. */
export const registerSchema = z.object({
  name: text(100),
  privacyConsent: z.literal(true, { error: "You must accept the privacy notice to continue" }),
  studyLevel: jlptLevelSchema.optional(),
  timeZone: timeZoneSchema.optional(),
});

export const mePatchSchema = z.object({
  name: text(100).optional(),
  studyLevel: jlptLevelSchema.optional(),
  timeZone: timeZoneSchema.optional(),
  privacyConsent: z.literal(true).optional(),
});

const emailSchema = z.email({ error: "Enter a valid email address" }).transform((v) => v.toLowerCase());

/** A School Admin adds teachers only; students sign themselves up. */
export const createSchoolUserSchema = z.object({
  name: text(100),
  email: emailSchema,
  role: z.literal("teacher").default("teacher"),
});

/** Only a Content Admin creates a school, together with its first School Admin. */
export const createSchoolSchema = z.object({
  name: text(120),
  timeZone: timeZoneSchema.optional(),
  adminName: text(100),
  adminEmail: emailSchema,
});

/** Only a Content Admin adds more School Admins to a school. */
export const addSchoolAdminSchema = z.object({
  name: text(100),
  email: emailSchema,
});

export const patchUserSchema = z.object({
  name: text(100).optional(),
  disabled: z.boolean().optional(),
  role: z.enum(["teacher", "student"]).optional(),
});

export const schoolPatchSchema = z.object({
  name: text(120).optional(),
  timeZone: timeZoneSchema.optional(),
});

// ---------- Classes (FR-3.2) ----------

export const classCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => v.length === CLASS_CODE_LENGTH && [...v].every((c) => CLASS_CODE_ALPHABET.includes(c)), {
    error: "Class codes are 6 letters and numbers",
  });

export const classCreateSchema = z.object({
  name: text(120),
  level: jlptLevelSchema,
  teacherIds: z.array(idSchema).max(20).optional(),
});

export const classPatchSchema = z.object({
  name: text(120).optional(),
  level: jlptLevelSchema.optional(),
  teacherIds: z.array(idSchema).min(1).max(20).optional(),
});

export const joinClassSchema = z.object({ code: classCodeSchema });

/** Staff add an existing student account to a class by email. */
export const rosterAddSchema = z.object({
  email: emailSchema,
});

export const lessonCreateSchema = z.object({
  title: text(120),
  description: optionalText(1000),
});

export const lessonPatchSchema = z.object({
  title: text(120).optional(),
  description: z.string().trim().max(1000).optional(),
  order: z.number().int().min(0).max(10_000).optional(),
});

// ---------- Content (FR-3.3 to FR-3.5) ----------

const choicesSchema = z.tuple([text(300), text(300), text(300), text(300)]);

/** Decision 11: four choices everywhere. Teacher questions carry no audio (FR-3.4.5). */
export const teacherQuestionSchema = z.strictObject({
  text: text(1000),
  choices: choicesSchema,
  correctIndex: z.number().int().min(0).max(3),
});

export const builtinQuestionSchema = z.strictObject({
  text: text(1000),
  choices: choicesSchema,
  correctIndex: z.number().int().min(0).max(3),
  audioUrl: z.url().optional(),
});

/** FR-3.3.1 / FR-3.3.5: strict, so an audioUrl is rejected rather than stored. */
export const teacherFlashcardSchema = z.strictObject({
  lessonId: idSchema,
  term: text(200),
  reading: text(200),
  meaning: text(500),
  exampleSentence: optionalText(500),
});

export const teacherFlashcardPatchSchema = teacherFlashcardSchema.partial().strict();

export const teacherQuizSchema = z.strictObject({
  lessonId: idSchema,
  title: text(200),
  questions: z.array(teacherQuestionSchema).min(1).max(200),
  passingScorePct: passingScoreSchema,
});

export const teacherQuizPatchSchema = z.strictObject({
  lessonId: idSchema.optional(),
  title: text(200).optional(),
  questions: z.array(teacherQuestionSchema).min(1).max(200).optional(),
  passingScorePct: z.number().int().min(1).max(100).optional(),
});

export const builtinFlashcardSchema = z.strictObject({
  level: jlptLevelSchema,
  term: text(200),
  reading: text(200),
  meaning: text(500),
  exampleSentence: optionalText(500),
  status: z.enum(CONTENT_STATUSES).default("draft"),
});

export const builtinFlashcardPatchSchema = z.strictObject({
  level: jlptLevelSchema.optional(),
  term: text(200).optional(),
  reading: text(200).optional(),
  meaning: text(500).optional(),
  exampleSentence: z.string().trim().max(500).optional(),
  removeAudio: z.boolean().optional(),
});

export const builtinQuizSchema = z.strictObject({
  level: jlptLevelSchema,
  title: text(200),
  questions: z.array(builtinQuestionSchema).min(1).max(200),
  passingScorePct: passingScoreSchema,
  status: z.enum(CONTENT_STATUSES).default("draft"),
});

export const builtinQuizPatchSchema = z.strictObject({
  level: jlptLevelSchema.optional(),
  title: text(200).optional(),
  questions: z.array(builtinQuestionSchema).min(1).max(200).optional(),
  passingScorePct: z.number().int().min(1).max(100).optional(),
});

export const readingTestSchema = z.strictObject({
  level: jlptLevelSchema,
  title: text(200),
  passage: text(20_000),
  questions: z.array(teacherQuestionSchema).min(1).max(100),
  passingScorePct: passingScoreSchema,
  status: z.enum(CONTENT_STATUSES).default("draft"),
});

export const readingTestPatchSchema = z.strictObject({
  level: jlptLevelSchema.optional(),
  title: text(200).optional(),
  passage: text(20_000).optional(),
  questions: z.array(teacherQuestionSchema).min(1).max(100).optional(),
  passingScorePct: z.number().int().min(1).max(100).optional(),
});

export const listeningTestSchema = z.strictObject({
  level: jlptLevelSchema,
  title: text(200),
  questions: z.array(teacherQuestionSchema).min(1).max(100),
  passingScorePct: passingScoreSchema,
  status: z.enum(CONTENT_STATUSES).default("draft"),
});

export const listeningTestPatchSchema = z.strictObject({
  level: jlptLevelSchema.optional(),
  title: text(200).optional(),
  questions: z.array(teacherQuestionSchema).min(1).max(100).optional(),
  passingScorePct: z.number().int().min(1).max(100).optional(),
});

export const publishSchema = z.object({ status: z.enum(CONTENT_STATUSES).default("published") });

/**
 * SRS §6 rules for a stored flashcard or quiz: audioUrl only when builtin,
 * classId only when teacher, builtin requires level.
 */
export const contentDocRulesSchema = z
  .object({
    source: z.enum(["builtin", "teacher"]),
    level: jlptLevelSchema.nullish(),
    classId: z.string().nullish(),
    audioUrl: z.string().nullish(),
    questions: z.array(z.object({ audioUrl: z.string().nullish() }).loose()).optional(),
  })
  .loose()
  .superRefine((doc, ctx) => {
    const hasAudio = !!doc.audioUrl || !!doc.questions?.some((q) => !!q.audioUrl);
    if (doc.source === "teacher") {
      if (hasAudio) ctx.addIssue({ code: "custom", message: "Teacher content has no audio" });
      if (!doc.classId) ctx.addIssue({ code: "custom", message: "Teacher content requires classId" });
    } else {
      if (doc.classId) ctx.addIssue({ code: "custom", message: "Built-in content has no classId" });
      if (!doc.level) ctx.addIssue({ code: "custom", message: "Built-in content requires a JLPT level" });
    }
  });

// ---------- Studying ----------

export const submitAttemptSchema = z.object({
  answers: z.array(z.number().int().min(0).max(3).nullable()).max(500),
  classId: idSchema.optional(),
});

export const studyLibraryQuerySchema = z.object({
  level: jlptLevelSchema,
  type: z.enum(["flashcards", "quizzes", "reading-tests", "listening-tests"]),
  cursor: z.string().max(500).optional(),
  shuffle: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

// ---------- Live classes (FR-3.11) ----------

export const meetUrlSchema = z
  .string()
  .trim()
  .regex(MEET_URL_PATTERN, { error: "Paste a Google Meet link that starts with https://meet.google.com/" });

export const sessionCreateSchema = z.object({
  title: text(200),
  description: optionalText(2000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD" }),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Use HH:mm" }),
  durationMinutes: z.number().int().min(15).max(480),
  repeatWeeks: z.number().int().min(1).max(LIMITS.maxRepeatWeeks).default(1),
  inviteStudents: z.boolean().default(false),
  /** Create the Meet link through the host's Google account when it's connected. */
  useGoogle: z.boolean().default(true),
  /** FR-3.11.4: required when Google isn't connected or fails. */
  meetUrl: meetUrlSchema.optional(),
});

export const sessionPatchSchema = z.object({
  title: text(200).optional(),
  description: z.string().trim().max(2000).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  inviteStudents: z.boolean().optional(),
  meetUrl: meetUrlSchema.optional(),
});

export const attendancePutSchema = z.object({
  records: z
    .array(z.object({ uid: idSchema, status: z.enum(ATTENDANCE_STATUSES) }))
    .min(1)
    .max(500),
});

// ---------- Materials (FR-3.12) ----------

export const httpsUrlSchema = z
  .url({ error: "Enter a full link" })
  .refine((v) => v.startsWith("https://"), { error: "Links must start with https://" });

export const materialCreateSchema = z.object({
  title: text(200),
  description: optionalText(4000),
  lessonId: idSchema.optional(),
  sessionId: idSchema.optional(),
});

export const materialPatchSchema = z.object({
  title: text(200).optional(),
  description: z.string().trim().max(4000).optional(),
  lessonId: idSchema.nullable().optional(),
  sessionId: idSchema.nullable().optional(),
  pinned: z.boolean().optional(),
  status: z.enum(MATERIAL_STATUSES).optional(),
});

export const materialLinkSchema = z.object({
  kind: z.literal("link"),
  name: text(200),
  url: httpsUrlSchema,
});

export const fileTicketQuerySchema = z.object({
  disposition: z.enum(["inline", "attachment"]).default("inline"),
});

// ---------- Billing: teacher slots and Premium ----------

/** The amount always comes from PLANS on the server; only the pack count is read. */
export const seatsCheckoutSchema = z.object({
  packs: z.number().int().min(1).max(PLANS.maxSeatPacksPerPurchase).default(1),
});

// ---------- My Drive ----------

const fileName = z
  .string()
  .trim()
  .min(1, { error: "Enter a name" })
  .max(150)
  .refine((v) => !/[\\/]/.test(v), { error: "Names can't contain / or \\" });

export const driveFolderCreateSchema = z.object({
  name: fileName,
  parentId: idSchema.nullable().optional(),
});

export const driveItemPatchSchema = z.object({
  name: fileName.optional(),
  parentId: idSchema.nullable().optional(),
});

export const notificationsReadSchema = z.object({
  ids: z.array(idSchema).max(200).optional(),
  all: z.boolean().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type MePatchInput = z.infer<typeof mePatchSchema>;
export type CreateSchoolUserInput = z.infer<typeof createSchoolUserSchema>;
export type ClassCreateInput = z.infer<typeof classCreateSchema>;
export type ClassPatchInput = z.infer<typeof classPatchSchema>;
export type TeacherFlashcardInput = z.infer<typeof teacherFlashcardSchema>;
export type TeacherQuizInput = z.infer<typeof teacherQuizSchema>;
export type TeacherQuestionInput = z.infer<typeof teacherQuestionSchema>;
export type BuiltinQuestionInput = z.infer<typeof builtinQuestionSchema>;
export type BuiltinFlashcardInput = z.infer<typeof builtinFlashcardSchema>;
export type BuiltinQuizInput = z.infer<typeof builtinQuizSchema>;
export type ReadingTestInput = z.infer<typeof readingTestSchema>;
export type ListeningTestInput = z.infer<typeof listeningTestSchema>;
export type SessionCreateInput = z.infer<typeof sessionCreateSchema>;
export type SessionPatchInput = z.infer<typeof sessionPatchSchema>;
export type MaterialCreateInput = z.infer<typeof materialCreateSchema>;
export type MaterialPatchInput = z.infer<typeof materialPatchSchema>;
