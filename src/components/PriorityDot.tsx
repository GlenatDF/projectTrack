import type { Priority } from '../lib/types';

const cfg: Record<Priority, { color: string; label: string }> = {
  high:   { color: 'bg-red-400',    label: 'High' },
  medium: { color: 'bg-yellow-400', label: 'Medium' },
  low:    { color: 'bg-slate-400',  label: 'Low' },
};

export function PriorityDot({ priority }: { priority: Priority }) {
  const { color, label } = cfg[priority] ?? cfg.medium;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
