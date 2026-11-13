// Copy of packages/shared/src/constants.ts. The mobile app can't import
// @nihongo/shared (an EAS build uploads only apps/mobile), so it keeps this copy;
// packages/shared/test/mobile-mirror.test.ts fails if the two drift apart.

export const ROLES = ["student", "teacher", "content_admin", "school_admin"];

export const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"];

/** Level accents (§13). Marks only; text beside them is always --ink. */
export const LEVEL_ACCENTS = {
  N5: "#3E9E75",
  N4: "#3B82B8",
  N3: "#A67A00",
  N2: "#7B6BB5",
  N1: "#8E3B46",
};

export const CONTENT_SOURCES = ["builtin", "teacher"];
export const CONTENT_STATUSES = ["draft", "published"];
export const ACTIVITY_TYPES = ["quiz", "reading", "listening"];
export const LIBRARY_TYPES = ["flashcards", "quizzes", "reading-tests", "listening-tests"];
export const CLASS_STATUSES = ["active", "archived"];
export const ENROLLMENT_STATUSES = ["active", "removed"];
export const ENROLLMENT_ADDED_BY = ["self", "teacher", "admin"];
export const SESSION_STATUSES = ["scheduled", "cancelled", "completed"];
export const SESSION_PROVIDERS = ["google", "manual"];
export const ATTENDANCE_STATUSES = ["present", "late", "absent", "excused"];
export const ATTENDANCE_SOURCES = ["join_click", "teacher", "system"];
export const MATERIAL_STATUSES = ["draft", "published"];
export const PAYMENT_PURPOSES = ["teacher_seats", "premium"];
export const PAYMENT_PROVIDERS = ["paymongo"];
export const PAYMENT_STATUSES = ["pending", "paid", "needs_review", "expired", "refunded"];

/** Plans and prices. The server reads the same values, so the client never decides an amount or a limit. */
export const PLANS = {
  freeTeacherSeats: 5,
  seatPackSize: 5,
  seatPackPriceCentavos: 29_900,
  maxSeatPacksPerPurchase: 20,
  premiumPriceCentavos: 29_900,
  freeCallSeconds: 5 * 60,
  premiumCallSeconds: 15 * 60,
  callMaxParticipants: 8,
  freeStorageBytes: 500 * 1024 * 1024,
  premiumStorageBytes: 1024 * 1024 * 1024,
};

export const CALL_STATUSES = ["active", "ended"];

/** FR-3.2.2: unambiguous alphabet, no 0, O, 1, I, L. */
export const CLASS_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CLASS_CODE_LENGTH = 6;

export const DEFAULT_PASSING_SCORE_PCT = 60;
export const DEFAULT_TIME_ZONE = "Asia/Manila";

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
};

export const AUDIO_FILE_TYPES = [
  { ext: "mp3", mime: "audio/mpeg", label: "MP3" },
  { ext: "m4a", mime: "audio/mp4", label: "M4A" },
  { ext: "mp4", mime: "audio/mp4", label: "M4A" },
  { ext: "wav", mime: "audio/wav", label: "WAV" },
  { ext: "ogg", mime: "audio/ogg", label: "OGG" },
  { ext: "webm", mime: "audio/webm", label: "WebM" },
];

export const MATERIAL_FILE_TYPES = [
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

export const FLASHCARD_HEADERS = ["Term", "Reading", "Meaning", "Example Sentence"];
export const QUIZ_HEADERS = ["Question", "Option A", "Option B", "Option C", "Option D", "Correct Option"];
export const AUDIO_FILE_HEADER = "Audio File Name";
