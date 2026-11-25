import type { Timestamp } from "firebase-admin/firestore";
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
  MaterialStatus,
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  Role,
  SessionProvider,
  SessionStatus,
} from "@nihongo/shared";
import { db } from "./firebase";

// Firestore document shapes (§6). Field names follow the SRS exactly.

export interface UserDoc {
  role: Role;
  name: string;
  email: string;
  schoolId?: string | null;
  studyLevel?: JlptLevel | null;
  timeZone?: string | null;
  privacyConsentAt?: Timestamp | null;
  disabled: boolean;
  createdAt: Timestamp;
  /** Teachers: when they bought Premium (one-time, never expires). */
  premiumSince?: Timestamp | null;
  /** Teachers: bytes used by My Drive files plus uploaded class materials. */
  storageUsedBytes?: number;
}

export interface SchoolDoc {
  name: string;
  timeZone: string;
  /** Teacher slots bought on top of the free ones, in slots (packs x 5). */
  extraTeacherSeats?: number;
  createdAt: Timestamp;
}

export interface ClassDoc {
  schoolId: string;
  name: string;
  level: JlptLevel;
  code: string;
  teacherIds: string[];
  status: ClassStatus;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LessonDoc {
  classId: string;
  title: string;
  order: number;
  description?: string | null;
}

export interface EnrollmentDoc {
  classId: string;
  uid: string;
  schoolId: string;
  status: EnrollmentStatus;
  addedBy: EnrollmentAddedBy;
  joinedAt: Timestamp;
  activatedAt?: Timestamp | null;
}

export interface QuestionDoc {
  text: string;
  choices: string[];
  correctIndex: number;
  audioUrl?: string | null;
  audioPath?: string | null;
  audioFileName?: string | null;
  /** From the Excel Audio File Name column, until a file is matched (FR-3.5.3). */
  expectedAudioName?: string | null;
}

export interface FlashcardDoc {
  term: string;
  reading: string;
  meaning: string;
  exampleSentence?: string | null;
  audioUrl?: string | null;
  audioPath?: string | null;
  audioMimeType?: string | null;
  audioFileName?: string | null;
  expectedAudioName?: string | null;
  importBatchId?: string | null;
  source: ContentSource;
  level?: JlptLevel | null;
  classId?: string | null;
  lessonId?: string | null;
  status: ContentStatus;
  shuffleKey: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface QuizDoc {
  title: string;
  questions: QuestionDoc[];
  source: ContentSource;
  level?: JlptLevel | null;
  classId?: string | null;
  lessonId?: string | null;
  status: ContentStatus;
  passingScorePct: number;
  shuffleKey: number;
  importBatchId?: string | null;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ReadingTestDoc {
  title: string;
  level: JlptLevel;
  passage: string;
  questions: QuestionDoc[];
  createdBy: string;
  status: ContentStatus;
  passingScorePct: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ListeningTestDoc {
  title: string;
  level: JlptLevel;
  audioUrl?: string | null;
  audioPath?: string | null;
  audioMimeType?: string | null;
  audioFileName?: string | null;
  questions: QuestionDoc[];
  createdBy: string;
  status: ContentStatus;
  passingScorePct: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProgressDoc {
  uid: string;
  activityType: ActivityType;
  activityId: string;
  title: string;
  score: number;
  passed: boolean;
  submittedAt: Timestamp;
  bestScore: number;
  attemptCount: number;
  classId?: string | null;
}

export interface AttemptDoc {
  uid: string;
  activityId: string;
  activityType: ActivityType;
  title: string;
  classId?: string | null;
  schoolId?: string | null;
  answers: (number | null)[];
  correctCount: number;
  total: number;
  score: number;
  passed: boolean;
  submittedAt: Timestamp;
}

export interface LiveSessionDoc {
  classId: string;
  schoolId: string;
  hostUid: string;
  title: string;
  description?: string | null;
  startAt: Timestamp;
  endAt: Timestamp;
  provider: SessionProvider;
  meetUrl: string;
  calendarEventId?: string | null;
  inviteStudents: boolean;
  invitedEmails?: string[];
  status: SessionStatus;
  reminderSentAt?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AttendanceDoc {
  sessionId: string;
  classId: string;
  uid: string;
  status: AttendanceStatus;
  joinedAt?: Timestamp | null;
  source: AttendanceSource;
  updatedBy?: string | null;
  updatedAt: Timestamp;
}

export interface AttachmentDoc {
  id: string;
  kind: "file" | "link";
  name: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  storagePath?: string | null;
  url?: string | null;
  /** Whose storage quota the file counts against. */
  uploadedBy?: string | null;
}

export interface MaterialDoc {
  classId: string;
  schoolId: string;
  lessonId?: string | null;
  sessionId?: string | null;
  title: string;
  description?: string | null;
  attachments: AttachmentDoc[];
  status: MaterialStatus;
  pinned: boolean;
  publishedAt?: Timestamp | null;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MaterialViewDoc {
  materialId: string;
  classId: string;
  uid: string;
  firstViewedAt: Timestamp;
  lastViewedAt: Timestamp;
  viewCount: number;
}

export interface PaymentDoc {
  referenceNumber: string;
  uid: string;
  schoolId: string | null;
  purpose: PaymentPurpose;
  /** Packs of 5 teacher slots, or 1 for Premium. */
  quantity: number;
  description: string;
  amountCentavos: number;
  currency: "PHP";
  provider: PaymentProvider;
  status: PaymentStatus;
  checkoutSessionId?: string | null;
  checkoutUrl?: string | null;
  providerPaymentId?: string | null;
  method?: string | null;
  reviewNote?: string | null;
  paidAt?: Timestamp | null;
  lastReconciledAt?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** An in-app video call in a class (WebRTC mesh; the API only relays signaling). */
export interface CallDoc {
  classId: string;
  schoolId: string;
  hostUid: string;
  title: string;
  status: CallStatus;
  startedAt: Timestamp;
  endsAt: Timestamp;
  limitSeconds: number;
  endedAt?: Timestamp | null;
  endedReason?: "host" | "time_limit" | "empty" | null;
}

/** A teacher's My Drive file or folder. */
export interface DriveItemDoc {
  ownerUid: string;
  kind: "folder" | "file";
  name: string;
  parentId: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  storagePath?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PaymentEventDoc {
  type: string;
  livemode: boolean;
  receivedAt: Timestamp;
}

export interface IntegrationDoc {
  provider: "google";
  googleEmail: string;
  refreshTokenEncrypted: string;
  scopes: string[];
  status: "connected" | "needs_reconnect";
  connectedAt: Timestamp;
}

export interface OAuthStateDoc {
  uid: string;
  expiresAt: Timestamp;
}

export interface NotificationDoc {
  uid: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  read: boolean;
  createdAt: Timestamp;
}

export interface AuditLogDoc {
  actorUid: string;
  action: string;
  targetType: string;
  targetId: string;
  schoolId?: string | null;
  before?: unknown;
  after?: unknown;
  createdAt: Timestamp;
}

/** A phone that receives push notifications for a user. Doc id: sha256 of the token. */
export interface PushTokenDoc {
  uid: string;
  token: string;
  platform: "android" | "ios";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const typed = <T>(name: string) =>
  db.collection(name) as FirebaseFirestore.CollectionReference<T, FirebaseFirestore.DocumentData>;

export const col = {
  users: () => typed<UserDoc>("users"),
  schools: () => typed<SchoolDoc>("schools"),
  classes: () => typed<ClassDoc>("classes"),
  classCodes: () => typed<{ classId: string }>("classCodes"),
  lessons: () => typed<LessonDoc>("lessons"),
  enrollments: () => typed<EnrollmentDoc>("enrollments"),
  flashcards: () => typed<FlashcardDoc>("flashcards"),
  quizzes: () => typed<QuizDoc>("quizzes"),
  readingTests: () => typed<ReadingTestDoc>("readingTests"),
  listeningTests: () => typed<ListeningTestDoc>("listeningTests"),
  progress: () => typed<ProgressDoc>("progress"),
  attempts: () => typed<AttemptDoc>("attempts"),
  liveSessions: () => typed<LiveSessionDoc>("liveSessions"),
  attendance: () => typed<AttendanceDoc>("attendance"),
  materials: () => typed<MaterialDoc>("materials"),
  materialViews: () => typed<MaterialViewDoc>("materialViews"),
  payments: () => typed<PaymentDoc>("payments"),
  paymentEvents: () => typed<PaymentEventDoc>("paymentEvents"),
  integrations: () => typed<IntegrationDoc>("integrations"),
  oauthStates: () => typed<OAuthStateDoc>("oauthStates"),
  notifications: () => typed<NotificationDoc>("notifications"),
  pushTokens: () => typed<PushTokenDoc>("pushTokens"),
  auditLogs: () => typed<AuditLogDoc>("auditLogs"),
  calls: () => typed<CallDoc>("calls"),
  driveItems: () => typed<DriveItemDoc>("driveItems"),
};

export const enrollmentId = (classId: string, uid: string) => `${classId}_${uid}`;
export const progressId = (uid: string, activityId: string) => `${uid}_${activityId}`;
export const attendanceId = (sessionId: string, uid: string) => `${sessionId}_${uid}`;
export const materialViewId = (materialId: string, uid: string) => `${materialId}_${uid}`;
