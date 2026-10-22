# Pair 2: Classes and content, Backend (Developer 4)

The server side of classes: creating and archiving classes, class codes and joining, the roster, lessons, teacher flashcards and quizzes, Excel imports, and the Content Admin's built-in library with audio and publishing.

This pack has the complete, finished versions of its 15 files. The 8 packs (4 pairs, frontend and backend) never share a file, so all 8 branches merge into `main` without conflicts. Once all 8 are merged, `main` is the complete app. It was tested that way: every unit test and the end-to-end tests pass.

## How to add it to the project

1. Get the latest `main` (it has the blank project):

```
git checkout main
git pull
git checkout -b pair2-classes-backend
```

2. Copy everything in this pack **except this GUIDE file** into the project folder (the `apps`, `packages`, and `docs` folders and any other files at the top). When Windows asks, choose **Replace the files in the destination**.
3. Commit and push, then open a pull request on GitHub:

```
git add -A
git commit -m "Pair2-Classes-Backend"
git push -u origin pair2-classes-backend
```

The project only builds and runs once **all 8 packs** are merged, because the files that connect every part (in the Pair 1 packs) import all of them. That's expected: push your branch, and test after the team lead merges everything.

## Your files

**API** (9)

- `apps/api/src/lib/codes.ts`
- `apps/api/src/lib/access.ts`
- `apps/api/src/services/enrollment.ts`
- `apps/api/src/routes/classes.ts`
- `apps/api/src/routes/lessons.ts`
- `apps/api/src/lib/excel.ts`
- `apps/api/src/routes/teacherContent.ts`
- `apps/api/src/lib/contentDto.ts`
- `apps/api/src/routes/library.ts`

**API tests** (3)

- `apps/api/test/classes.test.ts`
- `apps/api/test/library.test.ts`
- `apps/api/test/import.test.ts`

**Demo data (seed)** (3)

- `apps/api/seed/classes.ts`
- `apps/api/seed/library.ts`
- `apps/api/seed/tone.ts`

## Tests for your part (after all 8 are merged)

Start the emulators first in a separate terminal: `npm run emulators`. The API tests wipe the emulator data, so run `npm run seed` again afterwards.

| Command | What it checks |
| --- | --- |
| `npx vitest run --root apps/api test/classes.test.ts test/library.test.ts test/import.test.ts` | 42 tests: classes 16, library 13, imports 13 |

The manual test cases for your pair are in the team's test case doc.
