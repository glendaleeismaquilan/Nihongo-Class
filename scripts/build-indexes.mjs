// Writes firestore.indexes.json: one composite index for every multi-field
// query the API runs (§6). Run `node scripts/build-indexes.mjs` after adding a query.
import { writeFileSync } from "node:fs";

const A = "ASCENDING";
const D = "DESCENDING";
const f = (fieldPath, order = A) => (order === "CONTAINS" ? { fieldPath, arrayConfig: "CONTAINS" } : { fieldPath, order });

/** [collection, ...[field, order]] */
const Q = [
  ["users", ["schoolId"], ["role"]],
  ["enrollments", ["uid"], ["status"]],
  ["enrollments", ["classId"], ["status"]],
  ["enrollments", ["schoolId"], ["status"]],
  ["lessons", ["classId"], ["order"]],

  // Teacher content
  ["flashcards", ["classId"], ["createdAt"]],
  ["flashcards", ["classId"], ["lessonId"], ["createdAt"]],
  ["flashcards", ["classId"], ["source"], ["createdAt"]],
  ["quizzes", ["classId"], ["createdAt"]],
  ["quizzes", ["classId"], ["lessonId"], ["createdAt"]],
  ["quizzes", ["classId"], ["source"], ["createdAt"]],

  // Library (Content Admin) lists, newest first, and import batches in file order
  ...["flashcards", "quizzes"].flatMap((c) => [
    [c, ["source"], ["createdAt", D]],
    [c, ["source"], ["level"], ["createdAt", D]],
    [c, ["source"], ["status"], ["createdAt", D]],
    [c, ["source"], ["level"], ["status"], ["createdAt", D]],
    [c, ["source"], ["importBatchId"], ["createdAt"]],
    [c, ["source"], ["importBatchId"], ["status"]],
    [c, ["importBatchId"], ["status"]],
    [c, ["source"], ["level"], ["status"]],
    // Self-Study (published, by level) and random decks from a shuffleKey start
    [c, ["source"], ["level"], ["status"], ["createdAt"]],
  ]),
  ["flashcards", ["source"], ["level"], ["status"], ["shuffleKey"]],
  ...["readingTests", "listeningTests"].flatMap((c) => [
    [c, ["level"], ["createdAt", D]],
    [c, ["status"], ["createdAt", D]],
    [c, ["level"], ["status"], ["createdAt", D]],
    [c, ["level"], ["status"], ["createdAt"]],
    [c, ["level"], ["status"]],
  ]),

  // Progress
  ["progress", ["uid"], ["submittedAt", D]],
  ["attempts", ["uid"], ["submittedAt", D]],
  ["attempts", ["uid"], ["activityType"], ["submittedAt", D]],
  ["attempts", ["uid"], ["activityId"]],

  // Live classes
  ["liveSessions", ["classId"], ["startAt"]],
  ["liveSessions", ["classId"], ["status"], ["startAt"]],
  ["liveSessions", ["status"], ["endAt"]],
  ["liveSessions", ["status"], ["startAt"]],

  // Materials
  ["materials", ["classId"], ["status"]],

  // Payments
  ["payments", ["uid"], ["classId"], ["status"]],
  ["payments", ["uid"], ["createdAt", D]],
  ["payments", ["schoolId"], ["createdAt", D]],
  ["payments", ["schoolId"], ["classId"], ["createdAt", D]],
  ["payments", ["schoolId"], ["status"]],
  ["payments", ["status"], ["provider"], ["createdAt"]],

  // Notifications
  ["notifications", ["uid"], ["createdAt", D]],
  ["notifications", ["uid"], ["read"]],
  ["classes", ["schoolId"], ["status"]],
];

const indexes = Q.map(([collectionGroup, ...fields]) => ({
  collectionGroup,
  queryScope: "COLLECTION",
  fields: fields.map(([name, order]) => f(name, order ?? A)),
}));

const seen = new Set();
const unique = indexes.filter((i) => {
  const key = JSON.stringify(i);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

writeFileSync(new URL("../firestore.indexes.json", import.meta.url), JSON.stringify({ indexes: unique, fieldOverrides: [] }, null, 2) + "\n");
console.log(`wrote ${unique.length} composite indexes`);
