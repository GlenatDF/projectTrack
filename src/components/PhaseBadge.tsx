import type { Phase } from '../lib/types';
import { PHASE_LABELS } from '../lib/types';

const cls: Record<Phase, string> = {
  idea:        'bg-purple-500/15 text-purple-300',
  planning:    'bg-blue-500/15 text-blue-300',
  scaffolding: 'bg-cyan-500/15 text-cyan-300',
  core_build:  'bg-teal-500/15 text-teal-300',
  debugging:   'bg-orange-500/15 text-orange-300',
  testing:     'bg-yellow-500/15 text-yellow-300',
  polishing:   'bg-pink-500/15 text-pink-300',
  shipped:     'bg-green-500/15 text-green-300',
};

export function PhaseBadge({ phase }: { phase: Phase }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls[phase] ?? 'bg-slate-500/15 text-slate-300'}`}>
      {PHASE_LABELS[phase] ?? phase}
    </span>
  );
}
