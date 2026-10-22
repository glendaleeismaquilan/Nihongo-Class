# Pair 3: Study and live classes, Backend (Developer 6)

The server side of studying and live classes: self-study decks, quizzes and tests graded on the server, progress and streaks, class and school reports, notifications, live classes with Google Meet links, attendance, and the timed jobs (finish past classes, reminders).

This pack has the complete, finished versions of its 15 files. The 8 packs (4 pairs, frontend and backend) never share a file, so all 8 branches merge into `main` without conflicts. Once all 8 are merged, `main` is the complete app. It was tested that way: every unit test and the end-to-end tests pass.

## How to add it to the project

1. Get the latest `main` (it has the blank project):

```
git checkout main
git pull
git checkout -b pair3-study-live-backend
```

2. Copy everything in this pack **except this GUIDE file** into the project folder (the `apps`, `packages`, and `docs` folders and any other files at the top). When Windows asks, choose **Replace the files in the destination**.
3. Commit and push, then open a pull request on GitHub:

```
git add -A
git commit -m "Pair3-Study-Live-Backend"
git push -u origin pair3-study-live-backend
```

The project only builds and runs once **all 8 packs** are merged, because the files that connect every part (in the Pair 1 packs) import all of them. That's expected: push your branch, and test after the team lead merges everything.

## Your files

**API** (12)

- `apps/api/src/services/grading.ts`
- `apps/api/src/routes/study.ts`
- `apps/api/src/routes/reports.ts`
- `apps/api/src/lib/notify.ts`
- `apps/api/src/routes/notifications.ts`
- `apps/api/src/lib/crypto.ts`
- `apps/api/src/services/calendar.ts`
- `apps/api/src/routes/integrations.ts`
- `apps/api/src/services/liveSessions.ts`
- `apps/api/src/routes/sessions.ts`
- `apps/api/src/services/jobs.ts`
- `apps/api/src/routes/jobs.ts`

**API tests** (2)

- `apps/api/test/study.test.ts`
- `apps/api/test/sessions.test.ts`

**Demo data (seed)** (1)

- `apps/api/seed/live.ts`

## Tests for your part (after all 8 are merged)

Start the emulators first in a separate terminal: `npm run emulators`. The API tests wipe the emulator data, so run `npm run seed` again afterwards.

| Command | What it checks |
| --- | --- |
| `npx vitest run --root apps/api test/study.test.ts test/sessions.test.ts` | 35 tests: study and grading 16, live classes 19 |

The manual test cases for your pair are in the team's test case doc.
