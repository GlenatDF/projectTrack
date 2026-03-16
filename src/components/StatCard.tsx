import type { LucideIcon } from 'lucide-react';

interface Props {
  label: string;
  value: number;
  icon: LucideIcon;
  accent?: 'green' | 'red' | 'yellow' | 'blue' | 'slate' | 'orange' | 'indigo';
  onClick?: () => void;
  highlight?: boolean;
}

const accentMap = {
  green:  { icon: 'text-green-400',  bg: 'bg-green-500/10',  ring: 'ring-green-500/40' },
  red:    { icon: 'text-red-400',    bg: 'bg-red-500/10',    ring: 'ring-red-500/40' },
  yellow: { icon: 'text-yellow-400', bg: 'bg-yellow-500/10', ring: 'ring-yellow-500/40' },
  blue:   { icon: 'text-blue-400',   bg: 'bg-blue-500/10',   ring: 'ring-blue-500/40' },
  slate:  { icon: 'text-slate-400',  bg: 'bg-slate-500/10',  ring: 'ring-slate-500/40' },
  orange: { icon: 'text-orange-400', bg: 'bg-orange-500/10', ring: 'ring-orange-500/40' },
  indigo: { icon: 'text-indigo-400', bg: 'bg-indigo-500/10', ring: 'ring-indigo-500/40' },
};

export function StatCard({ label, value, icon: Icon, accent = 'indigo', onClick, highlight }: Props) {
  const { icon: iconCls, bg, ring } = accentMap[accent];
  const highlightCls = highlight && value > 0 ? `ring-1 ${ring}` : '';
  return (
    <div
      className={`bg-card border border-border rounded-xl p-4 flex items-center gap-4 ${highlightCls} ${onClick ? 'cursor-pointer hover:bg-hover transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
        <Icon size={18} className={iconCls} />
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-100 leading-none">{value}</div>
        <div className="text-xs text-slate-400 mt-1">{label}</div>
      </div>
    </div>
  );
}
