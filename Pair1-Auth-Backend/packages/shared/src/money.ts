const pesoFormatter = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

/** FR-3.13.10: money is integer centavos, shown with the peso sign and centavos. */
export function formatPeso(centavos: number): string {
  return pesoFormatter.format(centavos / 100);
}

/** Parses "2,500" or "2500.50" into centavos. Returns null when it isn't a valid amount. */
export function pesosToCentavos(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
