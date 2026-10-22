import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const control =
  "w-full rounded-control border border-line bg-paper px-3 min-h-11 text-base text-ink placeholder:text-ink-2/70 aria-[invalid=true]:border-shu disabled:bg-kasumi";

interface FieldShellProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}

/** Label, hint, and error linked to the control with aria-describedby (§13 Accessibility). */
export function FieldShell({ label, hint, error, required, children, className = "" }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="text-ink-2"> (required)</span> : null}
      </label>
      {children({ id, describedBy, invalid: !!error })}
      {hint ? (
        <p id={hintId} className="text-sm text-ink-2">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-shu">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = { label: ReactNode; hint?: ReactNode; error?: string | null; lang?: string } & InputHTMLAttributes<HTMLInputElement>;

export function TextField({ label, hint, error, className, required, ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <input id={id} aria-describedby={describedBy} aria-invalid={invalid} required={required} className={control} {...rest} />
      )}
    </FieldShell>
  );
}

type TextAreaProps = { label: ReactNode; hint?: ReactNode; error?: string | null } & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({ label, hint, error, className, required, rows = 4, ...rest }: TextAreaProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <textarea id={id} rows={rows} aria-describedby={describedBy} aria-invalid={invalid} required={required} className={`${control} py-2`} {...rest} />
      )}
    </FieldShell>
  );
}

type SelectFieldProps = { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>;

export function SelectField({ label, hint, error, className, required, children, ...rest }: SelectFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <select id={id} aria-describedby={describedBy} aria-invalid={invalid} required={required} className={control} {...rest}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

export function Checkbox({ label, hint, error, className = "", ...rest }: { label: ReactNode; hint?: ReactNode; error?: string | null } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
        <input id={id} type="checkbox" aria-describedby={describedBy} aria-invalid={!!error} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--ai)]" {...rest} />
        <span className="text-base">{label}</span>
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="ml-8 text-sm text-ink-2">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="ml-8 text-sm text-shu">
          {error}
        </p>
      ) : null}
    </div>
  );
}
