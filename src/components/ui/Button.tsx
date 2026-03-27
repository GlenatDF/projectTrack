import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size    = "sm" | "md" | "icon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: React.ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:   "bg-violet-600 hover:bg-violet-500 text-white border border-transparent",
  secondary: "bg-surface border border-border hover:bg-hover text-slate-300",
  ghost:     "bg-transparent hover:bg-hover text-slate-400 hover:text-slate-200 border border-transparent",
  danger:    "bg-transparent hover:bg-red-500/10 text-red-400 border border-transparent",
};

const sizeClasses: Record<Size, string> = {
  sm:   "px-2.5 py-1 text-xs",
  md:   "px-3 py-1.5 text-sm",
  icon: "p-1.5",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors cursor-default",
        "disabled:opacity-40 disabled:pointer-events-none",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
