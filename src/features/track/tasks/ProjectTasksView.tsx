import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { SectionLabel } from '../../../components/ui/SectionLabel';
import { TaskShaperView } from './TaskShaperView';
import { TaskDetailView } from './TaskDetailView';
import { useSavedTasks } from './useSavedTasks';
import type { Task, TaskType, RiskLevel, TaskStatus } from './types';

const STATUS_COLORS: Record<TaskStatus, string> = {
  draft:   'bg-slate-500/15 text-slate-400 border-slate-500/25',
  ready:   'bg-blue-500/15 text-blue-300 border-blue-500/25',
  running: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  review:  'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  done:    'bg-green-500/15 text-green-300 border-green-500/25',
  failed:  'bg-red-500/15 text-red-300 border-red-500/25',
};

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

type View = 'list' | 'new' | 'detail';

export function ProjectTasksView({ projectId, repoPath }: { projectId: string; repoPath: string }) {
  const { tasks, addTask, updateTask } = useSavedTasks(projectId);
  const [view, setView] = useState<View>('list');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  function handleSaved() {
    setView('list');
  }

  function handleTaskClick(task: Task) {
    setSelectedTaskId(task.id);
    setView('detail');
  }

  function handleSaveDetail(updated: Task) {
    updateTask(updated.id, updated);
  }

  if (view === 'detail' && selectedTask) {
    return (
      <TaskDetailView
        task={selectedTask}
        repoPath={repoPath}
        onBack={() => setView('list')}
        onSave={handleSaveDetail}
      />
    );
  }

  return (
    <div className="px-5 py-4 max-w-2xl mx-auto space-y-4">

      {view === 'list' && (
        <>
          <div className="flex items-center justify-between">
            <SectionLabel>Tasks ({tasks.length})</SectionLabel>
            <Button variant="primary" size="sm" onClick={() => setView('new')}>
              <Plus size={12} /> New Task
            </Button>
          </div>

          {tasks.length === 0 ? (
            <div className="border border-border rounded-lg px-4 py-8 text-center">
              <p className="text-sm text-slate-500">No tasks yet.</p>
              <p className="text-xs text-slate-600 mt-1">Shape your first task to get started.</p>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              {tasks.map((task, i) => (
                <button
                  key={task.id}
                  onClick={() => handleTaskClick(task)}
                  className={`w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-hover transition-colors cursor-default ${
                    i < tasks.length - 1 ? 'border-b border-border-subtle' : ''
                  }`}
                >
                  <p className="flex-1 text-xs text-slate-200 truncate">{task.title}</p>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_COLORS[task.status]}`}>
                    {task.status}
                  </span>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${TYPE_COLORS[task.task_type]}`}>
                    {task.task_type}
                  </span>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${RISK_COLORS[task.risk_level]}`}>
                    {task.risk_level}
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-600 w-16 text-right">
                    {relativeDate(task.created_at)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {view === 'new' && (
        <>
          <div className="flex items-center justify-between">
            <SectionLabel>New Task</SectionLabel>
            <button
              onClick={() => setView('list')}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-default"
            >
              Cancel
            </button>
          </div>
          <TaskShaperView projectId={projectId} onSaved={handleSaved} onSaveTask={addTask} />
        </>
      )}


    </div>
  );
}
