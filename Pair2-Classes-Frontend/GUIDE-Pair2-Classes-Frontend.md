# Pair 2: Classes and content, Frontend (Developer 3)

The class screens: class list and workspace, lessons, flashcard and quiz editors, Excel import dialogs, roster, class settings, joining with a code, the student's class pages, and the Content Admin's library pages with the import review and audio matching.

This pack has the complete, finished versions of its 25 files. The 8 packs (4 pairs, frontend and backend) never share a file, so all 8 branches merge into `main` without conflicts. Once all 8 are merged, `main` is the complete app. It was tested that way: every unit test and the end-to-end tests pass.

## How to add it to the project

1. Get the latest `main` (it has the blank project):

```
git checkout main
git pull
git checkout -b pair2-classes-frontend
```

2. Copy everything in this pack **except this GUIDE file** into the project folder (the `apps`, `packages`, and `docs` folders and any other files at the top). When Windows asks, choose **Replace the files in the destination**.
3. Commit and push, then open a pull request on GitHub:

```
git add -A
git commit -m "Pair2-Classes-Frontend"
git push -u origin pair2-classes-frontend
```

The project only builds and runs once **all 8 packs** are merged, because the files that connect every part (in the Pair 1 packs) import all of them. That's expected: push your branch, and test after the team lead merges everything.

## Your files

**Web app** (24)

- `apps/web/src/features/classes/hooks.ts`
- `apps/web/src/features/classes/staffRoutes.tsx`
- `apps/web/src/features/classes/ClassListPage.tsx`
- `apps/web/src/features/classes/ClassWorkspace.tsx`
- `apps/web/src/features/classes/LessonsTab.tsx`
- `apps/web/src/features/classes/ContentDialogs.tsx`
- `apps/web/src/features/classes/QuizEditorPage.tsx`
- `apps/web/src/features/classes/RosterTab.tsx`
- `apps/web/src/features/classes/ClassSettingsTab.tsx`
- `apps/web/src/components/QuestionEditor.tsx`
- `apps/web/src/roles/student/JoinClassPage.tsx`
- `apps/web/src/roles/student/ClassesPage.tsx`
- `apps/web/src/roles/student/ClassPage.tsx`
- `apps/web/src/roles/student/ClassLessonsTab.tsx`
- `apps/web/src/components/LevelSwitcher.tsx`
- `apps/web/src/components/audio.tsx`
- `apps/web/src/components/ImportResult.tsx`
- `apps/web/src/roles/content/libraryApi.ts`
- `apps/web/src/roles/content/LibraryOverviewPage.tsx`
- `apps/web/src/roles/content/LibraryListPage.tsx`
- `apps/web/src/roles/content/LibraryEditors.tsx`
- `apps/web/src/roles/content/LibraryImportDialog.tsx`
- `apps/web/src/roles/content/matchAudio.ts`
- `apps/web/src/roles/content/ImportReviewPage.tsx`

**Web tests** (1)

- `apps/web/src/roles/content/matchAudio.test.ts`

## Tests for your part (after all 8 are merged)

Start the emulators first in a separate terminal: `npm run emulators`. The API tests wipe the emulator data, so run `npm run seed` again afterwards.

| Command | What it checks |
| --- | --- |
| `npx vitest run --root apps/web src/roles/content/matchAudio.test.ts` | 1 test: matching dropped audio files to imported rows |

The manual test cases for your pair are in the team's test case doc.
