export const ROLES = ["student", "teacher", "content_admin", "school_admin"] as const;
export type Role = (typeof ROLES)[number];

export const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type JlptLevel = (typeof JLPT_LEVELS)[number];

/** Level accents (§13). Marks only; text beside them is always --ink. */
export const LEVEL_ACCENTS: Record<JlptLevel, string> = {
  N5: "#3E9E75",
  N4: "#3B82B8",
  N3: "#A67A00",
  N2: "#7B6BB5",
  N1: "#8E3B46",
};

export const CONTENT_SOURCES = ["builtin", "teacher"] as const;
export type ContentSource = (typeof CONTENT_SOURCES)[number];

export const CONTENT_STATUSES = ["draft", "published"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const ACTIVITY_TYPES = ["quiz", "reading", "listening"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const LIBRARY_TYPES = ["flashcards", "quizzes", "reading-tests", "listening-tests"] as const;
export type LibraryType = (typeof LIBRARY_TYPES)[number];

export const CLASS_STATUSES = ["active", "archived"] as const;
export type ClassStatus = (typeof CLASS_STATUSES)[number];

export const ENROLLMENT_STATUSES = ["active", "removed"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_ADDED_BY = ["self", "teacher", "admin"] as const;
export type EnrollmentAddedBy = (typeof ENROLLMENT_ADDED_BY)[number];

export const SESSION_STATUSES = ["scheduled", "cancelled", "completed"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_PROVIDERS = ["google", "manual"] as const;
export type SessionProvider = (typeof SESSION_PROVIDERS)[number];

export const ATTENDANCE_STATUSES = ["present", "late", "absent", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_SOURCES = ["join_click", "teacher", "system"] as const;
export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number];

export const MATERIAL_STATUSES = ["draft", "published"] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

/** What a payment buys. Classes are free; schools and teachers pay for these. */
export const PAYMENT_PURPOSES = ["teacher_seats", "premium"] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export const PAYMENT_PROVIDERS = ["paymongo"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATUSES = ["pending", "paid", "needs_review", "expired", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Plans and prices. The server reads these too, so the client never decides
 * an amount or a limit.
 */
export const PLANS = {
  /** Every school gets this many teachers for free. */
  freeTeacherSeats: 5,
  /** Teacher slots come in packs of 5 for a one-time payment. */
  seatPackSize: 5,
  seatPackPriceCentavos: 29_900,
  maxSeatPacksPerPurchase: 20,
  /** Teacher Premium is a one-time payment that never expires. */
  premiumPriceCentavos: 29_900,
  /** In-app video calls: 5 minutes free, 15 minutes with Premium. */
  freeCallSeconds: 5 * 60,
  premiumCallSeconds: 15 * 60,
  callMaxParticipants: 8,
  /** My Drive plus uploaded class materials. */
  freeStorageBytes: 500 * 1024 * 1024,
  premiumStorageBytes: 1024 * 1024 * 1024,
} as const;

export const CALL_STATUSES = ["active", "ended"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

/** FR-3.2.2: unambiguous alphabet, no 0, O, 1, I, L. */
export const CLASS_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CLASS_CODE_LENGTH = 6;

/** Decision 4. */
export const DEFAULT_PASSING_SCORE_PCT = 60;
/** Decision 5. */
export const DEFAULT_TIME_ZONE = "Asia/Manila";

/** FR-3.11.7 / FR-3.11.8 */
export const JOIN_OPENS_MINUTES_BEFORE = 15;
export const LATE_AFTER_MINUTES = 10;

export const LIMITS = {
  importMaxRows: 500,
  importMaxBytes: 5 * 1024 * 1024,
  audioMaxBytes: 10 * 1024 * 1024,
  materialMaxAttachments: 10,
  materialDefaultMaxFileMb: 25,
  pageSize: 50,
  batchSize: 500,
  maxRepeatWeeks: 26,
} as const;

export interface FileTypeSpec {
  ext: string;
  mime: string;
  label: string;
}

/** §7.5 audio: mp3, m4a, wav, ogg, webm. */
export const AUDIO_FILE_TYPES: FileTypeSpec[] = [
  { ext: "mp3", mime: "audio/mpeg", label: "MP3" },
  { ext: "m4a", mime: "audio/mp4", label: "M4A" },
  { ext: "mp4", mime: "audio/mp4", label: "M4A" },
  { ext: "wav", mime: "audio/wav", label: "WAV" },
  { ext: "ogg", mime: "audio/ogg", label: "OGG" },
  { ext: "webm", mime: "audio/webm", label: "WebM" },
];

/** FR-3.12.2 allowed material files. Decision 12: no audio or video. */
export const MATERIAL_FILE_TYPES: FileTypeSpec[] = [
  { ext: "pdf", mime: "application/pdf", label: "PDF" },
  { ext: "doc", mime: "application/msword", label: "Word" },
  { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word" },
  { ext: "ppt", mime: "application/vnd.ms-powerpoint", label: "PowerPoint" },
  { ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "PowerPoint" },
  { ext: "xls", mime: "application/vnd.ms-excel", label: "Excel" },
  { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel" },
  { ext: "txt", mime: "text/plain", label: "Text" },
  { ext: "jpg", mime: "image/jpeg", label: "JPEG image" },
  { ext: "jpeg", mime: "image/jpeg", label: "JPEG image" },
  { ext: "png", mime: "image/png", label: "PNG image" },
  { ext: "webp", mime: "image/webp", label: "WebP image" },
];

export const MEET_URL_PATTERN = /^https:\/\/meet\.google\.com\/[A-Za-z0-9-]+(\?[^\s]*)?$/;

/** Excel template headers (FR-3.3.2, FR-3.4.2, FR-3.5.3). */
export const FLASHCARD_HEADERS = ["Term", "Reading", "Meaning", "Example Sentence"] as const;
export const QUIZ_HEADERS = ["Question", "Option A", "Option B", "Option C", "Option D", "Correct Option"] as const;
export const AUDIO_FILE_HEADER = "Audio File Name";
