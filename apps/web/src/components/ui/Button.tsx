import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors select-none disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap no-underline";
const sizes: Record<Size, string> = {
  md: "min-h-11 px-4 text-base",
  sm: "min-h-11 px-3 text-sm sm:min-h-9",
};
const variants: Record<ButtonVariant, string> = {
  primary: "bg-ai text-white hover:bg-ai-hover",
  secondary: "bg-paper text-ink border border-line hover:bg-kasumi",
  ghost: "text-ai hover:bg-kasumi",
  danger: "bg-shu text-white hover:bg-shu-hover",
  success: "bg-matcha text-white",
};

export function buttonClass(variant: ButtonVariant = "primary", size: Size = "md", extra = "") {
  return `${base} ${sizes[size]} ${variants[variant]} ${extra}`;
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, CommonProps & ButtonHTMLAttributes<HTMLButtonElement>>(function Button(
  { variant = "primary", size = "md", icon, loading, children, className = "", disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  );
});

export function ButtonLink({ variant = "primary", size = "md", icon, children, className = "", ...rest }: CommonProps & LinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </Link>
  );
}

export function ButtonAnchor({ variant = "primary", size = "md", icon, children, className = "", ...rest }: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={buttonClass(variant, size, className)} {...rest}>
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </a>
  );
}

export function IconButton({ icon, label, className = "", ...rest }: { icon: IconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label} className={`inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-2 hover:bg-kasumi hover:text-ink disabled:opacity-40 ${className}`} {...rest}>
      <Icon name={icon} size={20} />
    </button>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin motion-reduce:animate-none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
