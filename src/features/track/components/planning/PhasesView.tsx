import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { getProjectPlan, updateTaskStatus, updatePhaseStatus, updateTaskProgressNote } from '../../../../lib/api';
import type { ProjectPhase, ProjectTask, ProjectPlan, TaskStatus, PhaseStatus } from '../../../../lib/types';
import { CategoryBadge } from './CategoryBadge';
import { Button } from '../../../../components/ui/Button';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { SectionLabel } from '../../../../components/ui/SectionLabel';

interface Props {
  projectId: number;
  planVersion: number;
  isActive: boolean;
  onGeneratePlan: () => void;
}

// Status cycle: pending → in_progress → paused → done → pending
const TASK_STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  pending:     'in_progress',
  in_progress: 'paused',
  paused:      'done',
  done:        'pending',
  blocked:     'in_progress',
  skipped:     'pending',
};

const TASK_STATUS_ICON: Record<TaskStatus, string> = {
  pending:     '○',
  in_progress: '▶',
  paused:      '⏸',
  blocked:     '⊘',
  done:        '✓',
  skipped:     '—',
};

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending:     'Pending',
  in_progress: 'In progress',
  paused:      'Paused',
  blocked:     'Blocked',
  done:        'Done',
  skipped:     'Skipped',
};

export function PhasesView({ projectId, planVersion, isActive, onGeneratePlan }: Props) {
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editingNote, setEditingNote] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (isActive) load();
  }, [isActive, projectId, planVersion]);

  async function load() {
    setLoading(true);
    try {
      const p = await getProjectPlan(projectId);
      setPlan(p);
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
    setPlan(prev => prev ? {
      ...prev,
      tasks: prev.tasks.map(t => t.id === task.id ? { ...t, status, user_modified: true } : t),
    } : prev);
    // Auto-show progress note when moving to in_progress or paused
    if (status === 'in_progress' || status === 'paused') {
      setEditingNote(prev => new Set(prev).add(task.id));
    }
    try {
      const updated = await updateTaskStatus(task.id, projectId, status);
      setPlan(prev => prev ? {
        ...prev,
        tasks: prev.tasks.map(t => t.id === task.id ? updated : t),
      } : prev);
    } catch {
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
      const updated = await updatePhaseStatus(phase.id, projectId, status);
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

  async function handleSaveNote(task: ProjectTask, note: string) {
    try {
      const updated = await updateTaskProgressNote(task.id, projectId, note);
      setPlan(prev => prev ? {
        ...prev,
        tasks: prev.tasks.map(t => t.id === task.id ? updated : t),
      } : prev);
    } catch { /* keep local state */ }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-xs">
        Loading plan…
      </div>
    );
  }

  if (!plan || plan.phases.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles size={20} />}
        title="No plan yet"
        description="Generate a plan to populate this view"
        action={
          <Button variant="primary" size="sm" onClick={onGeneratePlan}>
            <Sparkles size={12} /> Generate Plan
          </Button>
        }
      />
    );
  }

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

  const taskStatusCls = (s: TaskStatus): string => {
    switch (s) {
      case 'in_progress': return 'border-blue-500 bg-blue-500/10 text-blue-400';
      case 'paused':      return 'border-amber-500 bg-amber-500/10 text-amber-400';
      case 'blocked':     return 'border-red-500 bg-red-500/10 text-red-400';
      case 'done':        return 'border-green-500 bg-green-500/10 text-green-400';
      case 'skipped':     return 'border-slate-700 text-slate-600';
      default:            return 'border-slate-600 text-slate-500';
    }
  };

  return (
    <div className="space-y-1.5">
      {plan.phases.map(phase => {
        const tasks = tasksByPhase.get(phase.id) ?? [];
        const open = expanded.has(phase.id);
        const doneCount = tasks.filter(t => t.status === 'done').length;

        return (
          <div key={phase.id} className="border border-border rounded-lg overflow-hidden">
            {/* Phase header */}
            <div
              className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-hover transition-colors ${
                phase.status === 'done' ? 'opacity-50' : ''
              }`}
              onClick={() => toggleExpand(phase.id)}
            >
              <span className="text-slate-600 w-3.5">
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
              <span
                className="text-xs w-4 text-center text-slate-500 cursor-pointer hover:text-slate-300 transition-colors"
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
              <span className="text-[11px] text-slate-600 font-mono w-6">P{phase.phase_number}</span>
              <span className="flex-1 text-xs font-medium text-slate-200">{phase.name}</span>
              {tasks.length > 0 && (
                <span className="text-[11px] text-slate-500">{doneCount}/{tasks.length}</span>
              )}
              {phase.estimated_duration && (
                <span className="text-[11px] text-slate-600">{phase.estimated_duration}</span>
              )}
              {phase.user_modified && (
                <span className="text-[11px] text-amber-600" title="Modified">✎</span>
              )}
            </div>

            {/* Tasks */}
            {open && (
              <div className="border-t border-border-subtle">
                {tasks.length === 0 && (
                  <p className="px-10 py-3 text-xs text-slate-600 italic">No tasks in this phase.</p>
                )}
                {tasks.map((task, i) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    isLast={i === tasks.length - 1}
                    showNote={editingNote.has(task.id)}
                    onToggleNote={() => setEditingNote(prev => {
                      const next = new Set(prev);
                      if (next.has(task.id)) next.delete(task.id);
                      else next.add(task.id);
                      return next;
                    })}
                    onStatusClick={() => handleTaskStatus(task, TASK_STATUS_CYCLE[task.status])}
                    onSaveNote={(note) => handleSaveNote(task, note)}
                    taskStatusCls={taskStatusCls}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Orphaned tasks */}
      {orphaned.length > 0 && (
        <div className="border border-amber-700/30 bg-amber-900/10 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-amber-700/20">
            <SectionLabel>Orphaned tasks ({orphaned.length})</SectionLabel>
            <p className="text-[11px] text-amber-700 mt-0.5">
              Preserved from previous plan import.
            </p>
          </div>
          {orphaned.map((task, i) => (
            <TaskRow
              key={task.id}
              task={task}
              isLast={i === orphaned.length - 1}
              showNote={editingNote.has(task.id)}
              onToggleNote={() => setEditingNote(prev => {
                const next = new Set(prev);
                if (next.has(task.id)) next.delete(task.id);
                else next.add(task.id);
                return next;
              })}
              onStatusClick={() => handleTaskStatus(task, TASK_STATUS_CYCLE[task.status])}
              onSaveNote={(note) => handleSaveNote(task, note)}
              taskStatusCls={taskStatusCls}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── TaskRow ───────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: ProjectTask;
  isLast: boolean;
  showNote: boolean;
  onToggleNote: () => void;
  onStatusClick: () => void;
  onSaveNote: (note: string) => void;
  taskStatusCls: (s: TaskStatus) => string;
}

function TaskRow({ task, isLast, showNote, onToggleNote, onStatusClick, onSaveNote, taskStatusCls }: TaskRowProps) {
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(task.progress_note);

  // Sync draft when task updates from DB
  useEffect(() => { setDraft(task.progress_note); }, [task.progress_note]);

  // Focus textarea when shown
  useEffect(() => {
    if (showNote) noteRef.current?.focus();
  }, [showNote]);

  const isActive = task.status === 'in_progress' || task.status === 'paused' || task.status === 'blocked';

  return (
    <div className={`${task.status === 'skipped' ? 'opacity-40' : ''} ${!isLast ? 'border-b border-border-subtle' : ''}`}>
      <div className="flex items-start gap-3 px-4 py-2">
        {/* Status button */}
        <button
          className={`mt-0.5 w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center text-[10px] transition-colors cursor-default ${taskStatusCls(task.status)}`}
          onClick={onStatusClick}
          title={`${TASK_STATUS_LABEL[task.status]} — click to advance`}
        >
          {task.status !== 'pending' ? TASK_STATUS_ICON[task.status] : ''}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs ${task.status === 'done' ? 'line-through text-slate-600' : 'text-slate-300'}`}>
              {task.title}
            </span>
            <CategoryBadge category={task.category} />
            {task.effort_estimate && (
              <span className="text-[11px] text-slate-600">{task.effort_estimate}</span>
            )}
            {task.user_modified && (
              <span className="text-[11px] text-amber-600" title="Modified">✎</span>
            )}
            {/* Note toggle — always visible for active tasks, hover for others */}
            {(isActive || task.progress_note) && (
              <button
                onClick={onToggleNote}
                className={`text-[10px] px-1 rounded transition-colors ${
                  showNote
                    ? 'text-violet-400 bg-violet-500/10'
                    : task.progress_note
                      ? 'text-slate-400 hover:text-violet-400'
                      : 'text-slate-600 hover:text-slate-400'
                }`}
                title={task.progress_note ? 'Edit progress note' : 'Add progress note'}
              >
                {task.progress_note ? '✎ note' : '+ note'}
              </button>
            )}
          </div>
          {task.description && !showNote && (
            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{task.description}</p>
          )}
          {/* Inline progress note */}
          {showNote && (
            <textarea
              ref={noteRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={() => onSaveNote(draft)}
              placeholder="Progress note, blocker, or resume hint…"
              rows={2}
              className="mt-1.5 w-full text-[11px] bg-surface border border-border-subtle rounded px-2 py-1.5
                         text-slate-300 placeholder-slate-600 resize-none focus:outline-none focus:border-violet-500/50"
            />
          )}
          {/* Show saved note preview when not editing */}
          {!showNote && task.progress_note && (
            <p className="text-[11px] text-slate-500 mt-0.5 italic leading-relaxed">{task.progress_note}</p>
          )}
        </div>
      </div>
    </div>
  );
}
