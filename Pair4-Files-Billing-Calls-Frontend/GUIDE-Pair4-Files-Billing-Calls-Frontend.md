# Pair 4: Files, billing, calls, Frontend (Developer 7)

The screens for files, money, and calls: class materials and their editor, My Drive, the School Admin's Billing page, the teacher's Premium page, the test checkout and payment return pages, receipts, and the video call page with its banner on class pages.

This pack has the complete, finished versions of its 13 files. The 8 packs (4 pairs, frontend and backend) never share a file, so all 8 branches merge into `main` without conflicts. Once all 8 are merged, `main` is the complete app. It was tested that way: every unit test and the end-to-end tests pass.

## How to add it to the project

1. Get the latest `main` (it has the blank project):

```
git checkout main
git pull
git checkout -b pair4-files-billing-calls-frontend
```

2. Copy everything in this pack **except this GUIDE file** into the project folder (the `apps`, `packages`, and `docs` folders and any other files at the top). When Windows asks, choose **Replace the files in the destination**.
3. Commit and push, then open a pull request on GitHub:

```
git add -A
git commit -m "Pair4-Files-Billing-Calls-Frontend"
git push -u origin pair4-files-billing-calls-frontend
```

The project only builds and runs once **all 8 packs** are merged, because the files that connect every part (in the Pair 1 packs) import all of them. That's expected: push your branch, and test after the team lead merges everything.

## Your files

**Web app** (13)

- `apps/web/src/components/FileDrop.tsx`
- `apps/web/src/features/materials/materialsApi.ts`
- `apps/web/src/features/materials/AttachmentList.tsx`
- `apps/web/src/features/materials/StaffMaterialsTab.tsx`
- `apps/web/src/features/materials/MaterialEditorPage.tsx`
- `apps/web/src/roles/student/ClassMaterialsTab.tsx`
- `apps/web/src/roles/teacher/DrivePage.tsx`
- `apps/web/src/features/billing/billing.tsx`
- `apps/web/src/features/payments/ReceiptPage.tsx`
- `apps/web/src/roles/admin/BillingPage.tsx`
- `apps/web/src/roles/teacher/PremiumPage.tsx`
- `apps/web/src/features/calls/ActiveCallBanner.tsx`
- `apps/web/src/features/calls/CallPage.tsx`

## Tests for your part (after all 8 are merged)

Start the emulators first in a separate terminal: `npm run emulators`. The API tests wipe the emulator data, so run `npm run seed` again afterwards.

This part has no automated tests of its own: the end-to-end tests (Pair 1 Frontend) cover its main flows. Use the manual test cases.

The manual test cases for your pair are in the team's test case doc.
