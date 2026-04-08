import { useState, useEffect } from 'react';
import { Sparkles, AlertTriangle, Loader2, Bot, Cpu, Plus, X, CheckCircle2 } from 'lucide-react';
import { shapeTaskAI, shapeTaskMock } from './taskShaper';
import type { Task, TaskType, RiskLevel } from './types';
import type { ShapeSource } from './taskShaper';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionLabel } from '../../../components/ui/SectionLabel';
import { TaskList } from './TaskList';
import { useSavedTasks } from './useSavedTasks';

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<TaskType, string> = {
  feature:  'bg-blue-500/15 text-blue-300 border-blue-500/25',
  bug:      'bg-red-500/15 text-red-300 border-red-500/25',
  refactor: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
  test:     'bg-green-500/15 text-green-300 border-green-500/25',
  docs:     'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  chore:    'bg-slate-500/15 text-slate-300 border-slate-500/25',
};

const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high'];

// ── Shared sub-components ─────────────────────────────────────────────────────

function SourceBadge({ source }: { source: ShapeSource }) {
  if (source === 'ai') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/15 text-violet-300 border border-violet-500/25">
        <Bot size={9} /> AI
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-500/15 text-slate-400 border border-slate-500/25">
      <Cpu size={9} /> mock
    </span>
  );
}

function EditableList({ items, onChange }: { items: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={item}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
            className="flex-1 bg-surface border border-border rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-violet-500/50 transition-colors"
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="text-slate-600 hover:text-red-400 transition-colors cursor-default"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ''])}
        className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors cursor-default"
      >
        <Plus size={11} /> Add item
      </button>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

export function TaskShaperView({
  projectId,
  onSaved,
  onSaveTask,
}: {
  projectId?: string;
  onSaved?: () => void;
  onSaveTask?: (task: Task) => void;
} = {}) {
  const [raw, setRaw]           = useState('');
  const [shaping, setShaping]   = useState(false);
  const [aiError, setAiError]   = useState<string | null>(null);
  const [draft, setDraft]       = useState<Task | null>(null);
  const [source, setSource]     = useState<ShapeSource | null>(null);
  const { tasks: savedTasks, addTask } = useSavedTasks(onSaveTask ? undefined : projectId);
  const [justSaved, setJustSaved]     = useState(false);

  // Reset "Task saved" flash after 2.5s
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(t);
  }, [justSaved]);

  async function handleShape() {
    if (!raw.trim()) return;
    setShaping(true);
    setAiError(null);
    setDraft(null);
    setSource(null);
    setJustSaved(false);
    try {
      const result = await shapeTaskAI(raw.trim());
      setDraft(result);
      setSource('ai');
    } catch (err) {
      setAiError(String(err));
    } finally {
      setShaping(false);
    }
  }

  function handleUseMock() {
    setDraft(shapeTaskMock(raw));
    setSource('mock');
    setAiError(null);
  }

  function handleSave() {
    if (!draft) return;
    const task = { ...draft, project_id: projectId ?? '', created_at: new Date().toISOString() };
    if (onSaveTask) {
      onSaveTask(task);
    } else {
      addTask(task);
    }
    setJustSaved(true);
    onSaved?.();
  }

  function setField<K extends keyof Task>(key: K, value: Task[K]) {
    setDraft((d) => d ? { ...d, [key]: value } : d);
  }

  const embedded = projectId !== undefined;

  return (
    <div className={embedded ? undefined : 'flex-1 flex flex-col overflow-hidden'}>
      {!embedded && (
        <PageHeader
          title="Task Shaper"
          subtitle="Paste raw task input — get a structured task"
        />
      )}

      <div className={embedded ? undefined : 'flex-1 overflow-y-auto'}>
        <div className={`space-y-4 ${embedded ? 'px-0 py-0' : 'px-5 py-4 max-w-2xl mx-auto'}`}>

          {/* Raw input */}
          <div className="space-y-2">
            <SectionLabel>Raw input</SectionLabel>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              disabled={shaping}
              placeholder={`Describe the task in plain language.\n\nExamples:\n  "Fix the login button not working on mobile"\n  "Add dark mode toggle to settings page"\n  "Refactor the auth module to use the new session API"`}
              rows={6}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 resize-none transition-colors disabled:opacity-50"
            />
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={handleShape}
                disabled={!raw.trim() || shaping}
              >
                {shaping ? (
                  <><Loader2 size={12} className="animate-spin" /> Shaping…</>
                ) : (
                  <><Sparkles size={12} /> Shape Task</>
                )}
              </Button>
            </div>
          </div>

          {/* AI error */}
          {aiError && (
            <div className="space-y-2 p-3 rounded-lg border border-red-500/30 bg-red-500/5">
              <div className="flex items-start gap-2">
                <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-red-300">AI shaping failed</p>
                  <p className="text-xs text-red-400/80 font-mono break-all">{aiError}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={handleUseMock}>
                  <Cpu size={12} />
                  Use mock shaping instead
                </Button>
              </div>
            </div>
          )}

          {/* Task editor */}
          {draft && source && (
            <TaskEditor
              draft={draft}
              source={source}
              justSaved={justSaved}
              setField={setField}
              onSave={handleSave}
            />
          )}

          {/* Saved task list (standalone mode only) */}
          {!embedded && <TaskList tasks={savedTasks} />}

        </div>
      </div>
    </div>
  );
}

// ── Task editor ────────────────────────────────────────────────────────────────

function TaskEditor({
  draft,
  source,
  justSaved,
  setField,
  onSave,
}: {
  draft: Task;
  source: ShapeSource;
  justSaved: boolean;
  setField: <K extends keyof Task>(key: K, value: Task[K]) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Review &amp; edit</SectionLabel>
        <SourceBadge source={source} />
      </div>

      <div className="bg-card border border-border rounded-lg divide-y divide-border">

        {/* Title + type chip */}
        <div className="px-4 py-3 space-y-1.5">
          <p className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Title</p>
          <div className="flex items-center gap-2">
            <input
              value={draft.title}
              onChange={(e) => setField('title', e.target.value)}
              className="flex-1 bg-surface border border-border rounded px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500/50 transition-colors"
            />
            <span className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium border ${TYPE_COLORS[draft.task_type]}`}>
              {draft.task_type}
            </span>
          </div>
        </div>

        {/* Needs review banner */}
        <div className="px-4 py-2 flex items-center gap-2 bg-yellow-500/5">
          <AlertTriangle size={11} className="text-yellow-400 shrink-0" />
          <p className="text-xs text-yellow-300">Needs human review before execution</p>
        </div>

        {/* Risk level */}
        <div className="px-4 py-3 space-y-1.5">
          <p className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Risk level</p>
          <select
            value={draft.risk_level}
            onChange={(e) => setField('risk_level', e.target.value as RiskLevel)}
            className="bg-surface border border-border rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-violet-500/50 cursor-default transition-colors"
          >
            {RISK_LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        {/* Goal */}
        <div className="px-4 py-3 space-y-1.5">
          <p className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Goal</p>
          <textarea
            value={draft.goal}
            onChange={(e) => setField('goal', e.target.value)}
            rows={3}
            className="w-full bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-violet-500/50 resize-none transition-colors"
          />
        </div>

        {/* Scope */}
        <div className="px-4 py-3 space-y-1.5">
          <p className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Scope</p>
          <EditableList
            items={draft.scope}
            onChange={(v) => setField('scope', v)}
          />
        </div>

        {/* Out of scope */}
        <div className="px-4 py-3 space-y-1.5">
          <p className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Out of scope</p>
          <EditableList
            items={draft.out_of_scope}
            onChange={(v) => setField('out_of_scope', v)}
          />
        </div>

        {/* Success criteria */}
        <div className="px-4 py-3 space-y-1.5">
          <p className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Success criteria</p>
          <EditableList
            items={draft.success_criteria}
            onChange={(v) => setField('success_criteria', v)}
          />
        </div>

        {/* Ambiguities */}
        <div className="px-4 py-3 space-y-1.5">
          <p className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Ambiguities</p>
          <EditableList
            items={draft.ambiguities}
            onChange={(v) => setField('ambiguities', v)}
          />
        </div>

        {/* Save row */}
        <div className="px-4 py-3 flex items-center justify-between">
          {justSaved ? (
            <span className="flex items-center gap-1.5 text-xs text-green-400">
              <CheckCircle2 size={12} /> Task saved
            </span>
          ) : (
            <span />
          )}
          <Button variant="primary" size="sm" onClick={onSave}>
            Save Task
          </Button>
        </div>

      </div>
    </div>
  );
}
