import { JLPT_LEVELS, type JlptLevel } from "@nihongo/shared";

const underline: Record<JlptLevel, string> = { N5: "border-n5", N4: "border-n4", N3: "border-n3", N2: "border-n2", N1: "border-n1" };

/** N5–N1 switcher; the selected level is underlined in its accent (§13). */
export function LevelSwitcher({ value, onChange, label = "JLPT level" }: { value: JlptLevel; onChange: (l: JlptLevel) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 border-b border-line">
      {JLPT_LEVELS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          onClick={() => onChange(l)}
          onKeyDown={(e) => {
            const i = JLPT_LEVELS.indexOf(l);
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              const next = JLPT_LEVELS[(i + (e.key === "ArrowRight" ? 1 : JLPT_LEVELS.length - 1)) % JLPT_LEVELS.length];
              onChange(next);
              (e.currentTarget.parentElement?.querySelector(`[data-level="${next}"]`) as HTMLElement | null)?.focus();
            }
          }}
          tabIndex={value === l ? 0 : -1}
          data-level={l}
          className={`-mb-px min-h-11 min-w-14 border-b-4 px-3 font-semibold ${value === l ? `${underline[l]} text-ink` : "border-transparent text-ink-2 hover:text-ink"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
