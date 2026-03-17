import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { getProjectPlan, updateTaskStatus, updatePhaseStatus } from '../../lib/api';
import type { ProjectPhase, ProjectTask, ProjectPlan, TaskStatus, PhaseStatus } from '../../lib/types';
import { CategoryBadge } from './CategoryBadge';

interface Props {
  projectId: number;
  planVersion: number;
  onGeneratePlan: () => void;
}

export function PhasesView({ projectId, planVersion, onGeneratePlan }: Props) {
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    load();
  }, [projectId, planVersion]);

  async function load() {
    setLoading(true);
    try {
      const p = await getProjectPlan(projectId);
      setPlan(p);
      // Auto-expand the first in-progress or pending phase
      const first = p.phases.find(ph => ph.status === 'in_progress') ??
                    p.phases.find(ph => ph.status === 'pending');
      if (first) setExpanded(new Set([first.id]));
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(phaseId: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  }

  async function handleTaskStatus(task: ProjectTask, status: TaskStatus) {
    // Optimistic update
    setPlan(prev => prev ? {
      ...prev,
      tasks: prev.tasks.map(t => t.id === task.id ? { ...t, status, user_modified: true } : t),
    } : prev);
    try {
      const updated = await updateTaskStatus(task.id, status);
      setPlan(prev => prev ? {
        ...prev,
        tasks: prev.tasks.map(t => t.id === task.id ? updated : t),
      } : prev);
    } catch {
      // Revert on error
      setPlan(prev => prev ? {
        ...prev,
        tasks: prev.tasks.map(t => t.id === task.id ? task : t),
      } : prev);
    }
  }

  async function handlePhaseStatus(phase: ProjectPhase, status: PhaseStatus) {
    setPlan(prev => prev ? {
      ...prev,
      phases: prev.phases.map(p => p.id === phase.id ? { ...p, status, user_modified: true } : p),
    } : prev);
    try {
      const updated = await updatePhaseStatus(phase.id, status);
      setPlan(prev => prev ? {
        ...prev,
        phases: prev.phases.map(p => p.id === phase.id ? updated : p),
      } : prev);
    } catch {
      setPlan(prev => prev ? {
        ...prev,
        phases: prev.phases.map(p => p.id === phase.id ? phase : p),
      } : prev);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        Loading plan…
      </div>
    );
  }

  if (!plan || plan.phases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Sparkles size={36} className="text-gray-600" />
        <p className="text-gray-400 text-sm text-center max-w-xs">
          No plan yet. Generate one by pasting your project details into an AI and importing the
          response.
        </p>
        <button
          onClick={onGeneratePlan}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium"
        >
          <Sparkles size={14} />
          Generate Plan
        </button>
      </div>
    );
  }

  // Group tasks by phase_id; orphaned = phase_id is null or phase no longer exists
  const phaseIds = new Set(plan.phases.map(p => p.id));
  const tasksByPhase = new Map<number, ProjectTask[]>();
  const orphaned: ProjectTask[] = [];

  for (const task of plan.tasks) {
    if (task.phase_id === null || !phaseIds.has(task.phase_id)) {
      orphaned.push(task);
    } else {
      const arr = tasksByPhase.get(task.phase_id) ?? [];
      arr.push(task);
      tasksByPhase.set(task.phase_id, arr);
    }
  }

  const phaseStatusIcon = (s: PhaseStatus) => {
    if (s === 'done') return '✓';
    if (s === 'in_progress') return '◑';
    if (s === 'skipped') return '—';
    return '○';
  };

  const taskStatusColors: Record<TaskStatus, string> = {
    pending:     'border-gray-600',
    in_progress: 'border-blue-500 bg-blue-500/10',
    done:        'border-green-500 bg-green-500/10',
    skipped:     'border-gray-700 opacity-50',
  };

  return (
    <div className="space-y-2">
      {plan.phases.map(phase => {
        const tasks = tasksByPhase.get(phase.id) ?? [];
        const open = expanded.has(phase.id);
        const doneCount = tasks.filter(t => t.status === 'done').length;

        return (
          <div
            key={phase.id}
            className="border border-[#2a2d3a] rounded-lg overflow-hidden"
          >
            {/* Phase header */}
            <div
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors ${
                phase.status === 'done' ? 'opacity-60' : ''
              }`}
              onClick={() => toggleExpand(phase.id)}
            >
              <span className="text-gray-500 text-sm w-4 text-center">
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <span
                className="text-xs w-5 text-center cursor-pointer"
                title={`Status: ${phase.status} — click to cycle`}
                onClick={e => {
                  e.stopPropagation();
                  const next: Record<PhaseStatus, PhaseStatus> = {
                    pending: 'in_progress',
                    in_progress: 'done',
                    done: 'pending',
                    skipped: 'pending',
                  };
                  handlePhaseStatus(phase, next[phase.status]);
                }}
              >
                {phaseStatusIcon(phase.status)}
              </span>
              <span className="text-xs text-gray-500 font-mono w-8">P{phase.phase_number}</span>
              <span className="flex-1 text-sm font-medium text-gray-200">{phase.name}</span>
              {tasks.length > 0 && (
                <span className="text-xs text-gray-500">
                  {doneCount}/{tasks.length}
                </span>
              )}
              {phase.estimated_duration && (
                <span className="text-xs text-gray-600">{phase.estimated_duration}</span>
              )}
              {phase.user_modified && (
                <span className="text-xs text-amber-600" title="You've modified this phase">✎</span>
              )}
            </div>

            {/* Tasks */}
            {open && (
              <div className="border-t border-[#2a2d3a] divide-y divide-[#2a2d3a]/50">
                {tasks.length === 0 && (
                  <p className="px-10 py-3 text-xs text-gray-600 italic">No tasks in this phase.</p>
                )}
                {tasks.map(task => (
                  <div
                    key={task.id}
                    className={`flex items-start gap-3 px-4 py-2.5 group ${
                      task.status === 'skipped' ? 'opacity-50' : ''
                    }`}
                  >
                    <button
                      className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs transition-colors ${taskStatusColors[task.status]}`}
                      onClick={() => {
                        const next: Record<TaskStatus, TaskStatus> = {
                          pending: 'in_progress',
                          in_progress: 'done',
                          done: 'pending',
                          skipped: 'pending',
                        };
                        handleTaskStatus(task, next[task.status]);
                      }}
                      title={`Mark as ${
                        task.status === 'done' ? 'pending' :
                        task.status === 'in_progress' ? 'done' : 'in progress'
                      }`}
                    >
                      {task.status === 'done' ? '✓' : task.status === 'in_progress' ? '◑' : ''}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm ${task.status === 'done' ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                          {task.title}
                        </span>
                        <CategoryBadge category={task.category} />
                        {task.effort_estimate && (
                          <span className="text-xs text-gray-600">{task.effort_estimate}</span>
                        )}
                        {task.user_modified && (
                          <span className="text-xs text-amber-600" title="You've modified this task">✎</span>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{task.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Orphaned tasks */}
      {orphaned.length > 0 && (
        <div className="border border-amber-700/30 bg-amber-900/10 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-700/20">
            <span className="text-amber-400 text-sm font-medium">
              Orphaned tasks ({orphaned.length})
            </span>
            <p className="text-amber-600 text-xs mt-0.5">
              These tasks were preserved but their original phase was replaced.
            </p>
          </div>
          {orphaned.map(task => (
            <div key={task.id} className="flex items-start gap-3 px-4 py-2.5">
              <button
                className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs ${taskStatusColors[task.status]}`}
                onClick={() => {
                  const next: Record<TaskStatus, TaskStatus> = {
                    pending: 'in_progress', in_progress: 'done', done: 'pending', skipped: 'pending',
                  };
                  handleTaskStatus(task, next[task.status]);
                }}
              >
                {task.status === 'done' ? '✓' : ''}
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-300">{task.title}</span>
                  <CategoryBadge category={task.category} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
