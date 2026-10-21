# Pair 1: Accounts and app shell, Backend (team lead) (Developer 2)

The server side of accounts: the shared types and checks every part uses, the API core, sign-up and `/me`, School Admins adding teachers, and Content Admins creating schools and School Admins. As team lead, this pack also has the three files that connect every part's routes (`app.ts`, `server.ts`, `routes/index.ts`), the README, `docs/DECISIONS.md`, and two updated setup files (`.firebaserc`, `.gitignore`).

This pack has the complete, finished versions of its 36 files. The 8 packs (4 pairs, frontend and backend) never share a file, so all 8 branches merge into `main` without conflicts. Once all 8 are merged, `main` is the complete app. It was tested that way: every unit test and the end-to-end tests pass.

## How to add it to the project

1. Get the latest `main` (it has the blank project):

```
git checkout main
git pull
git checkout -b pair1-auth-backend
```

2. Copy everything in this pack **except this GUIDE file** into the project folder (the `apps`, `packages`, and `docs` folders and any other files at the top). When Windows asks, choose **Replace the files in the destination**.
3. Commit and push, then open a pull request on GitHub:

```
git add -A
git commit -m "Pair1-Auth-Backend"
git push -u origin pair1-auth-backend
```

The project only builds and runs once **all 8 packs** are merged, because the files that connect every part (in the Pair 1 packs) import all of them. That's expected: push your branch, and test after the team lead merges everything.

## Your files

**Shared package** (8)

- `packages/shared/src/constants.ts`
- `packages/shared/src/money.ts`
- `packages/shared/src/time.ts`
- `packages/shared/src/excel.ts`
- `packages/shared/src/schemas.ts`
- `packages/shared/src/types.ts`
- `packages/shared/src/index.ts`
- `packages/shared/test/shared.test.ts`

**API** (17)

- `apps/api/src/env.ts`
- `apps/api/src/firebase.ts`
- `apps/api/src/logger.ts`
- `apps/api/src/db.ts`
- `apps/api/src/app.ts`
- `apps/api/src/server.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/lib/errors.ts`
- `apps/api/src/lib/validate.ts`
- `apps/api/src/lib/time.ts`
- `apps/api/src/lib/http.ts`
- `apps/api/src/lib/rateLimit.ts`
- `apps/api/src/lib/audit.ts`
- `apps/api/src/lib/auth.ts`
- `apps/api/src/lib/dto.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/users.ts`

**API tests** (5)

- `apps/api/test/globalSetup.ts`
- `apps/api/test/helpers.ts`
- `apps/api/test/auth.test.ts`
- `apps/api/test/accounts.test.ts`
- `apps/api/test/roles.test.ts`

**Demo data (seed)** (2)

- `apps/api/seed/seed.ts`
- `apps/api/seed/create-admin.ts`

**Setup and docs** (4)

- `README.md`
- `docs/DECISIONS.md`
- `.firebaserc`
- `.gitignore`

## Tests for your part (after all 8 are merged)

Start the emulators first in a separate terminal: `npm run emulators`. The API tests wipe the emulator data, so run `npm run seed` again afterwards.

| Command | What it checks |
| --- | --- |
| `npx vitest run --root packages/shared` | 11 tests: money, time, and the shared checks |
| `npx vitest run --root apps/api test/auth.test.ts test/accounts.test.ts` | 17 tests: sign-up, sign-in errors, roles from the database, who can create which accounts |
| `npx vitest run --root apps/api test/roles.test.ts` | 3 tests: every route refuses the wrong roles and missing sign-ins |

The manual test cases for your pair are in the team's test case doc.
