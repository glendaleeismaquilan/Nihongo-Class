import { expect, test, type Page } from "@playwright/test";

const API = "http://localhost:3000/api";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key";

async function tokenFor(email: string) {
  const res = await fetch(AUTH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "nihongo123", returnSecureToken: true }) });
  return ((await res.json()) as { idToken: string }).idToken;
}

async function asTeacher<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const PDF = "%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n";

/** The teacher posts a material and schedules a live class with a pasted Meet link, both in the N4 class. */
async function teacherSetup() {
  const token = await tokenFor("sato@demo.nihongo");
  const material = await asTeacher<{ id: string }>(token, "/classes/n4-evening/materials", { method: "POST", body: JSON.stringify({ title: "Travel vocabulary sheet", lessonId: "n4-evening-lesson-2" }) });
  const form = new FormData();
  form.set("file", new Blob([PDF], { type: "application/pdf" }), "travel-vocabulary.pdf");
  await asTeacher(token, `/materials/${material.id}/attachments`, { method: "POST", body: form });
  await asTeacher(token, `/materials/${material.id}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) });

  // Starts in 5 minutes, so the Join window (15 minutes before) is open.
  const start = new Date(Date.now() + 5 * 60_000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(start)
      .map((p) => [p.type, p.value]),
  );
  const created = await asTeacher<{ items: { id: string }[] }>(token, "/classes/n4-evening/sessions", {
    method: "POST",
    body: JSON.stringify({ title: "Smoke test live class", date: `${parts.year}-${parts.month}-${parts.day}`, startTime: `${parts.hour}:${parts.minute}`, durationMinutes: 60, useGoogle: false, meetUrl: "https://meet.google.com/smk-test-lnk" }),
  });
  return { token, materialId: material.id, sessionId: created.items[0].id };
}

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Mika Smoke");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("smoke-pass-123");
  await page.getByLabel("I have read the privacy notice and agree to it.").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Choose your study level" })).toBeVisible();
  await page.getByLabel(/N4 Elementary/).check();
  await page.getByRole("button", { name: "Save level" }).click();
  await expect(page.getByRole("heading", { name: /Welcome back, Mika Smoke/ })).toBeVisible();
}

test("a student signs up, joins a free class, studies, passes a quiz, opens a material, and joins a live class", async ({ page, context }) => {
  // Never leave the test environment: answer Meet links locally.
  await context.route("https://meet.google.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>Meet</title>Meet" }));
  const teacher = await teacherSetup();
  const email = `smoke-${Date.now()}@test.nihongo`;
  await signUp(page, email);

  // Classes are free: join with the code.
  await page.goto("/join/N4EVE7");
  await expect(page.getByRole("heading", { name: "N4 Evening Class" })).toBeVisible();
  await page.getByRole("button", { name: "Join class" }).click();
  await expect(page.getByRole("heading", { name: "N4 Evening Class", level: 1 })).toBeVisible();

  // Study a flashcard deck.
  await page.getByRole("link", { name: "Study flashcards" }).first().click();
  const card = page.getByRole("button", { name: /Card 1 of \d+/ });
  await expect(card).toBeVisible();
  await card.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("photograph")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: /Card 2 of/ })).toBeVisible();
  await page.getByRole("link", { name: "Exit" }).click();

  // Pass a quiz and see the hanamaru.
  await page.getByRole("link", { name: "Start" }).first().click();
  await expect(page.getByText("Question 1 of 4")).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.locator(`input[name="q-${i}"][value="0"]`).check();
    if (i < 3) await page.getByRole("button", { name: "Next question" }).click();
  }
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.locator("p", { hasText: "Passed" }).filter({ hasText: "合格" })).toBeVisible();
  await expect(page.locator(".hanamaru-path")).toHaveCount(1);
  await expect(page.getByRole("status").filter({ hasText: "You scored 4 out of 4" })).toBeAttached();
  await page.getByRole("link", { name: "Back to class" }).click();

  // Open the material the teacher posted.
  await page.getByRole("link", { name: "Materials" }).click();
  await expect(page.getByRole("heading", { name: "Travel vocabulary sheet" })).toBeVisible();
  await expect(page.getByText("New", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Preview" }).click();
  const frame = page.locator("dialog iframe");
  await expect(frame).toHaveAttribute("src", /\/api\/files\//);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("New", { exact: true })).toHaveCount(0);

  // Join the live class the teacher scheduled with a pasted link.
  await page.getByRole("link", { name: "Live classes" }).click();
  await expect(page.getByText("Smoke test live class")).toBeVisible();
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "Join on Google Meet" }).click();
  const meet = await popup;
  expect(meet.url()).toContain("meet.google.com/smk-test-lnk");
  await meet.close();

  // The check-in was recorded.
  await expect
    .poll(async () => {
      const att = await asTeacher<{ items: { name: string; status: string | null }[] }>(teacher.token, `/sessions/${teacher.sessionId}/attendance`);
      return att.items.find((r) => r.name === "Mika Smoke")?.status;
    })
    .toBe("present");
});

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("nihongo123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

test("a free teacher's call lasts 5 minutes; after buying Premium it lasts 15, and a student joins", async ({ page, browser }) => {
  await signIn(page, "sato@demo.nihongo");
  await page.getByRole("link", { name: "Classes" }).first().click();
  await page.getByRole("link", { name: "N4 Evening Class" }).click();
  await expect(page.getByText("Up to 8 people, 5 minutes.")).toBeVisible();

  await page.goto("/t/premium");
  await page.getByRole("button", { name: "Go Premium for ₱299.00" }).click();
  await expect(page.getByText("Test checkout (PAYMONGO_MODE=mock)")).toBeVisible();
  await page.getByRole("button", { name: "Pay ₱299.00" }).click();
  await expect(page.getByRole("heading", { name: "You're on Premium" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "See my plan" }).click();
  await expect(page.getByText("Storage: ")).toContainText("of 1 GB");

  await page.goto("/t/classes/n4-evening");
  await expect(page.getByText("Up to 8 people, 15 minutes.")).toBeVisible();
  await page.getByRole("button", { name: "Start call" }).click();
  await expect(page).toHaveURL(/\/call\//);
  await expect(page.getByText("Waiting for others to join…")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^1[45]:\d\d$/)).toBeVisible();

  // An enrolled student joins from the class page; both sides get live video.
  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await signIn(student, "paolo@demo.nihongo");
  await expect(student.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  await student.goto("/s/classes/n4-evening");
  await student.getByRole("link", { name: "Join call" }).click();
  await expect(student.getByText("Hiroshi Sato", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Paolo Garcia", { exact: true })).toBeVisible({ timeout: 30_000 });
  const playing = (p: Page) => p.evaluate(() => [...document.querySelectorAll("video")].filter((v) => !v.muted && v.videoWidth > 0).length);
  await expect.poll(() => playing(page), { timeout: 30_000 }).toBe(1);
  await expect.poll(() => playing(student), { timeout: 30_000 }).toBe(1);

  await page.getByRole("button", { name: "End for everyone" }).click();
  await expect(page.getByRole("heading", { name: "The call has ended" })).toBeVisible();
  await expect(student.getByRole("heading", { name: "The call has ended" })).toBeVisible();
  await studentContext.close();
});

test("a School Admin buys 5 more teacher slots", async ({ page }) => {
  await signIn(page, "admin@demo.nihongo");
  await page.goto("/a/billing");
  await expect(page.getByText("2 of 5")).toBeVisible();
  await page.getByRole("button", { name: "Pay ₱299.00" }).click();
  await expect(page.getByText("Test checkout (PAYMONGO_MODE=mock)")).toBeVisible();
  await page.getByRole("button", { name: "Pay ₱299.00" }).click();
  await expect(page.getByRole("heading", { name: "5 teacher slots added" })).toBeVisible({ timeout: 30_000 });
  await page.goto("/a/billing");
  await expect(page.getByText("2 of 10")).toBeVisible();
});
