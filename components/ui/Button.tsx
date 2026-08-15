import { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

// Matches the button styles already used across the app (emerald-600 solid
// primary, bordered secondary, borderless ghost) — centralized so new social
// UI and any existing page adopting this don't each reinvent the same three
// variants with slightly different padding/radius.
const VARIANT_CLASSES = {
  primary: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-70",
  secondary: "border border-border bg-background text-foreground/80 hover:border-emerald-300 disabled:opacity-60",
  ghost: "text-foreground/70 hover:bg-sand-100 disabled:opacity-60",
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASSES;

export default function Button({
  variant = "primary",
  loading = false,
  className = "",
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
