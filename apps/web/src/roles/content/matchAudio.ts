export interface AudioTarget {
  key: string;
  label: string;
  expected: string | null;
  hasAudio: boolean;
}

export interface MatchResult<F extends { name: string }> {
  matched: { target: AudioTarget; file: F }[];
  unmatchedFiles: F[];
  unmatchedTargets: AudioTarget[];
}

/**
 * FR-3.5.3: match dropped audio files to imported rows by file name,
 * case-insensitively. Lists the files that match no row and the rows that
 * still have no file.
 */
export function matchAudio<F extends { name: string }>(targets: AudioTarget[], files: F[]): MatchResult<F> {
  const byName = new Map<string, F>();
  for (const f of files) byName.set(f.name.trim().toLowerCase(), f);
  const used = new Set<F>();
  const matched: MatchResult<F>["matched"] = [];
  const unmatchedTargets: AudioTarget[] = [];
  for (const t of targets) {
    const f = t.expected ? byName.get(t.expected.trim().toLowerCase()) : undefined;
    if (f) {
      matched.push({ target: t, file: f });
      used.add(f);
    } else if (t.expected && !t.hasAudio) unmatchedTargets.push(t);
  }
  return { matched, unmatchedFiles: files.filter((f) => !used.has(f)), unmatchedTargets };
}
