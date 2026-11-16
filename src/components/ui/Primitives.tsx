import React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", ...props }, ref) => {
    const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
      primary:
        "bg-btn text-btn-text hover:bg-btn-hover border border-transparent shadow-sm neu-btn-primary",
      secondary:
        "bg-elevated text-primary hover:bg-border-strong border border-border-strong neu-btn-raised",
      destructive:
        "bg-error/10 text-error hover:bg-error/20 border border-error/40 neu-btn-raised",
      ghost:
        "bg-transparent text-secondary hover:text-primary hover:bg-elevated border border-transparent neu-btn-ghost",
    };

    const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
      sm: "h-8 px-2.5 text-xs rounded-sm",
      md: "h-9 px-3.5 text-sm rounded-sm",
      lg: "h-10 px-4 text-sm rounded-sm",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 font-medium transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "accent" | "success" | "warning" | "error" | "info";
}

export function Badge({ className, tone = "neutral", children, ...props }: BadgeProps) {
  const tones: Record<NonNullable<BadgeProps["tone"]>, string> = {
    neutral: "bg-elevated text-secondary border-border-strong",
    accent: "bg-accent/15 text-accent border-accent/30",
    success: "bg-success/15 text-success border-success/30",
    warning: "bg-warning/15 text-warning border-warning/30",
    error: "bg-error/15 text-error border-error/30",
    info: "bg-info/15 text-info border-info/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border",
        tones[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-9 w-full rounded-sm border border-border bg-input px-3 text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none transition-colors",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-9 w-full rounded-sm border border-border bg-input px-2.5 text-sm text-primary focus:border-accent focus:outline-none transition-colors",
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-secondary">
        {children}
      </label>
      {hint && <span className="text-[11px] font-mono text-muted">{hint}</span>}
    </div>
  );
}

export function SwitchToggle({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  id?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-center justify-between gap-3 py-1.5 cursor-pointer"
    >
      <div className="flex flex-col">
        <span className="text-sm text-primary">{label}</span>
        {description && <span className="text-xs text-muted">{description}</span>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors duration-150 neu-switch-track",
          checked ? "bg-accent border-accent" : "bg-input border-border-strong"
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-white transition-transform duration-150 neu-switch-thumb",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
    </label>
  );
}
