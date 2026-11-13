# Mobile parity checklist (Phase 4)

Walked 2026-11-08 and 2026-11-09, after the Phase 1–3 fixes. Each screen was compared side by side with the web app signed in as the same account. The audit and the root causes are in [`PARITY.md`](PARITY.md).

**PASS** = mobile shows the same data and actions as web, read from the same API. **FAIL** = it doesn't. **NOT RUN** = couldn't be checked here; the reason is given.

## How it was checked

- **Data.** A local copy of the live Firebase project (`nihongoclass-6342b`), taken read-only with the Admin SDK: 107 documents and 22 accounts, loaded into the Firebase emulators (Auth, Firestore, Storage). The demo accounts get the seed password from `apps/api/seed/seed.ts`. Every other account gets a random password, so real users' accounts can't be signed into.
- **Apps.** The same API code ran against the emulators on port 3001. The web app (`apps/web`) ran on 5174. The mobile app's own source (`apps/mobile`, react-native-web, phone size 375 × 812) ran on 8081. Both apps used that API.
- **Accounts.**

  | Role | Account |
  |---|---|
  | Student | `ana@demo.nihongo` |
  | Premium teacher | `tanaka@demo.nihongo` |
  | Free teacher | `sato@demo.nihongo` |
  | School admin | `admin@demo.nihongo` |
  | Content admin | `content@demo.nihongo` |

- **Android-only behaviour.** The browser can't show this, so it was checked separately; see [Android-only checks](#android-only-checks).

## Bugs 1–3

| Bug | Root cause | Fix | Re-test | Result |
|---|---|---|---|---|
| 1. Student sees no classes | The installed APK blocks every plain-HTTP request (R1), and the class list showed a failed request as an empty list (R2). | A generated network security config allows HTTP only to the API host; every list has an error state. | Ana's list matched web: N5 Saturday Class, and also the teacher session's test class while she was enrolled in it. | PASS |
| 2. Teacher sees no classes | Same as Bug 1. In addition, the teacher list read Firestore directly through `lib/classes.js`, and that file swallowed its errors (R3). | The list uses `GET /classes`, the same as web. | Tanaka's and Sato's lists matched web: classes, levels, counts, codes, and the Archived status. | PASS |
| 3. Premium account sees pay/upgrade | The Premium page treated a failed `/billing/premium` request as "Free" (R4). `me` came from a Firestore copy with the wrong plan logic (R3) and was never re-read (R8). | The plan comes from `GET /me`. The pay button appears only after a successful read says not premium. `me` is re-read when the app returns to the foreground and after a payment. | Tanaka sees "Premium, Lifetime" with no pay button. Sato sees "Go Premium for ₱299.00". After paying (mock checkout), Sato sees "Premium ✓" and no pay button. | PASS |

## Student (ana@demo.nihongo)

| Check | Result |
|---|---|
| Classes list is non-empty and the same as web | PASS |
| Home: welcome, "Continue studying", streak 1 day, average 20%, 1 class, next live class, "Join opens at 8:45 AM". Same wording as web. | PASS |
| Class › Lessons | PASS |
| Class › Live classes: upcoming and past, the "Late" attendance badge, Add to Google Calendar, when Join opens | PASS |
| Class › Materials: grouped by lesson, Preview / Download, link. The Preview ticket comes back as `http://<the host the app used>/api/files/…` (R6 fixed). | PASS |
| Join a class by code: preview shows school, level, teacher and the upcoming live class, with "Open class" for an enrolled student | PASS |
| Self-Study: flashcards (10 N5 cards) and quizzes (best 20%, Try again) | PASS |
| Progress: streak, average, attempts, history row. Mobile also shows a 35-day activity grid built from the same attempts; it's a mobile extra kept from the original app. | PASS |
| Notifications: same 7 items, same order and text. The unread badge uses the same endpoint and 60-second refresh as web. | PASS |
| Profile: name, level and time zone hold the same values as web | PASS |
| No pay or upgrade anywhere (students have no plan) | PASS |

## Teacher with Premium (tanaka@demo.nihongo)

| Check | Result |
|---|---|
| Home: ⭐ Premium, live classes today and tomorrow, recent results, materials not opened by everyone. Same wording as web. | PASS |
| Classes list is the same as web | PASS |
| Class header: code, New code, Share class code, "Up to 8 people, 15 minutes." | PASS |
| Lessons and lesson detail (6 flashcards and 1 quiz; 6 flashcards and 0 quizzes) | PASS |
| Edit a flashcard on mobile: PATCH 200, list refreshes, web shows the change, then reverted | PASS |
| Live classes: upcoming row (Open Meet, Edit, Cancel), past row (Attendance) | PASS |
| Materials and "Opened by 1 of 3": same names and dates as web's dialog | PASS |
| Roster: same three students. Remove from mobile sends `DELETE /roster/<uid>` and gets 204 (R7 fixed: it was `/roster/undefined`). "Show removed students (1)" appears. Add by email: 201. | PASS |
| Reports: every figure is the same as web (3 students, 0 attempts, 67%, per student, per live class, materials) | PASS |
| Class settings (teacher): name, level, "Only your School Admin can assign teachers." | PASS |
| Drive: "2 KB of 1 GB used", Premium, no upsell. Folder contents are the same as web. New folder (201) and Delete (204) from mobile work. | PASS |
| Premium: Lifetime since Oct 29, 2026, feature table, payment history, no pay button. Receipt matches web (Share instead of Print). | PASS |
| Notifications: same empty state as web (Tanaka has none in the data) | PASS |
| Profile and Google Calendar card: same text as web | PASS |

## Teacher on the free plan (sato@demo.nihongo)

| Check | Result |
|---|---|
| Home and Classes: his own class (N4 Evening Class, N4EVE7), no Premium chip | PASS |
| Call banner: "Up to 8 people, 5 minutes. Premium gives you 15 minutes." | PASS |
| Drive: "0 B of 500 MB used", "Get 1 GB with Premium" | PASS |
| Premium: Free, "Go Premium for ₱299.00", "No payments yet." | PASS |
| Paying: Go Premium → in-app mock checkout → Pay → "You're on Premium" → the tab shows "Premium ✓" and the pay button is gone (first walk) | PASS |

## School admin (admin@demo.nihongo)

| Check | Result |
|---|---|
| Home: 6 active students in 2 active classes, teacher slots 4 of 5, attendance 33%, per-class rows. Same as web. | PASS |
| Classes: every class with its teachers, students, code and status | PASS |
| Open a class workspace (was Missing): same tabs as web, plus the teacher picker and Archive in settings | PASS |
| Reassign teachers on mobile: PATCH 200, web shows "Hiroshi Sato, Yuki Tanaka", then reverted | PASS |
| Create a class with the teacher picker: lands on the new class's workspace with its code | PASS |
| Archive on mobile: DELETE 204, listed as Archived, read-only (archived notice, no New code, Start call or Add lesson). Same as web. | PASS |
| People, Reports, Billing (seats, history, receipts), Notifications, Profile, School settings (first walk) | PASS |

## Content admin (content@demo.nihongo)

| Check | Result |
|---|---|
| Library overview: counts per level and type, drafts | PASS |
| N5 flashcards list, filtered by level through the query string: all 11 items, including the draft "電車, Needs densha.mp3". Same as the API. | PASS |
| Schools list (first walk) | PASS |

## Premium and entitlements

| Check | Result |
|---|---|
| **Source of truth.** `users/{uid}.premiumSince` is set once, when a premium payment is marked paid (`applyPaidPayment`). Non-null means premium. Premium never expires, so there is no expiry to handle. The API turns it into `me.plan`: `premium`, `callLimitSeconds`, `storageLimitBytes`. | — |
| Mobile reads `me.plan` from `GET /me`, the same as web. It re-reads it when the app comes back to the foreground and after a payment. | PASS |
| Premium never sees pay: the Premium tab shows the manage state; "Continue payment" is hidden for a premium purchase; the payment screen's "continue" is hidden too | PASS |
| Back can't return to the pay flow: after paying, the mock checkout replaces itself with the payment screen | PASS |
| A deep link to the Premium page shows the manage state. The API also refuses a new premium checkout with 409 `already_premium`. | PASS |
| Non-premium sees pay | PASS |
| **Non-premium can't get premium-only features.** Checked against the API with each teacher's own token. Sato: 300-second calls, extend refused with 402 `premium_required`, storage limit 524,288,000 bytes. Tanaka: 900-second calls, 1,073,741,824 bytes. | PASS |

## Switching accounts (no data leaks)

| Switch on the same device | Result |
|---|---|
| Ana → Tanaka: teacher tabs, only Tanaka's classes and Drive | PASS |
| Tanaka → Sato: Sato's class only, an empty Drive (no Tanaka folder), the Free plan | PASS |
| Sato → admin → content admin: each shows only its own role's tabs and data | PASS |

## Android-only checks

| Check | Result |
|---|---|
| **React Native's own URL class** (RN 0.74, run in Node) breaks the app on a phone: `URLSearchParams.set`, `URL.pathname` and `URL.host` throw "not implemented". Every API call with a query string failed (R10), even though the browser build worked. After the fix, 23 checks run with RN's URL as the global: query strings decode to the same values as web's, and host and path match the standard URL. | PASS |
| Android bundle compiles to Hermes bytecode (`expo export --platform android`: 969 modules, 3.27 MB) | PASS |
| No browser-only APIs left in the app's code (Intl features Hermes lacks are guarded, no DOM, no Blob/File) | PASS |
| The cleartext network config (only the API host, localhost, 127.0.0.1, 10.0.2.2) is in the generated Android project (prebuild) | PASS |
| The built APK (EAS build `dc021f9e`, 0.1.0): the manifest's `networkSecurityConfig` allows cleartext only to `192.168.100.177`, `localhost`, `127.0.0.1` and `10.0.2.2` (`aapt2 dump`). The embedded config has API `http://192.168.100.177:3000`, Firebase project `nihongoclass-6342b` and no emulator. The Hermes bundle contains this release's strings and none from the removed screens. | PASS |
| Running on an Android emulator or a phone | NOT RUN. The emulator needs a hypervisor driver or Windows Hypervisor Platform; both need admin rights and a reboot. |

## Firebase (Phase 3)

| Check | Result |
|---|---|
| Composite indexes: none missing. Mobile makes no Firestore queries; all data goes through the API, as on web. The API's multi-field queries are covered by the 62 deployed indexes (all READY, Phase 0). Mobile calls the same API paths as web. | PASS |
| Rules: the committed deny-all is restored in `firestore.rules` (Decision 17). In the emulator, all 27 client reads and writes were denied for the student, teacher and admin tokens. | PASS |
| Rules deployed to production (owner approved, 2026-11-09). `firebase deploy --only firestore:rules --project prod` released them. Read back with the Admin SDK, live ruleset `674fe2ce-63be-4d35-ad2d-6bea1e7e81bc` (created 07:04:10 GMT) is identical to `firestore.rules`. | PASS |
| Mobile config points at the same Firebase project and web app as web (`nihongoclass-6342b`) | PASS |

## Automated tests

| Suite | Result |
|---|---|
| API (`apps/api`, vitest, emulators): 149 tests. The storage provider's test stand-in now answers `GET /object/info`, which storage-js 2.119 uses. | 149 / 149 |
| Mobile copies of the shared code (`packages/shared/test/mobile-mirror.test.ts`): constants, money, time | 4 / 4 |
| API typecheck | PASS |

## Not checked here

- **A real phone.** The new APK has to be installed and opened on a device; see the final report.
- **Google sign-in on Android.** It needs an Android OAuth client (package and SHA-1 are in the final report). The button explains this until it's set up.
- **File contents on the local copy.** Files live in Supabase, not in the local storage emulator, so file links return 404 there. The ticket and its URL were checked.
- **Camera and microphone in calls.** Starting a call, its limit, extending and ending were checked through the API; audio and video were not.
- **Picking files on a phone** (uploads, Excel import). The teacher and content sessions checked these against the API with real files, but nobody tapped through them on a device.
