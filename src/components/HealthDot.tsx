import type { HealthLevel } from '../lib/health';

const MAP: Record<HealthLevel, { cls: string; title: string }> = {
  red:     { cls: 'bg-red-500',    title: 'Needs attention' },
  yellow:  { cls: 'bg-yellow-400', title: 'Watch' },
  green:   { cls: 'bg-green-400',  title: 'Healthy' },
  neutral: { cls: '',              title: '' },
};

export function HealthDot({ level }: { level: HealthLevel }) {
  if (level === 'neutral') return null;
  const { cls, title } = MAP[level];
  return <span title={title} className={`inline-block w-2 h-2 rounded-full ${cls} shrink-0`} />;
}
