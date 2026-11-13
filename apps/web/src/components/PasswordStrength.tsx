// Password strength indicator for the sign-up form. Four bars + a label.
// Heuristic score 0-4: length + character class diversity.
export function scorePassword(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length;
  if (classes >= 2) score++;
  if (classes >= 3) score++;
  if (pw.length < 8) score = Math.min(score, 1);
  const labels = ["Too short", "Weak", "Fair", "Strong", "Very strong"];
  return { score: Math.min(score, 4), label: labels[Math.min(score, 4)] };
}

const COLORS = ["bg-ink-2", "bg-shu", "bg-amber-600", "bg-matcha", "bg-emerald-600"];
const TEXT = ["text-ink-2", "text-shu", "text-amber-700", "text-matcha", "text-emerald-700"];

export function PasswordStrength({ password }: { password: string }) {
  const { score, label } = scorePassword(password);
  if (!password) return null;
  return (
    <div className="mt-1">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded ${i < Math.max(1, score) ? COLORS[score] : "bg-line"}`} />
        ))}
      </div>
      <p className={`mt-1 text-xs ${TEXT[score]}`} role="status" aria-live="polite">
        Strength: {label}
      </p>
    </div>
  );
}
