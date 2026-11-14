import { useQuery } from "@tanstack/react-query";
import { PLANS, type TeacherBillingDto } from "@nihongo/shared";
import { api, errorMessage } from "../../lib/api";
import { formatBytes, formatDate, formatPeso } from "../../lib/format";
import { Alert, Badge, Button, ErrorState, Icon, Loading, PageHeader, Panel, ProgressBar, SectionTitle } from "../../components/ui";
import { PaymentHistory, useCheckout } from "../../features/billing/billing";

const minutes = (s: number) => `${Math.round(s / 60)} minutes`;

const FEATURES: { label: string; free: string; premium: string }[] = [
  { label: "In-app video calls", free: minutes(PLANS.freeCallSeconds), premium: minutes(PLANS.premiumCallSeconds) },
  { label: "My Drive and class materials", free: formatBytes(PLANS.freeStorageBytes), premium: formatBytes(PLANS.premiumStorageBytes) },
];

/** Teacher Premium: ₱299 once for 15-minute calls and 1 GB of storage, for good. */
export function PremiumPage() {
  const q = useQuery({ queryKey: ["billing", "premium"], queryFn: () => api<TeacherBillingDto>("/billing/premium") });
  const checkout = useCheckout("/billing/premium/checkout");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { plan, payments } = q.data;
  return (
    <>
      <PageHeader title="Premium" description={`${formatPeso(PLANS.premiumPriceCentavos)}, paid once. Premium never expires, and there's nothing to renew.`} />
      <Panel className="mb-6 px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-ink-2">Your plan</p>
            <p className="mt-1 flex items-center gap-2 text-xl font-semibold">
              {plan.premium ? <Icon name="star" className="text-ai" /> : null}
              {plan.premium ? "Premium" : "Free"}
              {plan.premium ? <Badge tone="success">Lifetime</Badge> : null}
            </p>
            {plan.premium && plan.premiumSince ? <p className="mt-1 text-ink-2">Yours since {formatDate(plan.premiumSince)}. It never expires.</p> : null}
          </div>
          {!plan.premium ? (
            <Button icon="star" onClick={() => checkout.mutate({})} loading={checkout.isPending || checkout.isSuccess}>
              Go Premium for {formatPeso(PLANS.premiumPriceCentavos)}
            </Button>
          ) : null}
        </div>
        {checkout.isError ? (
          <div className="mt-4">
            <Alert tone="danger">{errorMessage(checkout.error)}</Alert>
          </div>
        ) : null}
        <div className="mt-5">
          <p className="mb-1 text-sm text-ink-2">
            Storage: {formatBytes(plan.storageUsedBytes)} of {formatBytes(plan.storageLimitBytes)}
          </p>
          <ProgressBar value={plan.storageLimitBytes ? plan.storageUsedBytes / plan.storageLimitBytes : 0} label="Storage used" />
        </div>
      </Panel>
      <Panel className="mb-8 px-5 py-5">
        <SectionTitle>What Premium adds</SectionTitle>
        <table className="w-full text-left">
          <thead>
            <tr className="text-sm text-ink-2">
              <th scope="col" className="py-2 font-medium">
                <span className="sr-only">Feature</span>
              </th>
              <th scope="col" className="py-2 font-medium">
                Free
              </th>
              <th scope="col" className="py-2 font-medium">
                Premium
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {FEATURES.map((f) => (
              <tr key={f.label}>
                <th scope="row" className="py-3 font-medium">
                  {f.label}
                </th>
                <td className="py-3 text-ink-2">{f.free}</td>
                <td className="py-3 font-semibold">{f.premium}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-ink-2">Live classes with Google Meet stay free and unlimited. Your classes are always free for students.</p>
      </Panel>
      <section>
        <SectionTitle>Payment history</SectionTitle>
        <PaymentHistory items={payments} premium={plan.premium} />
      </section>
    </>
  );
}
