/**
 * FR-3.4.4: Correct Option must be exactly one of A, B, C, D after trimming,
 * case-insensitive. Returns the choice index, or null for anything else
 * (E, blank, "A,B", ...).
 */
export function parseCorrectOption(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const v = String(value).trim().toUpperCase();
  const index = ["A", "B", "C", "D"].indexOf(v);
  return index === -1 ? null : index;
}

export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
