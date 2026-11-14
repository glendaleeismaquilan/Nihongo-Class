import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { MeDto, PaymentDto } from "@nihongo/shared";
import { PaymentHistory } from "./billing";

const auth = vi.hoisted(() => ({ me: null as unknown as Pick<MeDto, "role" | "plan"> }));
vi.mock("../../lib/auth", () => ({ useMe: () => auth.me }));

const plan = (premium: boolean): MeDto["plan"] => ({ premium, premiumSince: premium ? "2026-11-01T00:00:00.000Z" : null, callLimitSeconds: 300, storageLimitBytes: 0, storageUsedBytes: 0 });

const pending = (purpose: PaymentDto["purpose"]): PaymentDto => ({
  id: `pay-${purpose}`,
  referenceNumber: "NC-20261109-ABCDEF",
  uid: "u1",
  schoolId: null,
  purpose,
  quantity: 1,
  description: purpose === "premium" ? "Teacher Premium (one-time)" : "5 more teacher slots (1 × ₱299.00)",
  amountCentavos: 29_900,
  currency: "PHP",
  provider: "paymongo",
  status: "pending",
  checkoutUrl: `https://checkout.paymongo.com/cs_${purpose}`,
  method: null,
  reviewNote: null,
  paidAt: null,
  createdAt: "2026-11-09T01:00:00.000Z",
  updatedAt: "2026-11-09T01:00:00.000Z",
});

const renderHistory = (items: PaymentDto[], premium?: boolean) =>
  render(
    <MemoryRouter>
      <PaymentHistory items={items} premium={premium} />
    </MemoryRouter>,
  );

describe("Teacher Premium: ₱299, one-time", () => {
  beforeEach(() => {
    auth.me = { role: "teacher", plan: plan(false) };
  });

  it("a pending Premium checkout offers Continue payment to a teacher without Premium", () => {
    renderHistory([pending("premium")]);
    expect(screen.getByRole("link", { name: "Continue payment" })).toHaveAttribute("href", "https://checkout.paymongo.com/cs_premium");
  });

  it("a teacher who already has Premium isn't sent back to an old Premium checkout", () => {
    auth.me = { role: "teacher", plan: plan(true) };
    renderHistory([pending("premium")]);
    expect(screen.getByText("Waiting for payment")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continue payment" })).toBeNull();
  });

  it("the page's fresher plan hides it even while the cached /me still says free", () => {
    renderHistory([pending("premium")], true);
    expect(screen.queryByRole("link", { name: "Continue payment" })).toBeNull();
  });

  it("pending teacher slots can still be continued", () => {
    auth.me = { role: "school_admin", plan: null };
    renderHistory([pending("teacher_seats")]);
    expect(screen.getByRole("link", { name: "Continue payment" })).toHaveAttribute("href", "https://checkout.paymongo.com/cs_teacher_seats");
  });
});
