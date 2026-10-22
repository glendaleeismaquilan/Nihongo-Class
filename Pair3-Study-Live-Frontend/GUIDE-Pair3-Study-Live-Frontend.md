# Pair 3: Study and live classes, Frontend (Developer 5)

The study and live-class screens: self-study, the flashcard player, quizzes and tests, results with the hanamaru, progress, the dashboards for each role, reports, live classes with the Join button and attendance, Google connection, and notifications.

This pack has the complete, finished versions of its 22 files. The 8 packs (4 pairs, frontend and backend) never share a file, so all 8 branches merge into `main` without conflicts. Once all 8 are merged, `main` is the complete app. It was tested that way: every unit test and the end-to-end tests pass.

## How to add it to the project

1. Get the latest `main` (it has the blank project):

```
git checkout main
git pull
git checkout -b pair3-study-live-frontend
```

2. Copy everything in this pack **except this GUIDE file** into the project folder (the `apps`, `packages`, and `docs` folders and any other files at the top). When Windows asks, choose **Replace the files in the destination**.
3. Commit and push, then open a pull request on GitHub:

```
git add -A
git commit -m "Pair3-Study-Live-Frontend"
git push -u origin pair3-study-live-frontend
```

The project only builds and runs once **all 8 packs** are merged, because the files that connect every part (in the Pair 1 packs) import all of them. That's expected: push your branch, and test after the team lead merges everything.

## Your files

**Web app** (21)

- `apps/web/src/roles/student/study/FocusLayout.tsx`
- `apps/web/src/roles/student/study/FlashcardPlayer.tsx`
- `apps/web/src/roles/student/study/DeckPages.tsx`
- `apps/web/src/roles/student/study/Hanamaru.tsx`
- `apps/web/src/roles/student/study/Results.tsx`
- `apps/web/src/roles/student/study/ListeningPlayer.tsx`
- `apps/web/src/roles/student/study/ActivityPage.tsx`
- `apps/web/src/roles/student/study/SelfStudyPage.tsx`
- `apps/web/src/roles/student/ProgressPage.tsx`
- `apps/web/src/roles/student/StudentDashboard.tsx`
- `apps/web/src/roles/teacher/TeacherDashboard.tsx`
- `apps/web/src/roles/admin/AdminDashboard.tsx`
- `apps/web/src/features/classes/ReportsTab.tsx`
- `apps/web/src/roles/admin/SchoolReportsPage.tsx`
- `apps/web/src/features/live/JoinButton.tsx`
- `apps/web/src/features/live/GoogleConnectionCard.tsx`
- `apps/web/src/features/live/StaffLiveTab.tsx`
- `apps/web/src/features/live/AttendancePage.tsx`
- `apps/web/src/roles/student/ClassLiveTab.tsx`
- `apps/web/src/roles/teacher/TeacherSettingsPage.tsx`
- `apps/web/src/pages/common/NotificationsPage.tsx`

**Web tests** (1)

- `apps/web/src/roles/student/study/Results.test.tsx`

## Tests for your part (after all 8 are merged)

Start the emulators first in a separate terminal: `npm run emulators`. The API tests wipe the emulator data, so run `npm run seed` again afterwards.

| Command | What it checks |
| --- | --- |
| `npx vitest run --root apps/web src/roles/student/study/Results.test.tsx` | 3 tests: the results screen |

The manual test cases for your pair are in the team's test case doc.
