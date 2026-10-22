import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PLANS, type SchoolBillingDto } from "@nihongo/shared";
import { api, errorMessage } from "../../lib/api";
import { formatPeso } from "../../lib/format";
import { Alert, Button, ErrorState, Loading, PageHeader, Panel, ProgressBar, SectionTitle, SelectField, StatTile } from "../../components/ui";
import { PaymentHistory, useCheckout } from "../../features/billing/billing";

export const useSchoolBilling = () => useQuery({ queryKey: ["billing", "school"], queryFn: () => api<SchoolBillingDto>("/billing/school") });

/** Teacher slots: 5 free per school, then 5 more for ₱299 each time (one-time). */
export function BillingPage() {
  const q = useSchoolBilling();
  const checkout = useCheckout("/billing/teacher-seats/checkout");
  const [packs, setPacks] = useState(1);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { seats, payments } = q.data;
  return (
    <>
      <PageHeader title="Billing" description="Classes are free for students. Your school pays only for teacher slots beyond the first 5." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="Teachers" value={`${seats.used} of ${seats.total}`} hint={seats.available ? `${seats.available} slots free` : "All slots in use"} />
        <StatTile label="Free slots" value={seats.free} hint="Included with every school" />
        <StatTile label="Bought slots" value={seats.purchased} hint="One-time, never expire" />
      </div>
      <ProgressBar value={seats.total ? seats.used / seats.total : 0} label={`${seats.used} of ${seats.total} teacher slots in use`} className="mb-6" />
      <Panel className="mb-8 px-5 py-5">
        <SectionTitle>Add teacher slots</SectionTitle>
        <p className="mb-4 max-w-[70ch] text-ink-2">
          Each pack adds {PLANS.seatPackSize} teacher slots for {formatPeso(PLANS.seatPackPriceCentavos)}, paid once. Pay with GCash, Maya, QR Ph, or card through PayMongo.
        </p>
        {checkout.isError ? (
          <div className="mb-4">
            <Alert tone="danger">{errorMessage(checkout.error)}</Alert>
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SelectField label="Packs" value={packs} onChange={(e) => setPacks(Number(e.target.value))} className="sm:w-56">
            {Array.from({ length: PLANS.maxSeatPacksPerPurchase }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "pack" : "packs"} ({n * PLANS.seatPackSize} slots)
              </option>
            ))}
          </SelectField>
          <Button icon="payment" onClick={() => checkout.mutate({ packs })} loading={checkout.isPending || checkout.isSuccess}>
            Pay {formatPeso(packs * PLANS.seatPackPriceCentavos)}
          </Button>
        </div>
      </Panel>
      <section>
        <SectionTitle>Payment history</SectionTitle>
        <PaymentHistory items={payments} showPayer />
      </section>
    </>
  );
}
