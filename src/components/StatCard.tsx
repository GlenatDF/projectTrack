import type { LucideIcon } from 'lucide-react';

interface Props {
  label: string;
  value: number;
  icon: LucideIcon;
  accent?: 'green' | 'red' | 'yellow' | 'blue' | 'slate' | 'orange' | 'violet';
  onClick?: () => void;
  highlight?: boolean;
}

const accentMap = {
  green:  { icon: 'text-green-400',  bg: 'bg-green-500/10',  ring: 'ring-green-500/30' },
  red:    { icon: 'text-red-400',    bg: 'bg-red-500/10',    ring: 'ring-red-500/30' },
  yellow: { icon: 'text-yellow-400', bg: 'bg-yellow-500/10', ring: 'ring-yellow-500/30' },
  blue:   { icon: 'text-blue-400',   bg: 'bg-blue-500/10',   ring: 'ring-blue-500/30' },
  slate:  { icon: 'text-slate-400',  bg: 'bg-slate-500/10',  ring: 'ring-slate-500/30' },
  orange: { icon: 'text-orange-400', bg: 'bg-orange-500/10', ring: 'ring-orange-500/30' },
  violet: { icon: 'text-violet-400', bg: 'bg-violet-500/10', ring: 'ring-violet-500/30' },
};

export function StatCard({ label, value, icon: Icon, accent = 'violet', onClick, highlight }: Props) {
  const { icon: iconCls, bg, ring } = accentMap[accent];
  const highlightCls = highlight && value > 0 ? `ring-1 ${ring}` : '';
  return (
    <div
      className={`bg-card border border-border rounded-lg p-3.5 flex items-center gap-3 ${highlightCls} ${onClick ? 'cursor-pointer hover:bg-hover transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className={`w-8 h-8 rounded ${bg} flex items-center justify-center shrink-0`}>
        <Icon size={16} className={iconCls} />
      </div>
      <div>
        <div className="text-xl font-bold text-slate-100 leading-none">{value}</div>
        <div className="text-[11px] text-slate-500 mt-0.5 uppercase tracking-wide">{label}</div>
      </div>
    </div>
  );
}
