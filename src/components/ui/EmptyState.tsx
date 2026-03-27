import React from "react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      {icon && (
        <div className="text-slate-600">{icon}</div>
      )}
      <div className="text-center">
        <p className="text-sm font-medium text-slate-400">{title}</p>
        {description && (
          <p className="text-xs text-slate-600 mt-1">{description}</p>
        )}
      </div>
      {action && action}
    </div>
  );
}
