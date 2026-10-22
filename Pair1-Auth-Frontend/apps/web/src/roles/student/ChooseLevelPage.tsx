import { useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { JLPT_LEVELS, type JlptLevel } from "@nihongo/shared";
import { api, errorMessage } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { Alert, Button, PageHeader, levelStripe } from "../../components/ui";

export const LEVEL_INFO: Record<JlptLevel, { name: string; description: string }> = {
  N5: { name: "Beginner", description: "Hiragana, katakana, about 100 kanji, and everyday phrases." },
  N4: { name: "Elementary", description: "Basic grammar and about 300 kanji for daily conversation." },
  N3: { name: "Intermediate", description: "Everyday Japanese at natural speed, about 650 kanji." },
  N2: { name: "Upper intermediate", description: "Newspapers, work conversations, about 1,000 kanji." },
  N1: { name: "Advanced", description: "Complex texts and nuanced speech, about 2,000 kanji." },
};

/** FR-3.6.2: the student chooses a study level for Self-Study. */
export function LevelPicker({ value, onChange, name = "level" }: { value: JlptLevel | null; onChange: (l: JlptLevel) => void; name?: string }) {
  return (
    <fieldset>
      <legend className="sr-only">JLPT level</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {JLPT_LEVELS.map((l) => (
          <label
            key={l}
            className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-paper border bg-paper px-4 py-3 ${levelStripe(l)} ${value === l ? "border-ai outline-2 outline-ai" : "border-line"}`}
          >
            <input type="radio" name={name} value={l} checked={value === l} onChange={() => onChange(l)} className="mt-1 h-5 w-5 accent-[var(--ai)]" />
            <span>
              <span className="font-semibold">
                {l} {LEVEL_INFO[l].name}
              </span>
              <span className="block text-sm text-ink-2">{LEVEL_INFO[l].description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ChooseLevelPage() {
  const me = useMe();
  const [level, setLevel] = useState<JlptLevel | null>(me.studyLevel ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function save() {
    if (!level) {
      setError("Choose a level to continue.");
      return;
    }
    setBusy(true);
    try {
      await api("/me", { method: "PATCH", body: { studyLevel: level } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      navigate("/s", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Choose your study level" description="Self-Study shows built-in flashcards, quizzes, and tests for this JLPT level. You can change it anytime." />
      {error ? (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
      <LevelPicker value={level} onChange={setLevel} />
      <Button className="mt-6" onClick={save} loading={busy}>
        Save level
      </Button>
    </div>
  );
}
