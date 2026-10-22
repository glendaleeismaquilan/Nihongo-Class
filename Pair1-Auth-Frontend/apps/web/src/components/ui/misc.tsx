import { useEffect, useRef, type ReactNode } from "react";
import { NavLink } from "react-router";
import type { JlptLevel } from "@nihongo/shared";
import { Spinner } from "./Button";
import { Icon } from "./Icon";
import { errorMessage } from "../../lib/api";

/** Paper panel on kasumi: 1px line border, 4px corners, no shadow (§13 Surfaces). */
export function Panel({ children, className = "", as: As = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" | "li" } & Record<string, unknown>) {
  return (
    <As className={`rounded-paper border border-line bg-paper ${className}`} {...rest}>
      {children}
    </As>
  );
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-[70ch] text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionTitle({ children, actions, id }: { children: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="text-lg">
        {children}
      </h2>
      {actions}
    </div>
  );
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-paper border border-dashed border-line bg-paper px-6 py-10 text-center">
      <p className="mx-auto max-w-[52ch] text-ink-2">{children}</p>
      {action ? <div className="mt-4 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-8 text-ink-2">
      <Spinner size={18} />
      <span>{label}…</span>
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="rounded-paper border border-line bg-paper px-4 py-4">
      <p className="text-shu">{errorMessage(error)}</p>
      {retry ? (
        <button type="button" className="mt-2 min-h-11 text-ai underline" onClick={retry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

type Tone = "neutral" | "success" | "danger" | "info" | "warning";
const tones: Record<Tone, string> = {
  neutral: "border-line text-ink-2 bg-paper",
  success: "border-matcha/40 text-matcha bg-paper",
  danger: "border-shu/40 text-shu bg-paper",
  info: "border-ai/40 text-ai bg-paper",
  warning: "border-line text-ink bg-kasumi",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-control border px-2 py-0.5 text-sm font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

export function Alert({ children, tone = "info", title }: { children: ReactNode; tone?: "info" | "danger" | "success"; title?: ReactNode }) {
  const color = tone === "danger" ? "border-shu/50" : tone === "success" ? "border-matcha/50" : "border-ai/40";
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex gap-3 rounded-paper border ${color} bg-paper px-4 py-3`}>
      <Icon name={tone === "danger" ? "alert" : tone === "success" ? "check" : "info"} className={tone === "danger" ? "mt-0.5 text-shu" : tone === "success" ? "mt-0.5 text-matcha" : "mt-0.5 text-ai"} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className={tone === "danger" ? "text-shu" : "text-ink"}>{children}</div>
      </div>
    </div>
  );
}

const levelVar: Record<JlptLevel, string> = { N5: "bg-n5", N4: "bg-n4", N3: "bg-n3", N2: "bg-n2", N1: "bg-n1" };
const levelBorder: Record<JlptLevel, string> = { N5: "border-l-n5", N4: "border-l-n4", N3: "border-l-n3", N2: "border-l-n2", N1: "border-l-n1" };

/** Level accent as a small mark with the level name in ink beside it (§13). */
export function LevelTag({ level }: { level: JlptLevel }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
      <span aria-hidden="true" className={`inline-block h-3 w-1 rounded-sm ${levelVar[level]}`} />
      {level}
    </span>
  );
}

/** 4px level stripe on a card's left edge. */
export function levelStripe(level: JlptLevel | null | undefined) {
  return level ? `border-l-4 ${levelBorder[level]}` : "";
}

export function levelFill(level: JlptLevel) {
  return levelVar[level];
}

export function ProgressBar({ value, label, className = "" }: { value: number; label: string; className?: string }) {
  return (
    <div className={`h-1 w-full overflow-hidden rounded-full bg-line ${className}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="h-full bg-ai transition-[width]" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

export interface TabItem {
  to: string;
  label: string;
  end?: boolean;
  locked?: boolean;
}

/** Route-based tabs (class workspace, class page). */
export function RouteTabs({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1">
        {items.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-1.5 border-b-2 px-3 whitespace-nowrap no-underline ${isActive ? "border-ai font-medium text-ai" : "border-transparent text-ink-2 hover:text-ink"}`
              }
            >
              {t.label}
              {t.locked ? <Icon name="lock" size={14} aria-label="Locked" /> : null}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** State-based segmented control. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-control border border-line bg-paper p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 rounded-[6px] px-3 text-sm ${value === o.value ? "bg-ai text-white" : "text-ink-2 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Native <dialog> modal with focus handling. */
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`m-auto w-[calc(100%-32px)] ${wide ? "max-w-3xl" : "max-w-lg"} rounded-paper border border-line bg-paper p-0 text-ink backdrop:bg-ink/40`}
      aria-labelledby="dialog-title"
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <h2 id="dialog-title" className="text-lg">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-2 hover:bg-kasumi">
              <Icon name="x" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Panel className="px-4 py-3" as="div">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {hint ? <p className="mt-0.5 text-sm text-ink-2">{hint}</p> : null}
    </Panel>
  );
}

export function DataTable({ children, label, className = "" }: { children: ReactNode; label: string; className?: string }) {
  return (
    <div className={`data-table-wrap max-h-[70vh] ${className}`} role="region" aria-label={label} tabIndex={0}>
      <table className="data-table">{children}</table>
    </div>
  );
}
