import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReceiptDto } from "@nihongo/shared";
import { api } from "../../lib/api";
import { formatDateTime, formatPeso } from "../../lib/format";
import { Button, ErrorState, Icon, Loading } from "../../components/ui";

/** A printable payment acknowledgment for teacher slots or Premium, not a BIR official receipt. */
export function ReceiptPage({ backTo, backLabel }: { backTo: string; backLabel: string }) {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["receipt", id], queryFn: () => api<ReceiptDto & { status: string }>(`/payments/${id}/receipt`) });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  const r = q.data;
  const rows: [string, string][] = [
    ...(r.schoolName ? ([["School", r.schoolName]] as [string, string][]) : []),
    ["Paid by", `${r.payerName} (${r.payerEmail})`],
    ["For", r.description],
    ["Amount", formatPeso(r.amountCentavos)],
    ["Method", r.method],
    ["Reference number", r.referenceNumber],
    ["Date paid", formatDateTime(r.paidAt)],
  ];
  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <Link to={backTo} className="inline-flex min-h-11 items-center gap-1 text-sm no-underline">
          <Icon name="chevron-left" size={16} />
          {backLabel}
        </Link>
        <Button variant="secondary" icon="receipt" onClick={() => window.print()}>
          Print
        </Button>
      </div>
      <article className="rounded-paper border border-line bg-paper px-8 py-8 print:border-0 print:px-0">
        <p className="text-sm text-ink-2">Nihongo Class</p>
        <h1 className="mt-1 text-2xl">Payment acknowledgment</h1>
        {r.status === "refunded" ? <p className="mt-2 font-medium text-shu">This payment was later refunded.</p> : null}
        <dl className="mt-6 divide-y divide-line border-y border-line">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[10rem_1fr] gap-4 py-3">
              <dt className="text-ink-2">{k}</dt>
              <dd className={k === "Amount" ? "text-lg font-semibold" : k === "Reference number" ? "font-mono" : ""}>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-sm text-ink-2">This acknowledges a payment received by Nihongo Class through PayMongo. It is not a BIR official receipt.</p>
      </article>
    </div>
  );
}
