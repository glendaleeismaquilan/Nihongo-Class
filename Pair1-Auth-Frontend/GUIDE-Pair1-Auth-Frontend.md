# Pair 1: Accounts and app shell, Frontend (Developer 1)

The app frame and everything about accounts on screen: the UI kit, the menus, sign-in, sign-up, password reset, privacy consent, study level, profile, the School Admin's People and Settings pages, and the Content Admin's Schools page. This pack also has `App.tsx` and the four role files (`StudentApp`, `TeacherApp`, `SchoolAdminApp`, `ContentAdminApp`) that connect every part's pages, the end-to-end tests, and two updated web setup files (`vite.config.ts`, `.env.production`).

This pack has the complete, finished versions of its 38 files. The 8 packs (4 pairs, frontend and backend) never share a file, so all 8 branches merge into `main` without conflicts. Once all 8 are merged, `main` is the complete app. It was tested that way: every unit test and the end-to-end tests pass.

## How to add it to the project

1. Get the latest `main` (it has the blank project):

```
git checkout main
git pull
git checkout -b pair1-auth-frontend
```

2. Copy everything in this pack **except this GUIDE file** into the project folder (the `apps`, `packages`, and `docs` folders and any other files at the top). When Windows asks, choose **Replace the files in the destination**.
3. Commit and push, then open a pull request on GitHub:

```
git add -A
git commit -m "Pair1-Auth-Frontend"
git push -u origin pair1-auth-frontend
```

The project only builds and runs once **all 8 packs** are merged, because the files that connect every part (in the Pair 1 packs) import all of them. That's expected: push your branch, and test after the team lead merges everything.

## Your files

**Web app** (33)

- `apps/web/src/index.css`
- `apps/web/src/main.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/test/setup.ts`
- `apps/web/src/lib/firebase.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/format.ts`
- `apps/web/src/lib/useNow.ts`
- `apps/web/src/lib/auth.tsx`
- `apps/web/src/components/ui/Icon.tsx`
- `apps/web/src/components/ui/Button.tsx`
- `apps/web/src/components/ui/Field.tsx`
- `apps/web/src/components/ui/Toast.tsx`
- `apps/web/src/components/ui/misc.tsx`
- `apps/web/src/components/ui/index.ts`
- `apps/web/src/components/layout/nav.ts`
- `apps/web/src/components/layout/OfflineBanner.tsx`
- `apps/web/src/components/layout/Guard.tsx`
- `apps/web/src/components/layout/AppShell.tsx`
- `apps/web/src/roles/student/StudentApp.tsx`
- `apps/web/src/roles/teacher/TeacherApp.tsx`
- `apps/web/src/roles/admin/SchoolAdminApp.tsx`
- `apps/web/src/roles/content/ContentAdminApp.tsx`
- `apps/web/src/pages/auth/AuthLayout.tsx`
- `apps/web/src/pages/auth/LoginPage.tsx`
- `apps/web/src/pages/auth/SignupPage.tsx`
- `apps/web/src/pages/auth/ResetPasswordPage.tsx`
- `apps/web/src/pages/auth/ConsentPage.tsx`
- `apps/web/src/roles/student/ChooseLevelPage.tsx`
- `apps/web/src/pages/common/ProfilePage.tsx`
- `apps/web/src/roles/admin/PeoplePage.tsx`
- `apps/web/src/roles/admin/SchoolSettingsPage.tsx`
- `apps/web/src/roles/content/SchoolsPage.tsx`

**Web tests** (3)

- `apps/web/src/components/ui/ui.test.tsx`
- `apps/web/e2e/global-setup.ts`
- `apps/web/e2e/smoke.spec.ts`

**Setup and docs** (2)

- `apps/web/.env.production`
- `apps/web/vite.config.ts`

## Tests for your part (after all 8 are merged)

Start the emulators first in a separate terminal: `npm run emulators`. The API tests wipe the emulator data, so run `npm run seed` again afterwards.

| Command | What it checks |
| --- | --- |
| `npx vitest run --root apps/web src/components/ui/ui.test.tsx` | 1 test: form errors are linked to their fields |
| `npm run test:e2e` (stop `npm run emulators` first; it starts its own) | 3 browser tests across all parts: sign-up and study, Premium and a two-person call, buying teacher slots. Run `npx playwright install chromium` once before the first run. |

The manual test cases for your pair are in the team's test case doc.
