import type { Status } from '../lib/types';

const cfg: Record<Status, { label: string; cls: string }> = {
  active:  { label: 'Active',  cls: 'bg-green-500/15 text-green-400 ring-green-500/30' },
  blocked: { label: 'Blocked', cls: 'bg-red-500/15 text-red-400 ring-red-500/30' },
  paused:  { label: 'Paused',  cls: 'bg-yellow-500/15 text-yellow-400 ring-yellow-500/30' },
  done:    { label: 'Done',    cls: 'bg-slate-500/15 text-slate-400 ring-slate-500/30' },
};

export function StatusBadge({ status }: { status: Status }) {
  const { label, cls } = cfg[status] ?? cfg.active;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${cls}`}>
      {label}
    </span>
  );
}
