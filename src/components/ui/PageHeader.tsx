import React from "react";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
  /** Second row: badges, tabs, filters — rendered below the title row */
  secondary?: React.ReactNode;
}

export function PageHeader({ title, subtitle, onBack, actions, secondary }: PageHeaderProps) {
  return (
    <div className="shrink-0 border-b border-border bg-panel">
      {/* Primary row */}
      <div className="flex items-center gap-3 px-5 py-3">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1 -ml-1 rounded text-slate-500 hover:text-slate-300 hover:bg-hover transition-colors cursor-default"
          >
            <ArrowLeft size={14} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-slate-100 tracking-tight truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
      {/* Secondary row (tabs, badges, etc.) */}
      {secondary && (
        <div className="px-5 pb-0">
          {secondary}
        </div>
      )}
    </div>
  );
}
