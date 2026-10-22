# Pair 4: Files, billing, calls, Backend (Developer 8)

The server side of files, money, and calls: file storage (Firebase or Supabase), file type checks and 5-minute file links, class materials, My Drive and the 500 MB / 1 GB limit, teacher slots and Premium through PayMongo (or mock mode), receipts, and in-app video calls with their time limits.

This pack has the complete, finished versions of its 22 files. The 8 packs (4 pairs, frontend and backend) never share a file, so all 8 branches merge into `main` without conflicts. Once all 8 are merged, `main` is the complete app. It was tested that way: every unit test and the end-to-end tests pass.

## How to add it to the project

1. Get the latest `main` (it has the blank project):

```
git checkout main
git pull
git checkout -b pair4-files-billing-calls-backend
```

2. Copy everything in this pack **except this GUIDE file** into the project folder (the `apps`, `packages`, and `docs` folders and any other files at the top). When Windows asks, choose **Replace the files in the destination**.
3. Commit and push, then open a pull request on GitHub:

```
git add -A
git commit -m "Pair4-Files-Billing-Calls-Backend"
git push -u origin pair4-files-billing-calls-backend
```

The project only builds and runs once **all 8 packs** are merged, because the files that connect every part (in the Pair 1 packs) import all of them. That's expected: push your branch, and test after the team lead merges everything.

## Your files

**API** (14)

- `apps/api/src/lib/storage.ts`
- `apps/api/src/lib/upload.ts`
- `apps/api/src/lib/fileTypes.ts`
- `apps/api/src/lib/tickets.ts`
- `apps/api/src/routes/files.ts`
- `apps/api/src/services/plan.ts`
- `apps/api/src/routes/materials.ts`
- `apps/api/src/routes/drive.ts`
- `apps/api/src/services/payments.ts`
- `apps/api/src/services/paymongo.ts`
- `apps/api/src/services/paymentFlow.ts`
- `apps/api/src/routes/payments.ts`
- `apps/api/src/services/calls.ts`
- `apps/api/src/routes/calls.ts`

**API tests** (5)

- `apps/api/test/materials.test.ts`
- `apps/api/test/drive.test.ts`
- `apps/api/test/billing.test.ts`
- `apps/api/test/calls.test.ts`
- `apps/api/test/storage.test.ts`

**Demo data (seed)** (3)

- `apps/api/seed/materials.ts`
- `apps/api/seed/drive.ts`
- `apps/api/seed/payments.ts`

## Tests for your part (after all 8 are merged)

Start the emulators first in a separate terminal: `npm run emulators`. The API tests wipe the emulator data, so run `npm run seed` again afterwards.

| Command | What it checks |
| --- | --- |
| `npx vitest run --root apps/api test/materials.test.ts test/drive.test.ts test/billing.test.ts test/calls.test.ts test/storage.test.ts` | 51 tests: materials 12, My Drive 5, billing 21, calls 8, storage 5 |

The manual test cases for your pair are in the team's test case doc.
