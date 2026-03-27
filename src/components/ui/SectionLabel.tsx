import React from "react";

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export function SectionLabel({ children, className = "", action }: SectionLabelProps) {
  return (
    <div className={["flex items-center justify-between", className].join(" ")}>
      <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        {children}
      </span>
      {action && <div>{action}</div>}
    </div>
  );
}
