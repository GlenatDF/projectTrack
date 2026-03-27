import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** flat = panel/card header zone color (slightly darker) */
  flat?: boolean;
  /** noPad = no default p-4 padding (for compound panels) */
  noPad?: boolean;
}

export function Card({ children, className = "", flat = false, noPad = false }: CardProps) {
  return (
    <div
      className={[
        "border border-border rounded-lg",
        flat ? "bg-panel" : "bg-card",
        noPad ? "" : "p-4",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, className = "" }: CardHeaderProps) {
  return (
    <div className={["px-4 py-3 border-b border-border flex items-center justify-between", className].join(" ")}>
      {children}
    </div>
  );
}

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function CardBody({ children, className = "" }: CardBodyProps) {
  return (
    <div className={["p-4", className].join(" ")}>
      {children}
    </div>
  );
}
