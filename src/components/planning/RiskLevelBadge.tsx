import type { RiskLevel } from '../../lib/types';
import { RISK_LEVEL_COLORS } from '../../lib/types';

interface Props {
  level: RiskLevel;
}

export function RiskLevelBadge({ level }: Props) {
  const cls = RISK_LEVEL_COLORS[level] ?? 'bg-gray-500/20 text-gray-300';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>
      {level}
    </span>
  );
}
