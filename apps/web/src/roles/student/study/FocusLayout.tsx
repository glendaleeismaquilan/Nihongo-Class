import type { ReactNode } from "react";
import { Link } from "react-router";
import { Icon, ProgressBar } from "../../../components/ui";
import { OfflineBanner } from "../../../components/layout/OfflineBanner";

/**
 * §13 focus mode: navigation hides, Exit sits top-left, and progress reads
 * "Question 3 of 10" beside a thin --ai bar.
 */
export function FocusLayout({
  exitTo,
  title,
  progress,
  children,
  wide,
  background = "kasumi",
}: {
  exitTo: string;
  title: string;
  progress?: { current: number; total: number; noun?: string } | null;
  children: ReactNode;
  wide?: boolean;
  background?: "kasumi" | "genko";
}) {
  return (
    <div className={`min-h-dvh ${background === "genko" ? "genko" : "bg-kasumi"}`}>
      <OfflineBanner />
      <header className="sticky top-0 z-10 border-b border-line bg-paper">
        <div className={`mx-auto flex items-center gap-3 px-4 py-1 ${wide ? "max-w-[1120px]" : "max-w-3xl"}`}>
          <Link to={exitTo} className="inline-flex min-h-11 items-center gap-1 rounded-control px-2 font-medium no-underline hover:bg-kasumi">
            <Icon name="x" size={18} />
            Exit
          </Link>
          <p className="min-w-0 flex-1 truncate text-center text-sm text-ink-2" lang="ja">
            {title}
          </p>
          {progress ? (
            <div className="flex w-40 flex-col items-end gap-1 sm:w-56">
              <span className="text-sm text-ink-2" aria-live="off">
                {progress.noun ?? "Question"} {Math.min(progress.current, progress.total)} of {progress.total}
              </span>
              <ProgressBar value={progress.total ? progress.current / progress.total : 0} label={`${progress.noun ?? "Question"} ${progress.current} of ${progress.total}`} />
            </div>
          ) : (
            <span className="w-16" />
          )}
        </div>
      </header>
      <main id="main" className={`mx-auto px-4 pb-16 pt-6 ${wide ? "max-w-[1120px]" : "max-w-3xl"}`}>
        {children}
      </main>
    </div>
  );
}
