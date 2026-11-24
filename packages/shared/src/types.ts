import type {
  ActivityType,
  AttendanceSource,
  AttendanceStatus,
  ClassStatus,
  ContentSource,
  ContentStatus,
  EnrollmentAddedBy,
  CallStatus,
  EnrollmentStatus,
  JlptLevel,
  LibraryType,
  MaterialStatus,
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  Role,
  SessionProvider,
  SessionStatus,
} from "./constants";

/** Every error response (§11). */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface UserDto {
  uid: string;
  role: Role;
  name: string;
  email: string;
  schoolId: string | null;
  studyLevel: JlptLevel | null;
  timeZone: string;
  privacyConsentAt: string | null;
  disabled: boolean;
  createdAt: string;
}

/** A row on the School Admin's People list. */
export interface SchoolPersonDto extends UserDto {
  /** Students: this school's classes they're enrolled in now (empty for teachers). */
  classes: { id: string; name: string }[];
  /** A student in one of this school's classes whose account belongs to another school. */
  otherSchool: boolean;
}

export interface MeDto extends UserDto {
  school: SchoolDto | null;
  google: { status: "connected" | "needs_reconnect"; googleEmail: string } | null;
  /** Teachers only: their Premium plan and limits. */
  plan: PlanDto | null;
}

/** A teacher's plan: free, or Premium (bought once, never expires). */
export interface PlanDto {
  premium: boolean;
  premiumSince: string | null;
  callLimitSeconds: number;
  storageLimitBytes: number;
  storageUsedBytes: number;
}

/** A school's teacher slots: 5 free plus purchased packs of 5. */
export interface SeatsDto {
  free: number;
  purchased: number;
  total: number;
  used: number;
  available: number;
}

export interface SchoolDto {
  id: string;
  name: string;
  timeZone: string;
  createdAt: string;
}

/** Content Admin view of a school. */
export interface SchoolSummaryDto extends SchoolDto {
  admins: { uid: string; name: string; email: string; invited: boolean }[];
  seats: SeatsDto;
  students: number;
  classes: number;
}

export interface PersonRef {
  uid: string;
  name: string;
}

export interface EnrollmentDto {
  classId: string;
  uid: string;
  status: EnrollmentStatus;
  addedBy: EnrollmentAddedBy;
  joinedAt: string;
}

export interface ClassDto {
  id: string;
  schoolId: string;
  name: string;
  level: JlptLevel;
  /** Only returned to staff. */
  code?: string;
  teacherIds: string[];
  teachers: PersonRef[];
  status: ClassStatus;
  createdAt: string;
  updatedAt: string;
  studentCount?: number;
  /** Present for students. */
  enrollment?: EnrollmentDto | null;
  schoolName?: string;
}

export interface ClassPreviewDto {
  id: string;
  code: string;
  name: string;
  level: JlptLevel;
  teachers: string[];
  schoolName: string;
  status: ClassStatus;
  upcomingSessions: { title: string; startAt: string; endAt: string }[];
  enrollment: Pick<EnrollmentDto, "status"> | null;
}

export interface RosterEntryDto {
  uid: string;
  name: string;
  email: string;
  status: EnrollmentStatus;
  addedBy: EnrollmentAddedBy;
  joinedAt: string;
}

export interface LessonDto {
  id: string;
  classId: string;
  title: string;
  order: number;
  description: string | null;
  counts?: { flashcards: number; quizzes: number };
}

export interface FlashcardDto {
  id: string;
  term: string;
  reading: string;
  meaning: string;
  exampleSentence: string | null;
  audioUrl?: string | null;
  audioMimeType?: string | null;
  audioFileName?: string | null;
  expectedAudioName?: string | null;
  importBatchId?: string | null;
  source: ContentSource;
  level: JlptLevel | null;
  classId: string | null;
  lessonId: string | null;
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionDto {
  text: string;
  choices: string[];
  correctIndex: number;
  audioUrl?: string | null;
  audioFileName?: string | null;
  expectedAudioName?: string | null;
}

export interface QuizDto {
  id: string;
  importBatchId?: string | null;
  title: string;
  questions: QuestionDto[];
  source: ContentSource;
  level: JlptLevel | null;
  classId: string | null;
  lessonId: string | null;
  status: ContentStatus;
  passingScorePct: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingTestDto {
  id: string;
  title: string;
  level: JlptLevel;
  passage: string;
  questions: QuestionDto[];
  status: ContentStatus;
  passingScorePct: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListeningTestDto {
  id: string;
  title: string;
  level: JlptLevel;
  audioUrl: string | null;
  audioFileName?: string | null;
  questions: QuestionDto[];
  status: ContentStatus;
  passingScorePct: number;
  createdAt: string;
  updatedAt: string;
}

export type LibraryItemDto = FlashcardDto | QuizDto | ReadingTestDto | ListeningTestDto;

/** Student-facing activity. Decision 6 and 7: no correctIndex, no answer audio. */
export interface ActivityDto {
  id: string;
  type: ActivityType;
  title: string;
  level: JlptLevel | null;
  classId: string | null;
  passage?: string;
  audioUrl?: string;
  passingScorePct: number;
  questions: { text: string; choices: string[] }[];
}

export interface ReviewItemDto {
  text: string;
  choices: string[];
  yourAnswer: number | null;
  correctIndex: number;
  correct: boolean;
  audioUrl?: string;
}

export interface AttemptResultDto {
  attemptId: string;
  activityId: string;
  activityType: ActivityType;
  title: string;
  score: number;
  correctCount: number;
  total: number;
  passed: boolean;
  passingScorePct: number;
  bestScore: number;
  attemptCount: number;
  review: ReviewItemDto[];
}

export interface AttemptSummaryDto {
  id: string;
  activityId: string;
  activityType: ActivityType;
  title: string;
  classId: string | null;
  score: number;
  correctCount: number;
  total: number;
  passed: boolean;
  submittedAt: string;
}

export interface ProgressSummaryDto {
  activityId: string;
  activityType: ActivityType;
  title: string;
  score: number;
  bestScore: number;
  attemptCount: number;
  passed: boolean;
  submittedAt: string;
  classId: string | null;
}

export interface ProgressMeDto {
  streak: number;
  averageScore: number | null;
  attemptCount: number;
  history: AttemptSummaryDto[];
  nextCursor: string | null;
  summaries: ProgressSummaryDto[];
}

export interface ClassReportDto {
  classId: string;
  studentCount: number;
  quizzes: {
    activityId: string;
    title: string;
    attempts: number;
    students: number;
    averageScore: number | null;
    passRate: number | null;
  }[];
  students: {
    uid: string;
    name: string;
    attempts: number;
    averageScore: number | null;
    bestScores: Record<string, number>;
    attendanceRate: number | null;
    materialsOpened: number;
  }[];
  sessions: {
    sessionId: string;
    title: string;
    startAt: string;
    status: SessionStatus;
    present: number;
    late: number;
    absent: number;
    excused: number;
    attendanceRate: number | null;
  }[];
  materials: { materialId: string; title: string; opened: number; total: number }[];
}

export interface SchoolReportDto {
  schoolId: string;
  totals: {
    classes: number;
    activeClasses: number;
    teachers: number;
    students: number;
    activeEnrollments: number;
    attempts: number;
    averageScore: number | null;
    attendanceRate: number | null;
  };
  classes: {
    classId: string;
    name: string;
    level: JlptLevel;
    status: ClassStatus;
    teachers: string[];
    students: number;
    attempts: number;
    averageScore: number | null;
    passRate: number | null;
    attendanceRate: number | null;
  }[];
  teachers: { uid: string; name: string; classes: number; students: number; averageScore: number | null }[];
}

export interface ImportRowError {
  row: number;
  reason: string;
}

export interface ImportResultDto {
  imported: number;
  errors: ImportRowError[];
  /** Base64 .xlsx error report (FR-3.3.4); present when there are errors. */
  errorReport?: string;
  ids: string[];
  quizId?: string;
  /** Built-in imports land as drafts in this batch (FR-3.5.3 review screen). */
  batchId?: string;
}

export interface LiveSessionDto {
  id: string;
  classId: string;
  className?: string;
  hostUid: string;
  hostName: string | null;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  provider: SessionProvider;
  /** FR-3.11.10: only for users with class access. */
  meetUrl?: string;
  inviteStudents: boolean;
  status: SessionStatus;
  calendarEventId?: string | null;
  myAttendance?: AttendanceStatus | null;
  addToCalendarUrl?: string;
}

export interface AttendanceRowDto {
  uid: string;
  name: string;
  status: AttendanceStatus | null;
  joinedAt: string | null;
  source: AttendanceSource | null;
}

export interface MaterialAttachmentDto {
  id: string;
  kind: "file" | "link";
  name: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  url?: string | null;
}

export interface MaterialDto {
  id: string;
  classId: string;
  lessonId: string | null;
  sessionId: string | null;
  title: string;
  description: string | null;
  attachments: MaterialAttachmentDto[];
  status: MaterialStatus;
  pinned: boolean;
  publishedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Student view: false until opened (FR-3.12.4). */
  viewed?: boolean;
  /** Staff view (FR-3.12.6). */
  openedCount?: number;
  studentCount?: number;
}

export interface MaterialViewsDto {
  opened: { uid: string; name: string; firstViewedAt: string; lastViewedAt: string; viewCount: number }[];
  notOpened: PersonRef[];
  total: number;
}

export interface PaymentDto {
  id: string;
  referenceNumber: string;
  /** Who paid: a School Admin for teacher slots, a teacher for Premium. */
  uid: string;
  payerName?: string;
  schoolId: string | null;
  purpose: PaymentPurpose;
  /** Packs of 5 teacher slots, or 1 for Premium. */
  quantity: number;
  description: string;
  amountCentavos: number;
  currency: "PHP";
  provider: PaymentProvider;
  status: PaymentStatus;
  checkoutUrl?: string | null;
  method: string | null;
  reviewNote: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptDto {
  paymentId: string;
  referenceNumber: string;
  payerName: string;
  payerEmail: string;
  schoolName: string | null;
  description: string;
  amountCentavos: number;
  method: string;
  paidAt: string;
}

/** A School Admin's billing page. */
export interface SchoolBillingDto {
  seats: SeatsDto;
  payments: PaymentDto[];
}

/** A teacher's Premium page. */
export interface TeacherBillingDto {
  plan: PlanDto;
  payments: PaymentDto[];
}

// ---------- In-app video calls ----------

export interface CallDto {
  id: string;
  classId: string;
  hostUid: string;
  hostName: string | null;
  title: string;
  status: CallStatus;
  startedAt: string;
  /** When the call ends automatically: 5 minutes free, 15 with the host's Premium. */
  endsAt: string;
  limitSeconds: number;
  /** True when the host can extend this call to the Premium length. */
  canExtend: boolean;
  participantCount: number;
}

// ---------- My Drive ----------

export interface DriveItemDto {
  id: string;
  kind: "folder" | "file";
  name: string;
  parentId: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriveListingDto {
  folder: { id: string; name: string } | null;
  path: { id: string; name: string }[];
  items: DriveItemDto[];
  usage: { usedBytes: number; limitBytes: number; premium: boolean };
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface LibraryOverviewDto {
  levels: Record<JlptLevel, { flashcards: number; quizzes: number; readingTests: number; listeningTests: number; drafts: number }>;
}

/** Student-facing flashcard. Teacher cards never carry audio (FR-3.3.5). */
export interface StudyCardDto {
  id: string;
  term: string;
  reading: string;
  meaning: string;
  exampleSentence: string | null;
  audioUrl?: string;
}

/** A quiz or test in a study list, with the student's own progress. */
export interface StudyItemDto {
  id: string;
  type: ActivityType;
  title: string;
  level: JlptLevel | null;
  questionCount: number;
  passingScorePct: number;
  lessonId?: string | null;
  bestScore: number | null;
  attemptCount: number;
}

export interface StudyLibraryDto {
  level: JlptLevel;
  type: LibraryType;
  cards?: StudyCardDto[];
  items?: StudyItemDto[];
  total: number;
  nextCursor: string | null;
}

export interface ClassStudyDto {
  classId: string;
  lessons: { id: string; title: string; description: string | null; flashcards: StudyCardDto[]; quizzes: StudyItemDto[] }[];
}
