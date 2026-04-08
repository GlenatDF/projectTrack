import type { Task, TaskType, RiskLevel } from './types';
import { SectionLabel } from '../../../components/ui/SectionLabel';

const TYPE_COLORS: Record<TaskType, string> = {
  feature:  'bg-blue-500/15 text-blue-300 border-blue-500/25',
  bug:      'bg-red-500/15 text-red-300 border-red-500/25',
  refactor: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
  test:     'bg-green-500/15 text-green-300 border-green-500/25',
  docs:     'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  chore:    'bg-slate-500/15 text-slate-300 border-slate-500/25',
};

const RISK_COLORS: Record<RiskLevel, string> = {
  low:    'bg-green-500/15 text-green-300 border-green-500/25',
  medium: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  high:   'bg-red-500/15 text-red-300 border-red-500/25',
};

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function TaskList({ tasks }: { tasks: Task[] }) {
  if (!tasks.length) return null;

  return (
    <div className="space-y-2">
      <SectionLabel>Saved tasks ({tasks.length})</SectionLabel>
      <div className="border border-border rounded-lg overflow-hidden">
        {tasks.map((task, i) => (
          <div
            key={task.id}
            className={`px-4 py-2.5 flex items-center gap-3 ${
              i < tasks.length - 1 ? 'border-b border-border-subtle' : ''
            }`}
          >
            <p className="flex-1 text-xs text-slate-200 truncate">{task.title}</p>
            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${TYPE_COLORS[task.task_type]}`}>
              {task.task_type}
            </span>
            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${RISK_COLORS[task.risk_level]}`}>
              {task.risk_level}
            </span>
            <span className="shrink-0 text-[10px] text-slate-600 w-16 text-right">
              {relativeDate(task.created_at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
