// Mirror of apps/web/src/roles/content/matchAudio.ts.

/**
 * FR-3.5.3: match chosen audio files to imported rows by file name,
 * case-insensitively. Lists the files that match no row and the rows that
 * still have no file. A target is { key, label, expected, hasAudio }.
 */
export function matchAudio(targets, files) {
  const byName = new Map();
  for (const f of files) byName.set(f.name.trim().toLowerCase(), f);
  const used = new Set();
  const matched = [];
  const unmatchedTargets = [];
  for (const t of targets) {
    const f = t.expected ? byName.get(t.expected.trim().toLowerCase()) : undefined;
    if (f) {
      matched.push({ target: t, file: f });
      used.add(f);
    } else if (t.expected && !t.hasAudio) unmatchedTargets.push(t);
  }
  return { matched, unmatchedFiles: files.filter((f) => !used.has(f)), unmatchedTargets };
}
