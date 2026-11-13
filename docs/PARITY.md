# Mobile ↔ Web parity audit (Phase 0)

Audited 2026-11-08, before any Phase 1–3 code change. Sources:

- Whole-file read of `apps/web/src`, `apps/api/src`, `packages/shared/src` and all 78 files of `apps/mobile/src`.
- Live, read-only Admin-SDK dump of Firestore project `nihongoclass-6342b` (collections, field union and types, enum values, accounts, deployed rules and indexes).
- The APK installed on the test phone (EAS build `0a18fa42`): manifest (`aapt2 dump`) and the embedded Expo config.

Status legend: **Present** = same data and actions as web. **Partial** = reachable but missing data/actions or rules. **Broken** = exists but fails or shows wrong data. **Missing** = no mobile equivalent.

---

## 1. Architecture as found

| | Web | Mobile (as found) |
|---|---|---|
| Firebase SDK | Auth only (`apps/web/src/lib/firebase.ts`, **Decision 17**: "No direct Firestore or Storage access from the browser… rules deny all client reads and writes", `docs/DECISIONS.md:23`) | Auth **plus Firestore**: `lib/me.js` (profile), `lib/classes.js` (teacher class list), `SignupScreen` (`setDoc users/{uid}`), `ChooseLevelScreen` (`updateDoc`) |
| Data | Everything through the Express API (`${VITE_API_URL}/api…`, Bearer ID token) | API for everything else (`lib/api.js`, ≈120 call sites) |
| Firebase project | `nihongoclass-6342b`, appId `1:1034700800367:web:b768…` | same (`app.json` extra) ✓ |
| API base | `http://localhost:3000` (same machine) | `http://192.168.100.177:3000` baked into the APK |
| `/me` | `GET /api/me`, query key `["me", uid]`, no retry on 4xx | Firestore mirror `lib/me.js` |
| Sign-out | `signOut` + `queryClient.clear()` | `signOut` only — cache kept |
| Firestore rules | committed: deny all | working tree: client reads of users/schools/integrations/classes/enrollments and a user create/update (added in earlier sessions, deployed) |

## 2. Root causes found

| # | Root cause | Evidence | Bugs it explains |
|---|---|---|---|
| R1 | **The installed APK cannot make plain-HTTP requests.** Release build (`assembleRelease`), `targetSdkVersion=34`, `<application>` has no `usesCleartextTraffic` and no `networkSecurityConfig`, so Android blocks every `http://` request. The API base is `http://192.168.100.177:3000`; calls (`ws://`) are blocked too. The phone's *browser* allows http, which is why `/api/health` loaded there while the app stayed empty. | `aapt2 dump xmltree` of the shipped APK; embedded `assets/app.config` | 1, 2, 3 and every API-backed screen |
| R2 | **Failed requests render as empty or default state.** ~25 screens use `q.data?.items ?? []` with no `isError` branch; several swallow errors (`catch {}`, `.catch(() => {})`). | mobile audit §2 | 1, 2, 3 |
| R3 | **Mobile reads a divergent copy of server logic instead of the API.** `lib/me.js` plan limits are wrong (calls 40 min / 24 h instead of 5 / 15 min, free storage 200 MB instead of 500 MB), adds a `schoolName` field the API does not send, has no `school.timeZone` default and does not block disabled accounts (the API answers 403 `account_disabled`). `lib/classes.js` omits `teachers[]` and swallows count errors. Signup/choose-level write Firestore instead of `POST /auth/register` / `PATCH /me`. | `lib/me.js:9-12`, `routes/auth.ts`, `services/plan.ts`, `constants.ts PLANS` | 3 |
| R4 | **Premium page derives "free" from a missing response.** `PremiumScreen` reads `plan` only from `GET /billing/premium`; when that fails, `!plan?.premium` is true → "Free" badge + "Upgrade — ₱299". | `PremiumScreen.js:17,33,65` | 3 |
| R5 | **Query cache is never cleared on sign-out** and keys are not uid-scoped, so the next account sees the previous account's data until a refetch succeeds. | `context/AuthContext.js signOut`, `App.js` | leak (Phase 4 check) |
| R6 | **File links point at the PC's localhost.** The API builds `${env.API_URL}/api/files/<ticket>` with `API_URL=http://localhost:3000`; on a phone that opens the phone itself. | `routes/drive.ts:189`, `routes/materials.ts:287` | opening any material/Drive file |
| R7 | **Field-name mismatches with the API DTOs.** Roster remove uses `item.userId` (DTO `uid`) → `DELETE …/roster/undefined`; People uses `item.id` (DTO `uid`) and `item.status` (DTO `disabled`/`privacyConsentAt`) → `PATCH/DELETE /users/undefined`; Join preview reads `teachers[].name` (DTO `string[]`), `archived`/`removed` (DTO `status`, `enrollment.status`); student class list renders `code`/`schoolName` (not in the student DTO); content-admin schools reads `timezone`/`status` (DTO `timeZone`, no status). | mobile audit §2 | wrong/blank data, broken actions |
| R8 | **Entitlement not re-read.** `me` reloads only on sign-in; no foreground refresh; a completed payment does not refresh `me` (web invalidates `["me"]` and `["billing"]`). | `PaymentPendingScreen.js`, `AuthContext.js` | 3 (after paying) |
| R9 | **Mock checkout is a web page on the PC** (`${APP_URL}/dev/mock-checkout/:id`) — unreachable from a phone, so the pay flow cannot be completed on mobile in mock mode. | `services/paymongo.ts:128` | pay-flow parity |
| R10 | *Found in Phase 4; introduced by the Phase 1 rewrite of `lib/api.js`, fixed before release.* **React Native's `URL` class implements almost nothing.** In RN 0.74, `URLSearchParams.set`, `URL.pathname` and `URL.host` throw "not implemented", and the class appends "/" to every URL. The rewritten `apiUrl()` copied web's `new URL()` + `searchParams.set`, so on a phone every API call with a query string (Self-Study lists, Progress filter, library lists, Drive folders, lesson flashcards) would fail with "Couldn't reach the server". The mock-checkout check and link labels would throw too. The browser build uses the browser's own `URL`, so none of this shows there. | RN's `Libraries/Blob/URL.js` run in Node against the app's code | would have broken every filtered list on a phone |

Things checked and **not** the cause: same collection paths and field names as the API (all root collections, no subcollections); same identity (doc id = Auth uid for all 22 users); no extra status filters; no missing composite index (62 deployed = 62 in file, all READY; all 27 multi-clause API queries covered); live rules = working-tree rules.

## 3. Table A — Firestore collections, fields, and where they are read/written

All data is in root collections; links are id fields. Web column = the API routes the web calls (web never touches Firestore). "Mobile (found)" = how the mobile app reached the same data before any fix.

| Collection (docs) | Fields (live dump; types) | Web reads via API | Web writes via API | Mobile (found) | Status |
|---|---|---|---|---|---|
| `users` (22) | role, name, email, schoolId∣null, studyLevel∣null, timeZone, privacyConsentAt∣null (ts), disabled (bool), createdAt (ts), premiumSince (ts, teachers), storageUsedBytes (num, teachers) | `GET /me`; `GET /schools/:id/users`; names in roster/reports/classes | `POST /auth/register`; `PATCH /me`; `POST /schools/:id/users`; `PATCH/DELETE /users/:uid`; `POST /schools`, `/schools/:id/admins`; join/roster (`schoolId`); payments (`premiumSince`); uploads (`storageUsedBytes`) | **Firestore** read of own doc (`lib/me.js`, wrong plan limits, no disabled block); **Firestore** `setDoc` at signup, `updateDoc` at choose-level; API `PATCH /me` in Profile; People actions hit `/users/undefined` | Broken |
| `schools` (2) | name, timeZone, extraTeacherSeats, createdAt | `GET /me` (school); `GET /schools/:id`; `GET /schools`; preview | `POST /schools`; `PATCH /schools/:id`; seat payments | **Firestore** read (`lib/me.js`, no timeZone default); API for settings and content-admin list (wrong field names) | Broken |
| `classes` (2) | schoolId, name, level, code, teacherIds[], status (active∣archived), createdBy, createdAt, updatedAt | `GET /classes`; `GET /classes/:id`; `GET /classes/preview` | `POST /classes`; `PATCH /classes/:id`; `DELETE /classes/:id` (archive); `POST /classes/:id/code` | teacher list **Firestore** (`lib/classes.js`); student/admin list API (blocked by R1, no error state); create only for admin; archive missing | Broken |
| `classCodes` (2) | classId | preview, join | create class, new code | via API | Present |
| `lessons` (4) | classId, title, order, description | `GET /classes/:id/lessons`, `GET /classes/:id/study` | `POST /classes/:id/lessons`; `PATCH /lessons/:id` (incl. `order`); `DELETE /lessons/:id` | API; reorder missing | Partial |
| `enrollments` (6) | classId, uid, schoolId, status (active∣removed), addedBy (self∣teacher∣admin), joinedAt, activatedAt | `GET /classes` (student branch), roster, counts, reports | `POST /classes/join`; `POST/DELETE /classes/:id/roster` | teacher counts **Firestore** (errors → 0); roster API (remove sends `undefined`) | Broken |
| `flashcards` (40) | term, reading, meaning, exampleSentence, audioUrl/Path/MimeType/FileName, expectedAudioName, importBatchId, source (builtin∣teacher), level, classId, lessonId, status (draft∣published), shuffleKey, createdBy, createdAt, updatedAt | `GET /classes/:id/flashcards`, `/classes/:id/study`, `/study/library`, `/library/flashcards` | `POST /classes/:id/flashcards` (+`/import`); `PATCH/DELETE /flashcards/:id`; `/library/flashcards…` (CRUD, audio, import, publish) | API; teacher side create-only | Partial |
| `quizzes` (4) | title, questions[{text, choices[4], correctIndex, audio…}], source, level, classId, lessonId, status, passingScorePct, shuffleKey, importBatchId, createdBy, createdAt, updatedAt | `GET /classes/:id/quizzes`, `/quizzes/:id`, study, activities, library | `POST /classes/:id/quizzes` (+`/import`); `PATCH/DELETE /quizzes/:id`; library | API; teacher side create-only | Partial |
| `readingTests` (2) | title, level, passage, questions[], status, passingScorePct, createdBy, createdAt, updatedAt | study, activities, library | library CRUD/publish | API | Present |
| `listeningTests` (1) | title, level, audioUrl/Path/MimeType/FileName, questions[], status, passingScorePct, createdBy, createdAt, updatedAt | study, activities, library | library CRUD/audio/publish | API | Present |
| `progress` (1) | uid, activityType, activityId, title, score, passed, submittedAt, bestScore, attemptCount, classId | `GET /progress/me`, study lists | `POST /activities/:type/:id/submit` | API | Partial (no error states) |
| `attempts` (1) | uid, activityId, activityType, title, classId, schoolId, answers[], correctCount, total, score, passed, submittedAt | `GET /progress/me`, reports | submit | API | Partial |
| `liveSessions` (3) | classId, schoolId, hostUid, title, description, startAt, endAt, provider (manual∣google), meetUrl, calendarEventId, inviteStudents, invitedEmails[], status (scheduled∣cancelled∣completed), reminderSentAt, createdAt, updatedAt | `GET /classes/:id/sessions`, preview, reports | `POST /classes/:id/sessions`; `PATCH/DELETE /sessions/:id`; check-in | API (no error states) | Partial |
| `attendance` (6) | sessionId, classId, uid, status (present∣late∣absent∣excused), joinedAt, source (join_click∣teacher∣system), updatedBy, updatedAt | `GET /sessions/:id/attendance`, sessions (`myAttendance`), reports | check-in; `PUT /sessions/:id/attendance` | API | Present |
| `materials` (1) | classId, schoolId, lessonId, sessionId, title, description, attachments[{id, kind, name, mimeType, sizeBytes, storagePath, url}], status, pinned, publishedAt, createdBy, createdAt, updatedAt | `GET /classes/:id/materials`, `GET /materials/:id`, reports | materials CRUD, attachments, publish | API; file open broken (R6) | Broken |
| `materialViews` (1) | materialId, classId, uid, firstViewedAt, lastViewedAt, viewCount | materials (`viewed`, `openedCount`), `GET /materials/:id/views`, reports | `POST /materials/:id/view` | API (view error swallowed); "Opened by" list missing | Partial |
| `payments` (2) | referenceNumber, uid, schoolId, purpose (premium∣teacher_seats), quantity, description, amountCentavos, currency, provider, status (pending∣paid∣needs_review∣expired∣refunded), checkoutSessionId, checkoutUrl, providerPaymentId, method, paidAt, createdAt, updatedAt | `GET /billing/premium`, `/billing/school`, `/payments/:id`, `/payments/:id/receipt` | checkouts; webhook/reconcile (server) | API; premium page wrong on failure (R4); school billing fabricates zero seats on error; receipts missing | Broken |
| `paymentEvents` (1) | type, livemode, receivedAt | — (server only) | webhook | — | n/a |
| `integrations` (0) | provider, googleEmail, refreshTokenEncrypted, scopes[], status, connectedAt | `GET /me` (`google`) | Google connect/callback/disconnect | **Firestore** read (`lib/me.js`); connect/disconnect via API | Broken (R3) |
| `oauthStates` (0) | uid, expiresAt | — | connect (server) | — | n/a |
| `notifications` (1) | uid, type, title, body, link, read, createdAt | `GET /notifications`, `/notifications/unread-count` | `POST /notifications/read` | API (no error state, read errors swallowed, no paging) | Partial |
| `auditLogs` (3) | actorUid, action, targetType, targetId, schoolId, before, after, createdAt | — | server only | — | n/a |
| `calls` (0) | classId, schoolId, hostUid, title, status, startedAt, endsAt, limitSeconds, endedAt, endedReason | calls API + WebSocket | start/end/extend | API + `ws://` (blocked by R1); extend not gated | Broken |
| `driveItems` (2) | ownerUid, kind (file∣folder), name, parentId, mimeType, sizeBytes, storagePath, createdAt, updatedAt | `GET /drive` | drive CRUD, upload, ticket | API (no error state, file open broken R6) | Broken |
| Storage objects | Supabase private bucket (materials, drive) via `/api/files/:ticket`; public bucket for built-in audio URLs | tickets | uploads | same URLs, but host wrong (R6) | Broken |

## 4. Table B — screens, routes and actions per role

### 4.1 Sign-in, onboarding and shared screens

| Web route / action | Mobile screen / action | Status | Gap |
|---|---|---|---|
| `/login` email + password, lockout | `LoginScreen` | Present | — |
| `/login` Google | `LoginScreen` Google | Broken | no OAuth client ids in `app.json`; first-time Google user has no profile path |
| `/signup` → `POST /auth/register {name, privacyConsent, timeZone}` | `SignupScreen` | Broken | writes Firestore directly (R3) |
| `/signup/finish` (profile missing) | — | Missing | no screen for 403 `profile_missing` |
| `/consent` → `PATCH /me {privacyConsent:true}` | — | Missing | admin-created teachers/admins never record consent |
| `/s/choose-level` → `PATCH /me {studyLevel}` | `ChooseLevelScreen` | Broken | writes Firestore directly (R3) |
| Guard: `/me` via API, disabled → error, wrong role → own home | `AppNavigator` + `lib/me.js` | Broken | Firestore `/me`, disabled accounts enter the app |
| Sign out clears cached data | `AuthContext.signOut` | Broken | R5 |
| `/reset-password` | `ResetPasswordScreen` | Present | — |
| Email verification banner | `EmailVerificationBanner` | Present | — |
| Notifications: list, show older, mark one/all read, open link | `NotificationsScreen` | Partial | no error state, swallowed read errors, no paging, links wrong for non-teachers |
| Unread badge | tab badges | Partial | school admin has no Notifications tab |
| Profile: name, time zone, study level, change password, sign out, ⭐ pill | `ProfileScreen` | Partial | server field errors not shown |
| `/payments/:id/return` (poll, refresh me+billing) | `PaymentPendingScreen` | Partial | does not refresh `me` (R8) |
| `/dev/mock-checkout/:id` | — | Missing | R9 |
| `/t/premium/receipts/:id`, `/a/billing/receipts/:id` | — | Missing | no receipt view |
| `/call/:callId` (WebSocket, extend, end, upsell) | `CallScreen` | Broken | `ws://` blocked (R1); plan from a swallowed API call; extend not gated; no premium upsell |
| Open material / Drive file (ticket URL) | `Linking.openURL(ticket.url)` | Broken | R6 |

### 4.2 Student

| Web route / action | Mobile | Status | Gap |
|---|---|---|---|
| `/s` dashboard: live-now, continue studying, streak/average/active classes, 3 upcoming sessions, 5 unviewed materials | `StudentDashboardScreen` | Broken | R1+R2; no live-now / upcoming sessions / unviewed materials |
| `/s/classes` (name, level, teacher names, archived badge) | `ClassesScreen` | Broken | **Bug 1**: R1+R2; renders absent `code`/`schoolName`; stale "join from web" copy |
| `/s/join` preview + join (archived / enrolled / removed states, upcoming sessions) | `JoinClassScreen` | Broken | R7 preview fields |
| `/s/classes/:id` header + archived alert + active call banner | `ClassDetailScreen` + `CallBanner` | Partial | check archived alert, banner |
| Lessons tab (flashcards, quizzes with best score / attempts / passed) | `class/LessonsTab` | Partial | no error state |
| Live tab (upcoming/past, attendance badge, add to calendar, join window, check-in) | `class/LiveTab` | Partial | no error state; check-in error swallowed |
| Materials tab (by lesson, pinned, New badge, preview/download, mark viewed) | `class/MaterialsTab` | Broken | R6; no error state; view error swallowed |
| `/s/study` (type, level switcher, decks, lists, paging) | `SelfStudyScreen`, `study/LibraryListScreen` | Partial | no error states; shuffle error swallowed |
| `/s/progress` (type filter, history paging) | `ProgressScreen` | Partial | no error state; no filter/paging |
| Activity player + results | `study/QuizPlayerScreen`, `ResultsScreen`, `PracticeWrongScreen` | Present | — |
| Flashcard decks (library paging, class deck) | `study/FlashcardPlayerScreen` | Present | — |
| — | `PomodoroScreen`, `KanaReferenceScreen` | mobile-only extras | kept |

### 4.3 Teacher

| Web route / action | Mobile | Status | Gap |
|---|---|---|---|
| `/t` dashboard: today/tomorrow sessions, recent results, materials not opened by everyone, ⭐ chip | `TeacherDashboardScreen` | Broken | **Bug 2**: Firestore list, no error state, wrong "admin creates classes" copy; summaries missing |
| `/t/classes` list (incl. archived) + **Create class** | `TeacherClassesScreen` | Broken | Firestore list; no create; no archived badge |
| Class header: code copy/share, new code, archived read-only | `TeacherClassDetailScreen`, `ClassEditorScreen` | Partial | check archived handling |
| Lessons: add, rename, reorder, delete | `TeacherClassDetailScreen` Lessons, `LessonEditorScreen` | Partial | no reorder; no error state |
| Flashcards: list, add, edit, delete, Excel import | `FlashcardEditorScreen` | Partial | create only |
| Quizzes: list, add, edit, delete, Excel import | `QuizEditorScreen` | Partial | create only |
| Roster: list (show removed), add by email, remove | Roster tab | Broken | R7 remove; no error state |
| Reports tab | — | Missing | — |
| Class settings (name, level) | `ClassEditorScreen` | Present | — |
| Live: schedule (repeat, Google/manual link), edit, cancel, attendance | Live tab, `SessionEditorScreen`, `AttendanceScreen` | Partial | no error state |
| Materials: list, pin, publish/unpublish, delete, "opened by", editor (upload, link, remove, save) | Materials tab, `MaterialEditorScreen`, `MaterialDetailScreen` | Partial | file open (R6); opened-by list |
| Start/join call banner (+ "Premium gives you 15 minutes" for free teachers) | `CallBanner` | Partial | premium hint |
| `/t/drive` (usage, upsell only when not premium, folders, upload, open, rename, move, delete) | `MyDriveScreen` | Broken | R6, no error state, move |
| `/t/premium` (manage state when premium, pay only when not, history, receipts, continue payment) | `PremiumScreen` | Broken | **Bug 3** (R4, R3, R8) |
| `/t/settings` profile + Google connection | `ProfileScreen`, `GoogleSettingsScreen` | Present | — |

### 4.4 School admin

| Web route / action | Mobile | Status | Gap |
|---|---|---|---|
| `/a` dashboard (totals, active classes, seats) | `SchoolAdminDashboardScreen` | Partial | no error state |
| `/a/classes` list (teachers, students, code, status) | `SchoolClassesScreen` | Partial | no error state; cards not tappable |
| Create class with teacher picker (non-disabled teachers) | `CreateClassScreen` | Partial | disabled teachers not filtered |
| Class workspace (lessons, live, materials, roster, reports, settings incl. reassign teachers, **archive**) | — | Missing | admin cannot open a class |
| `/a/people` teachers + students, search, add teacher (seat limit → buy), edit name, resend invite, remove | `PeopleScreen` | Broken | R7 (`/users/undefined`); students list/search |
| `/a/reports` | `ReportsScreen` | Present | — |
| `/a/billing` seats, buy packs (1–20), history with payer, receipts | `SchoolBillingScreen` | Broken | fabricates zero seats on error; hardcoded price; receipts |
| `/a/settings` school name/time zone + Google | `SchoolSettingsScreen` | Partial | no error state; Google card |
| `/a/notifications` | — | Missing | no tab |
| `/a/profile` | `ProfileScreen` | Present | — |

### 4.5 Content admin

| Web route / action | Mobile | Status | Gap |
|---|---|---|---|
| `/c` library overview | `ContentAdminDashboardScreen` | Partial | no error state |
| Lists ×4 (level + status filter, publish/unpublish, delete, paging) | `LibraryEditorScreen`, `Library{Quiz,Reading,Listening}ListScreen` | Partial | no error states |
| Editors (fields, audio upload/remove; web can also record) | `Library*EditorScreen` | Partial | record → upload is the mobile equivalent |
| Excel import → review (attach audio by file name) → publish batch | `LibraryImportScreen` | Partial | review/attach step |
| `/c/schools` list, create school + admin invite, add admin, resend invite, remove admin | `ContentAdminSchoolsScreen` | Broken | R7 field names; invite error swallowed |
| `/c/profile` | `ProfileScreen` | Present | — |
| — | Notifications tab | mobile-only | web has none for content admin |
| — | `content/SchoolsListScreen.js` | orphaned | not registered; wrong fields |

## 5. Table C — roles (from `ROLES` in `packages/shared/src/constants.ts`)

| Role | Web can see / do | Mobile as found | Premium |
|---|---|---|---|
| student | dashboard, classes (join, lessons, live + check-in, materials, calls), self-study, progress, notifications, profile, choose level | same areas exist, but every API screen fails in the APK (R1) and shows empty (R2); join preview broken; files can't open | none (web has no student premium; `me.plan = null`) |
| teacher | dashboard, full class workspace (lessons/content CRUD + import, live, materials, roster, reports, settings, calls), Drive, Premium + receipts, notifications, settings + Google | class list via Firestore; no create class, no reports tab, content create-only, roster remove broken, Drive/material files can't open, Premium page shows Upgrade to premium teachers | `users.premiumSince` (teacher only, never expires) |
| school_admin | dashboard, classes (create with teacher picker, open workspace, archive), people (teachers + students), reports, billing + receipts, notifications, settings + Google, profile | dashboard, list, create, people (actions broken), reports, billing (fabricates seats on error), settings; no class workspace, no notifications | none (buys teacher seats) |
| content_admin | library overview, 4 lists, editors with audio, import review, schools, profile | overview, lists, editors, import, schools (wrong fields), notifications (extra) | none |

## 6. Decisions (made on the owner's behalf, matching what web does)

| # | Decision | Why |
|---|---|---|
| D1 | Mobile follows **Decision 17** exactly like web: Firebase SDK for Auth only, every read and write through the same API endpoints and DTOs. `lib/me.js` and `lib/classes.js` are removed; signup uses `POST /auth/register`, choose-level uses `PATCH /me`. | Web already works this way; one implementation of every business rule; no duplicated DTO logic to drift. |
| D2 | Firestore rules return to the committed deny-all. The client permissions added in earlier sessions (users/schools/integrations/classes/enrollments) are removed. | Decision 17; "nothing more than each role needs" — with D1 the mobile client needs no Firestore access. |
| D3 | Android may use cleartext **only** to the host in `app.json extra.apiUrl` (plus `localhost`/`10.0.2.2` for emulators), through a generated network security config. An `https` API URL gets no cleartext at all. | R1, without allowing cleartext to arbitrary hosts. |
| D4 | File-ticket URLs are built from the origin the client used (`req.protocol` + `Host`, `trust proxy` already on) instead of `env.API_URL`. Web is unchanged (it calls `localhost:3000`). | R6. |
| D5 | Premium state on mobile comes from `me.plan` (`GET /me`, source of truth `users.premiumSince`); the pay button renders only after a successful read says not premium; failures show an error, never "Free". | R4; mirrors `PremiumPage.tsx`. |
| D6 | Features web has but a phone cannot do the same way get the closest working equivalent: recording audio → upload a file; Excel import → pick a file; browser redirect after payment → in-app polling; mock checkout page → in-app mock checkout screen. | Phase 2 rule. |
| D7 | Decided in Phases 2–4. The mobile app builds and reads URLs as plain strings (`lib/url.js`), never with the `URL` class. | R10. |
| D8 | Decided in Phases 2–4. Code that web takes from `packages/shared` is copied into `apps/mobile/src/shared` (constants, money, time). `packages/shared/test/mobile-mirror.test.ts` fails when a copy gives a different answer. | An EAS build uploads only `apps/mobile`, so the app can't import the package. |
| D9 | Decided in Phases 2–4. The invented Privacy Policy and Terms screens are removed. About shows web's privacy notice word for word. | They held legal text (retention periods, response times, age limits) that web doesn't have. |

## 7. Status after Phases 1–3

Every row of Table B, as it stands now. Each row was checked in the app against web with a real account of that role; see [`PARITY-CHECKLIST.md`](PARITY-CHECKLIST.md). "Equivalent" marks the closest working version of something a phone can't do the way web does.

### 7.1 Sign-in, onboarding and shared screens

| Web | Mobile now | Status |
|---|---|---|
| Login with email and password, lockout | `LoginScreen` (demo-account hint removed) | Present |
| Login with Google | `LoginScreen` | Needs an Android OAuth client (final report). The button says so until then. |
| `/signup` → `POST /auth/register` | `SignupScreen` → `registerProfile` | Present |
| `/signup/finish` | `FinishSignupScreen` (shown on 403 `profile_missing`) | Present |
| `/consent` | `ConsentScreen` (shown when `privacyConsentAt` is empty) | Present |
| `/s/choose-level` → `PATCH /me` | `ChooseLevelScreen` | Present |
| Guard order: `/me` from the API, disabled account, missing profile | `AppNavigator` follows web's order | Present |
| Sign-out clears cached data | `signOut` clears the query cache; the cache also clears whenever the user id changes | Present |
| Reset password, email verification banner | unchanged | Present |
| Notifications: list, show older, mark one or all read, open link | `NotificationsScreen`, links routed per role (`lib/notificationLink.js`) | Present |
| Unread badge | every role that has the page on web | Present |
| Profile, including server field errors | `ProfileScreen`. The time zone is typed with common picks. | Equivalent: Hermes has no `Intl.supportedValuesOf`, and the API validates the zone. |
| `/payments/:id/return` | `PaymentPendingScreen`: polls, refreshes `me` and billing | Present |
| `/dev/mock-checkout/:id` | `MockCheckoutScreen` (in the app) | Equivalent: the web page lives on the PC. |
| Receipts | `ReceiptScreen` | Equivalent: Share instead of Print. |
| `/call/:callId` | `CallScreen`: WebSocket from the API address, extend only with Premium, upsell, end for everyone | Present |
| Open a material or Drive file | `lib/files.js`: the ticket URL uses the address the app used | Present |

### 7.2 Student

| Web | Mobile now | Status |
|---|---|---|
| Dashboard | `StudentDashboardScreen` | Present |
| Classes list (Bug 1) | `ClassesScreen` | Present |
| Join with a code | `JoinClassScreen` | Present |
| Class page: archived notice, call banner | `ClassDetailScreen`, `CallBanner` | Present |
| Lessons, Live classes, Materials tabs | `student/class/*` | Present |
| Self-Study | `SelfStudyScreen` | Present |
| Progress | `ProgressScreen` (plus a mobile-only activity grid built from the same data) | Present |
| Activity player, results, flashcard decks | `student/study/*` | Present |

### 7.3 Teacher

| Web | Mobile now | Status |
|---|---|---|
| Dashboard (Bug 2) | `TeacherDashboardScreen` | Present |
| Class list (archived included) and Create class | `TeacherClassesScreen`, `CreateClassScreen` | Present |
| Class header: code, new code, archived = read-only | `TeacherClassDetailScreen` | Equivalent: "Share class code" instead of "Copy join link", because the app doesn't know the web address. |
| Lessons: add, rename, reorder, delete | `workspace/LessonsTab`, `LessonDialog`, `LessonDetailScreen` | Equivalent: up and down buttons instead of drag. |
| Flashcards and quizzes: add, edit, delete | `FlashcardEditorScreen`, `QuizEditorScreen` | Present |
| Excel import | `ContentImportScreen`: pick an .xlsx, upload, see skipped rows | Equivalent: the template's columns are shown in the app, because there's no download module to save it. |
| Roster | `workspace/RosterTab` (remove uses `uid`) | Present |
| Reports | `workspace/ReportsTab` | Present |
| Class settings | `workspace/SettingsTab` | Present |
| Live classes, schedule, attendance | `workspace/LiveTab`, `SessionEditorScreen`, `AttendanceScreen` | Equivalent: date and time are typed as `YYYY-MM-DD` / `HH:mm`, because there's no picker library. |
| Materials, "Opened by", editor | `workspace/MaterialsTab`, `MaterialViewsScreen`, `MaterialEditorScreen` | Equivalent: uploads show "Uploading…" instead of a percentage. |
| Call banner and Premium hint | `CallBanner` | Present |
| Drive | `MyDriveScreen` | Present |
| Premium (Bug 3) | `PremiumScreen` | Present |
| Settings and Google | `ProfileScreen`, `GoogleSettingsScreen` | Equivalent: Google sign-in opens in the browser, and the app re-reads `/me` when you return. |

### 7.4 School admin

| Web | Mobile now | Status |
|---|---|---|
| Dashboard | `SchoolAdminDashboardScreen` | Present |
| Classes list | `TeacherClassesScreen` (admin view, with teacher names) | Present |
| Create a class with the teacher picker | `CreateClassScreen` (disabled teachers left out) | Present |
| Class workspace, including reassigning teachers and archiving | the same screens as teachers (`STAFF_CLASS_SCREENS`) | Present |
| People | `PeopleScreen` | Present |
| Reports, Billing and receipts, Settings and Google, Notifications, Profile | `ReportsScreen`, `SchoolBillingScreen`, `SchoolSettingsScreen`, `NotificationsScreen`, `ProfileScreen` | Present |

### 7.5 Content admin

| Web | Mobile now | Status |
|---|---|---|
| Library overview, the 4 lists | `LibraryOverviewScreen`, `LibraryListScreen` | Present |
| Editors with audio | `LibraryEditorScreens`, `AudioField` | Equivalent: pick an audio file instead of recording one. |
| Excel import → review → publish | `LibraryImportScreen`, `ImportReviewScreen` | Present |
| Schools | `SchoolsScreen` | Present |
| Notifications tab (mobile-only, web has none) | removed | Matches web |

