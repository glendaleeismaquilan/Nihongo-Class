import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaymentDto, PaymentStatus } from "@nihongo/shared";
import { api, errorMessage } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { formatDateTime, formatPeso } from "../../lib/format";
import { Alert, Badge, Button, ButtonAnchor, ButtonLink, DataTable, EmptyState, Icon, Loading, ErrorState, Panel } from "../../components/ui";
import { FocusLayout } from "../../roles/student/study/FocusLayout";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Waiting for payment",
  paid: "Paid",
  needs_review: "Being reviewed",
  expired: "Expired",
  refunded: "Refunded",
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const tone = status === "paid" ? "success" : status === "expired" ? "danger" : status === "refunded" ? "neutral" : "info";
  return <Badge tone={tone}>{PAYMENT_STATUS_LABEL[status]}</Badge>;
}

/** Where each purchase is managed, and where its receipts live. */
export const billingHome = (p: Pick<PaymentDto, "purpose">) => (p.purpose === "teacher_seats" ? "/a/billing" : "/t/premium");

/**
 * Starts a PayMongo checkout and sends the browser to it. The amount is set by
 * the server; the page only says what is being bought.
 */
export function useCheckout(path: string) {
  return useMutation({
    mutationFn: (body: Record<string, unknown> = {}) => api<{ paymentId: string; checkoutUrl: string }>(path, { body }),
    onSuccess: (r) => window.location.assign(r.checkoutUrl),
  });
}

/**
 * "Continue payment" reopens a pending checkout. Premium can't be bought twice,
 * so a teacher who already has it is never sent back to an old Premium
 * checkout: paying it would charge again and add nothing. `premium` lets a page
 * pass a plan fresher than the cached /me.
 */
export function PaymentHistory({ items, showPayer, premium }: { items: PaymentDto[]; showPayer?: boolean; premium?: boolean }) {
  const me = useMe();
  const hasPremium = premium || !!me.plan?.premium;
  const canContinue = (p: PaymentDto): p is PaymentDto & { checkoutUrl: string } => p.status === "pending" && !!p.checkoutUrl && !(p.purpose === "premium" && hasPremium);
  if (!items.length) return <EmptyState>No payments yet.</EmptyState>;
  return (
    <DataTable label="Payment history">
      <thead>
        <tr>
          <th scope="col">What</th>
          {showPayer ? <th scope="col">Paid by</th> : null}
          <th scope="col">Amount</th>
          <th scope="col">Status</th>
          <th scope="col">Reference</th>
          <th scope="col">Date</th>
          <th scope="col">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((p) => (
          <tr key={p.id}>
            <td className="font-medium">{p.description}</td>
            {showPayer ? <td className="text-ink-2">{p.payerName ?? ""}</td> : null}
            <td className="whitespace-nowrap">{formatPeso(p.amountCentavos)}</td>
            <td>
              <PaymentBadge status={p.status} />
            </td>
            <td className="font-mono text-sm">{p.referenceNumber}</td>
            <td className="whitespace-nowrap text-ink-2">{formatDateTime(p.paidAt ?? p.createdAt)}</td>
            <td className="whitespace-nowrap text-right">
              {p.status === "paid" || p.status === "refunded" ? (
                <ButtonLink size="sm" variant="ghost" to={`${billingHome(p)}/receipts/${p.id}`} icon="receipt">
                  Receipt
                </ButtonLink>
              ) : canContinue(p) ? (
                <ButtonAnchor size="sm" variant="ghost" href={p.checkoutUrl}>
                  Continue payment
                </ButtonAnchor>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/** §15 mock checkout: stands in for PayMongo's hosted page in development. */
export function MockCheckoutPage() {
  const { paymentId = "" } = useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["mock-checkout", paymentId], queryFn: () => api<PaymentDto & { cancelUrl: string }>(`/dev/mock-paymongo/${paymentId}`) });
  const pay = useMutation({
    mutationFn: () => api<{ successUrl: string }>(`/dev/mock-paymongo/${paymentId}/pay`, { method: "POST", body: { method: "gcash" } }),
    onSuccess: (r) => navigate(new URL(r.successUrl).pathname),
  });
  return (
    <FocusLayout exitTo="/" title="Test checkout">
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} />
      ) : (
        <Panel className="mx-auto max-w-md px-6 py-6">
          <p className="text-sm font-medium text-ink-2">Test checkout (PAYMONGO_MODE=mock)</p>
          <h1 className="mt-1 text-xl">{q.data.description}</h1>
          <p className="mt-3 text-3xl font-semibold">{formatPeso(q.data.amountCentavos)}</p>
          <p className="mt-1 text-sm text-ink-2">Reference {q.data.referenceNumber}</p>
          <p className="mt-4 text-ink-2">This page stands in for PayMongo's hosted checkout. Pay sends a signed payment event to the API's webhook, exactly as PayMongo would.</p>
          {pay.isError ? (
            <div className="mt-4">
              <Alert tone="danger">{errorMessage(pay.error)}</Alert>
            </div>
          ) : null}
          <div className="mt-6 flex gap-2">
            <Button onClick={() => pay.mutate()} loading={pay.isPending}>
              Pay {formatPeso(q.data.amountCentavos)}
            </Button>
            <Button variant="secondary" onClick={() => navigate(new URL(q.data.cancelUrl).pathname)}>
              Cancel
            </Button>
          </div>
        </Panel>
      )}
    </FocusLayout>
  );
}

/**
 * §10 step 3: polls every 2 seconds for up to 60 seconds. Slots and Premium are
 * granted by the server (webhook or reconciliation), never by this page.
 */
export function PaymentReturnPage() {
  const { id = "" } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const [started] = useState(() => Date.now());
  const [timedOut, setTimedOut] = useState(false);
  const q = useQuery({
    queryKey: ["payment", id, "return"],
    queryFn: () => api<PaymentDto>(`/payments/${id}`),
    refetchInterval: (query) => (query.state.data?.status === "paid" || timedOut ? false : 2000),
    gcTime: 0,
  });
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), Math.max(0, 60_000 - (Date.now() - started)));
    return () => clearTimeout(t);
  }, [started]);
  const p = q.data;
  const paid = p?.status === "paid";
  useEffect(() => {
    if (!paid) return;
    void qc.invalidateQueries({ queryKey: ["me"] });
    void qc.invalidateQueries({ queryKey: ["billing"] });
  }, [paid, qc]);
  const home = p ? billingHome(p) : me.role === "school_admin" ? "/a/billing" : "/t/premium";
  return (
    <FocusLayout exitTo={home} title="Payment">
      <Panel className="mx-auto max-w-lg px-6 py-8 text-center" aria-live="polite">
        {q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : paid ? (
          <>
            <Icon name="check" size={40} className="mx-auto text-matcha" />
            <h1 className="mt-3 text-2xl">{p.purpose === "teacher_seats" ? `${p.quantity * 5} teacher slots added` : "You're on Premium"}</h1>
            <p className="mt-2 text-ink-2">
              We received {formatPeso(p.amountCentavos)} for {p.description}. Reference {p.referenceNumber}.
            </p>
            {p.purpose === "premium" ? <p className="mt-1 text-ink-2">Premium is yours for good. There's nothing to renew.</p> : null}
            <div className="mt-6 flex justify-center gap-2">
              <ButtonLink to={p.purpose === "teacher_seats" ? "/a/people" : "/t/premium"}>{p.purpose === "teacher_seats" ? "Add teachers" : "See my plan"}</ButtonLink>
              <ButtonLink variant="secondary" to={`${home}/receipts/${p.id}`}>
                View receipt
              </ButtonLink>
            </div>
          </>
        ) : p && (p.status === "needs_review" || timedOut) ? (
          <>
            <h1 className="text-2xl">Still processing</h1>
            <p className="mt-2 text-ink-2">We'll notify you when it's confirmed. You don't need to pay again.</p>
            <ButtonLink className="mt-6" variant="secondary" to={home}>
              Back to billing
            </ButtonLink>
          </>
        ) : (
          <>
            <Loading label="Confirming your payment" />
            <p className="text-ink-2">This usually takes a few seconds. Keep this page open.</p>
          </>
        )}
      </Panel>
    </FocusLayout>
  );
}
