/** Builds the hanamaru (花丸): a scalloped flower ring around an inner loop. */
function hanamaruPath(cx: number, cy: number) {
  const pts: string[] = [];
  // Inner loop: a little more than one turn, slightly spiralling outward.
  const inner = 220;
  for (let i = 0; i <= inner; i++) {
    const t = (i / inner) * Math.PI * 2 * 1.15 - Math.PI / 2;
    const r = 78 + (i / inner) * 8;
    pts.push(`${i === 0 ? "M" : "L"}${(cx + r * Math.cos(t)).toFixed(1)},${(cy + r * Math.sin(t)).toFixed(1)}`);
  }
  // Petals: eight scallops around the loop, drawn in one stroke.
  const outer = 420;
  const start = Math.PI * 2 * 1.15 - Math.PI / 2;
  for (let i = 1; i <= outer; i++) {
    const t = start + (i / outer) * Math.PI * 2;
    const r = 96 + 16 * Math.abs(Math.sin(((t - start) * 8) / 2));
    pts.push(`L${(cx + r * Math.cos(t)).toFixed(1)},${(cy + r * Math.sin(t)).toFixed(1)}`);
  }
  return pts.join(" ");
}

const PATH = hanamaruPath(120, 120);

/**
 * §13: on a pass, the red hanamaru draws itself around the score
 * (stroke-dashoffset, about 700ms). Reduced motion shows it already drawn.
 */
export function Hanamaru({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 240" className={className} aria-hidden="true" focusable="false">
      <path d={PATH} pathLength={1} fill="none" stroke="var(--shu)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" className="hanamaru-path" style={{ ["--len" as string]: 1 }} />
    </svg>
  );
}

/** The 合格 (passed) seal, in the teacher's red. */
export function PassSeal() {
  return (
    <span
      lang="ja"
      aria-hidden="true"
      className="seal-in study-text inline-flex h-12 w-12 rotate-[-8deg] items-center justify-center rounded-[6px] border-[3px] border-shu text-lg font-semibold leading-none text-shu"
    >
      合格
    </span>
  );
}

/** ○ and × review marks, always paired with words by the caller. */
export function ReviewMark({ correct }: { correct: boolean }) {
  return (
    <span aria-hidden="true" className="study-text inline-block w-7 text-center text-2xl leading-none text-shu">
      {correct ? "○" : "×"}
    </span>
  );
}
