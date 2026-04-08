import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, X, Plus, Play, Copy, Check,
  CheckCircle2, XCircle, Wand2, Pencil, Scan,
  CircleDot, Circle, Loader, ExternalLink,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { readProjectFile, openInVscode } from '../../../lib/api';
import type { Task, TaskType, RiskLevel, TaskStatus, TaskRun, RunStatus } from './types';
import { Button } from '../../../components/ui/Button';
import { buildRunPrompt } from './runPrompt';
import { useTaskRuns } from './useTaskRuns';
import { generateSummaryHeuristic } from './runSummary';

// ── Colour maps ─────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<TaskType, string> = {
  feature:  'bg-blue-500/15 text-blue-300 border-blue-500/25',
  bug:      'bg-red-500/15 text-red-300 border-red-500/25',
  refactor: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
  test:     'bg-green-500/15 text-green-300 border-green-500/25',
  docs:     'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  chore:    'bg-slate-500/15 text-slate-300 border-slate-500/25',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  draft:   'bg-slate-500/15 text-slate-400 border-slate-500/25',
  ready:   'bg-blue-500/15 text-blue-300 border-blue-500/25',
  running: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  review:  'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  done:    'bg-green-500/15 text-green-300 border-green-500/25',
  failed:  'bg-red-500/15 text-red-300 border-red-500/25',
};

const RUN_STATUS_COLORS: Record<RunStatus, string> = {
  pending: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
  running: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  done:    'bg-green-500/15 text-green-300 border-green-500/25',
  failed:  'bg-red-500/15 text-red-300 border-red-500/25',
};

const TASK_TYPES: TaskType[]      = ['feature', 'bug', 'refactor', 'test', 'docs', 'chore'];
const RISK_LEVELS: RiskLevel[]    = ['low', 'medium', 'high'];
const TASK_STATUSES: TaskStatus[] = ['draft', 'ready', 'running', 'review', 'done', 'failed'];
const TERMINAL_STATUSES = new Set<RunStatus>(['done', 'failed']);

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Extract meaningful keywords for preview line highlighting.
// Filters out short words and common stop words so highlights stay signal-rich.
const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'been', 'will', 'also',
  'into', 'when', 'then', 'than', 'were', 'they', 'them', 'their',
  'what', 'which', 'some', 'more', 'make', 'made', 'just', 'like',
]);

function extractHighlightTerms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
}

// Scan pasted output for file-path-like tokens (optional helper, merge-only)
function suggestFilesFromOutput(raw: string): string[] {
  const seen = new Set<string>();
  // Match tokens containing / that end with a known source extension
  const pattern = /\b([\w./-]+\.(?:ts|tsx|js|jsx|rs|css|scss|json|md|toml|yaml|yml))\b/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(raw)) !== null) {
    const p = m[1];
    // Require at least one slash (i.e. a path, not just a bare filename)
    // and exclude http/https URLs
    if (p.includes('/') && !p.startsWith('http')) seen.add(p);
  }
  return Array.from(seen).sort();
}

// ── EditableList ────────────────────────────────────────────────────────────────

function EditableList({
  items,
  placeholder,
  onChange,
}: {
  items: string[];
  placeholder?: string;
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={item}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
            className="flex-1 bg-surface border border-border rounded px-2.5 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition-colors font-mono"
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
        <Plus size={11} /> Add
      </button>
    </div>
  );
}

// ── FileRow (Changes tab) ───────────────────────────────────────────────────────

type FileStatus = 'idle' | 'loading' | 'exists' | 'missing' | 'unsafe';

function FileRow({
  path,
  repoPath,
  highlightTerms = [],
  onRemove,
  onChange,
}: {
  path: string;
  repoPath: string;
  highlightTerms?: string[];
  onRemove: () => void;
  onChange: (next: string) => void;
}) {
  const [status, setStatus]           = useState<FileStatus>('idle');
  const [preview, setPreview]         = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [localPath, setLocalPath]     = useState(path);
  const previewRef                    = useRef<HTMLPreElement>(null);

  // Scroll to first matched line whenever the preview is opened
  useEffect(() => {
    if (!showPreview || !previewRef.current) return;
    const firstMatch = previewRef.current.querySelector<HTMLElement>('[data-first-match]');
    firstMatch?.scrollIntoView({ block: 'nearest' });
  }, [showPreview]);

  // Re-check when the committed path prop changes.
  // Ignore flag prevents stale async results from overwriting fresh ones.
  useEffect(() => {
    setLocalPath(path);
    if (!path.trim() || !repoPath.trim()) { setStatus('idle'); return; }
    let ignore = false;
    setStatus('loading');
    setPreview(null);
    setShowPreview(false);
    readProjectFile(repoPath, path.trim())
      .then((content) => { if (!ignore) { setStatus('exists'); setPreview(content); } })
      .catch((e: unknown) => {
        if (!ignore) {
          const msg = String(e);
          setStatus(msg.includes('unsafe') ? 'unsafe' : 'missing');
        }
      });
    return () => { ignore = true; };
  }, [path, repoPath]);

  function handleBlur() {
    // Strip leading "./" noise and whitespace before committing
    const trimmed = localPath.trim().replace(/^\.\//, '');
    if (trimmed !== path) onChange(trimmed);
  }

  function handleOpen() {
    if (status !== 'exists' || !repoPath.trim()) return;
    const full = repoPath.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
    openInVscode(full).catch(() => {});
  }

  // Count matched lines for the collapsed hint — only when preview content is available
  const lines = preview ? preview.split('\n') : [];
  const matchCount = (highlightTerms.length > 0)
    ? lines.filter((l) => highlightTerms.some((t) => l.toLowerCase().includes(t))).length
    : 0;
  const firstMatchIdx = highlightTerms.length > 0
    ? lines.findIndex((l) => highlightTerms.some((t) => l.toLowerCase().includes(t)))
    : -1;

  const statusIcon = {
    idle:    <Circle size={10} className="text-slate-600" />,
    loading: <Loader size={10} className="text-slate-500 animate-spin" />,
    exists:  <CircleDot size={10} className="text-green-400" />,
    missing: <Circle size={10} className="text-slate-600" />,
    unsafe:  <Circle size={10} className="text-amber-500" />,
  }[status];

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="shrink-0 mt-0.5">{statusIcon}</span>
        <input
          value={localPath}
          placeholder="src/path/to/file.ts"
          onChange={(e) => setLocalPath(e.target.value)}
          onBlur={handleBlur}
          className={`flex-1 bg-surface border border-border rounded px-2 py-1 text-xs placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition-colors font-mono ${
            status === 'missing' ? 'text-slate-500' : 'text-slate-300'
          }`}
        />
        {status === 'exists' && (
          <>
            <button
              onClick={handleOpen}
              title="Open in editor"
              className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors cursor-default"
            >
              <ExternalLink size={12} />
            </button>
            {!showPreview && matchCount > 0 && (
              <span className="shrink-0 text-[10px] text-violet-400/70 tabular-nums">
                {matchCount} matched
              </span>
            )}
            <button
              onClick={() => setShowPreview((v) => !v)}
              title="Preview"
              className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors cursor-default"
            >
              {showPreview ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-slate-600 hover:text-red-400 transition-colors cursor-default"
        >
          <X size={12} />
        </button>
      </div>

      {showPreview && preview !== null && (
        <pre ref={previewRef} className="mt-1.5 ml-4 bg-surface border border-border rounded p-0 text-[10px] text-slate-400 leading-relaxed max-h-64 overflow-y-auto font-mono">
          {lines.map((line, i) => {
            const matched = highlightTerms.length > 0 &&
              highlightTerms.some((t) => line.toLowerCase().includes(t));
            return (
              <div
                key={i}
                {...(i === firstMatchIdx ? { 'data-first-match': '' } : {})}
                className={`flex items-start py-px border-l-2 ${matched ? 'bg-violet-500/15 text-slate-200 border-violet-500' : 'border-transparent'}`}
              >
                <span className="w-8 text-right shrink-0 text-slate-700 select-none pr-2 tabular-nums">
                  {i + 1}
                </span>
                <span className="flex-1 whitespace-pre-wrap break-words pr-2.5">
                  {line || ' '}
                </span>
              </div>
            );
          })}
        </pre>
      )}
    </div>
  );
}

// ── RunSummaryRow (left column) ─────────────────────────────────────────────────

function RunSummaryRow({
  run,
  runIndex,
  isSelected,
  onClick,
}: {
  run: TaskRun;
  runIndex: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const label = run.result_summary?.trim()
    || (run.raw_output?.trim() ? 'Output pasted — no summary' : 'No output yet');

  const timestamp = TERMINAL_STATUSES.has(run.status) && run.completed_at
    ? relativeDate(run.completed_at)
    : relativeDate(run.created_at);

  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-2 flex items-start gap-2 text-left transition-colors cursor-default border-b border-border-subtle last:border-0 ${
        isSelected ? 'bg-violet-500/10 border-l-2 border-l-violet-500' : 'hover:bg-hover border-l-2 border-l-transparent'
      }`}
    >
      <span className="shrink-0 text-[10px] text-slate-600 font-mono w-6 mt-0.5">#{runIndex}</span>
      <div className="flex-1 min-w-0 space-y-0.5">
        <span className={`inline-flex px-1 py-0.5 rounded text-[10px] font-medium border ${RUN_STATUS_COLORS[run.status]}`}>
          {run.status}
        </span>
        <p className="text-[11px] text-slate-400 truncate">{label}</p>
        <p className="text-[10px] text-slate-600">{timestamp}</p>
      </div>
    </button>
  );
}

// ── RunDetailPanel (right column) ───────────────────────────────────────────────

type RunTab = 'summary' | 'prompt' | 'output' | 'notes' | 'changes';

function RunDetailPanel({
  run,
  repoPath,
  onUpdate,
}: {
  run: TaskRun;
  repoPath: string;
  onUpdate: (patch: Partial<TaskRun>) => void;
}) {
  const [tab, setTab]                         = useState<RunTab>('summary');
  const [copied, setCopied]                   = useState(false);
  const [resultSummary, setResultSummary]     = useState(run.result_summary ?? '');
  const [rawOutput, setRawOutput]             = useState(run.raw_output ?? '');
  const [notes, setNotes]                     = useState(run.notes ?? '');
  const [changedSummary, setChangedSummary]   = useState(run.changed_summary ?? '');
  const [filesTouched, setFilesTouched]       = useState<string[]>(
    Array.isArray(run.files_touched) ? run.files_touched : []
  );

  const isTerminal = TERMINAL_STATUSES.has(run.status);
  const hasOutput  = rawOutput.trim().length > 0;

  // Keywords from changed_summary (fallback: result_summary) used to highlight
  // matching lines in the file preview, helping the user find relevant sections.
  const highlightTerms = extractHighlightTerms(changedSummary || resultSummary);

  function handleCopy() {
    navigator.clipboard.writeText(run.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  function handleMarkComplete(status: 'done' | 'failed') {
    onUpdate({ status, completed_at: new Date().toISOString() });
  }

  function handleGenerateSummary() {
    if (!hasOutput) return;
    const generated = generateSummaryHeuristic(rawOutput);
    if (!generated) return;
    setResultSummary(generated);
    onUpdate({ result_summary: generated });
  }

  function handleSuggestFiles() {
    if (!hasOutput) return;
    const suggested = suggestFilesFromOutput(rawOutput);
    if (suggested.length === 0) return;
    setFilesTouched((prev) => {
      const merged = [...prev, ...suggested.filter((f) => !prev.includes(f))];
      onUpdate({ files_touched: merged });
      return merged;
    });
  }

  function handleFilesTouchedChange(next: string[]) {
    setFilesTouched(next);
    onUpdate({ files_touched: next });
  }

  const TABS: { id: RunTab; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'prompt',  label: 'Prompt' },
    { id: 'output',  label: 'Output' },
    { id: 'changes', label: 'Changes' },
    { id: 'notes',   label: 'Notes' },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Run header */}
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-3 shrink-0">
        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${RUN_STATUS_COLORS[run.status]}`}>
          {run.status}
        </span>
        <span className="text-[11px] text-slate-500 truncate min-w-0">
          Started {relativeDate(run.created_at)}
        </span>
        {isTerminal ? (
          <span className={`ml-auto shrink-0 text-[11px] font-medium flex items-center gap-1 ${
            run.status === 'done' ? 'text-green-400' : 'text-red-400'
          }`}>
            {run.status === 'done'
              ? <CheckCircle2 size={11} />
              : <XCircle size={11} />}
            {run.status === 'done' ? 'Completed' : 'Failed'}
            {run.completed_at && <span className="font-normal text-slate-500 ml-0.5">{relativeDate(run.completed_at)}</span>}
          </span>
        ) : (
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleMarkComplete('done')}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/25 hover:bg-green-500/20 transition-colors cursor-default"
            >
              <CheckCircle2 size={11} /> Done
            </button>
            <button
              onClick={() => handleMarkComplete('failed')}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 transition-colors cursor-default"
            >
              <XCircle size={11} /> Failed
            </button>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-medium transition-colors cursor-default whitespace-nowrap ${
              tab === t.id
                ? 'text-violet-300 border-b-2 border-violet-500 -mb-px'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">

        {tab === 'summary' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Result summary</span>
              <button
                onClick={handleGenerateSummary}
                disabled={!hasOutput}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-default"
              >
                <Wand2 size={11} /> Generate from output
              </button>
            </div>
            <textarea
              value={resultSummary}
              onChange={(e) => setResultSummary(e.target.value)}
              onBlur={() => { if (resultSummary !== (run.result_summary ?? '')) onUpdate({ result_summary: resultSummary }); }}
              placeholder="What was the outcome of this run?"
              rows={4}
              className="w-full bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 resize-none transition-colors"
            />
            {!hasOutput && (
              <p className="text-[11px] text-slate-600">Paste Claude's output in the Output tab to generate a summary automatically.</p>
            )}
          </div>
        )}

        {tab === 'prompt' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Prompt</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-default"
              >
                {copied
                  ? <><Check size={11} className="text-green-400" /> Copied</>
                  : <><Copy size={11} /> Copy</>}
              </button>
            </div>
            <pre className="bg-surface border border-border rounded p-3 text-[11px] text-slate-400 whitespace-pre-wrap break-words leading-relaxed max-h-96 overflow-y-auto">
              {run.prompt}
            </pre>
          </div>
        )}

        {tab === 'output' && (
          <div className="space-y-2">
            <span className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Claude output</span>
            <textarea
              value={rawOutput}
              onChange={(e) => setRawOutput(e.target.value)}
              onBlur={() => { if (rawOutput !== (run.raw_output ?? '')) onUpdate({ raw_output: rawOutput }); }}
              placeholder="Paste Claude's response here…"
              rows={16}
              className="w-full bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 resize-none transition-colors"
            />
          </div>
        )}

        {tab === 'changes' && (
          <div className="space-y-5">

            <div className="space-y-2">
              <span className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">What changed</span>
              <textarea
                value={changedSummary}
                onChange={(e) => setChangedSummary(e.target.value)}
                onBlur={() => { if (changedSummary !== (run.changed_summary ?? '')) onUpdate({ changed_summary: changedSummary }); }}
                placeholder="Briefly describe what this run changed…"
                rows={3}
                className="w-full bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 resize-none transition-colors"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Files touched</span>
                <button
                  onClick={handleSuggestFiles}
                  disabled={!hasOutput}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-default"
                >
                  <Scan size={11} /> Suggest from output
                </button>
              </div>

              {!repoPath.trim() && (
                <p className="text-[11px] text-slate-600">No repo path configured — set one on the project to enable file checks.</p>
              )}

              <div className="space-y-2">
                {filesTouched.map((p, i) => (
                  <FileRow
                    key={i}
                    path={p}
                    repoPath={repoPath}
                    highlightTerms={highlightTerms}
                    onRemove={() => handleFilesTouchedChange(filesTouched.filter((_, j) => j !== i))}
                    onChange={(next) => {
                      const updated = [...filesTouched];
                      updated[i] = next;
                      handleFilesTouchedChange(updated);
                    }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => handleFilesTouchedChange([...filesTouched, ''])}
                  className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors cursor-default"
                >
                  <Plus size={11} /> Add file
                </button>
              </div>
            </div>

          </div>
        )}

        {tab === 'notes' && (
          <div className="space-y-2">
            <span className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => { if (notes !== (run.notes ?? '')) onUpdate({ notes }); }}
              placeholder="Add any additional notes…"
              rows={8}
              className="w-full bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 resize-none transition-colors"
            />
          </div>
        )}

      </div>
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────────────

export function TaskDetailView({
  task,
  repoPath,
  onBack,
  onSave,
}: {
  task: Task;
  repoPath: string;
  onBack: () => void;
  onSave: (updated: Task) => void;
}) {
  const [editMode, setEditMode]           = useState(false);
  const [draft, setDraft]                 = useState<Task>(task);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { runs, addRun, updateRun }       = useTaskRuns(task.id);

  const selectedRun   = runs.find((r) => r.id === selectedRunId) ?? null;
  const latestOutcome = [...runs]
    .filter((r) => TERMINAL_STATUSES.has(r.status))
    .sort((a, b) => {
      const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return tb - ta;
    })[0] ?? null;

  function setField<K extends keyof Task>(key: K, value: Task[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function handleGenerateRun() {
    const run: TaskRun = {
      id:         `run-${Date.now()}`,
      task_id:    task.id,
      project_id: task.project_id,
      prompt:     buildRunPrompt(task),
      status:     'pending',
      created_at: new Date().toISOString(),
    };
    addRun(run);
    setSelectedRunId(run.id);
  }

  function handleSave() {
    onSave(draft);
    setEditMode(false);
  }

  // ── Shared header ─────────────────────────────────────────

  const header = (
    <div className={`px-4 py-2.5 border-b flex items-center gap-2.5 shrink-0 ${
      editMode ? 'border-violet-500/40 bg-violet-500/5' : 'border-border bg-panel'
    }`}>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-default shrink-0"
      >
        <ArrowLeft size={12} /> Back
      </button>
      <span className="flex-1 text-sm font-medium text-slate-200 truncate min-w-0">{task.title}</span>
      {latestOutcome && !editMode && (
        <span className={`shrink-0 flex items-center gap-1 text-[11px] font-medium ${
          latestOutcome.status === 'done' ? 'text-green-400' : 'text-red-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            latestOutcome.status === 'done' ? 'bg-green-400' : 'bg-red-400'
          }`} />
          {latestOutcome.status}
          {latestOutcome.completed_at && (
            <span className="text-slate-500 font-normal">{relativeDate(latestOutcome.completed_at)}</span>
          )}
        </span>
      )}
      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_COLORS[task.status]}`}>
        {task.status}
      </span>
      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${TYPE_COLORS[task.task_type]}`}>
        {task.task_type}
      </span>
      <button
        onClick={() => { setDraft(task); setEditMode((v) => !v); }}
        className={`shrink-0 flex items-center gap-1 text-xs transition-colors cursor-default ${
          editMode ? 'text-violet-300 hover:text-violet-200' : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        <Pencil size={11} /> {editMode ? 'Editing' : 'Edit'}
      </button>
    </div>
  );

  // ── Edit mode ─────────────────────────────────────────────

  if (editMode) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {header}
        <div className="flex-1 overflow-y-auto bg-violet-500/[0.02]">
          <div className="px-5 py-4 max-w-2xl mx-auto">
            <div className="bg-card border border-violet-500/20 rounded-lg divide-y divide-border">

              <div className="px-4 py-3 flex flex-wrap items-center gap-4">
                <div className="space-y-1">
                  <p className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Status</p>
                  <select
                    value={draft.status}
                    onChange={(e) => setField('status', e.target.value as TaskStatus)}
                    className="bg-surface border border-border rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-violet-500/50 cursor-default transition-colors"
                  >
                    {TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Type</p>
                  <select
                    value={draft.task_type}
                    onChange={(e) => setField('task_type', e.target.value as TaskType)}
                    className="bg-surface border border-border rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-violet-500/50 cursor-default transition-colors"
                  >
                    {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Risk</p>
                  <select
                    value={draft.risk_level}
                    onChange={(e) => setField('risk_level', e.target.value as RiskLevel)}
                    className="bg-surface border border-border rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-violet-500/50 cursor-default transition-colors"
                  >
                    {RISK_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="px-4 py-3 space-y-1.5">
                <p className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Title</p>
                <input
                  value={draft.title}
                  onChange={(e) => setField('title', e.target.value)}
                  className="w-full bg-surface border border-border rounded px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500/50 transition-colors"
                />
              </div>

              <div className="px-4 py-3 space-y-1.5">
                <p className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Goal</p>
                <textarea
                  value={draft.goal}
                  onChange={(e) => setField('goal', e.target.value)}
                  rows={3}
                  className="w-full bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-violet-500/50 resize-none transition-colors"
                />
              </div>

              <div className="px-4 py-3 space-y-1.5">
                <p className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Scope</p>
                <EditableList items={draft.scope} onChange={(v) => setField('scope', v)} />
              </div>

              <div className="px-4 py-3 space-y-1.5">
                <p className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Out of scope</p>
                <EditableList items={draft.out_of_scope} onChange={(v) => setField('out_of_scope', v)} />
              </div>

              <div className="px-4 py-3 space-y-1.5">
                <p className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Success criteria</p>
                <EditableList items={draft.success_criteria} onChange={(v) => setField('success_criteria', v)} />
              </div>

              <div className="px-4 py-3 space-y-1.5">
                <p className="text-[11px] text-slate-600 uppercase tracking-widest font-semibold">Ambiguities</p>
                <EditableList items={draft.ambiguities} onChange={(v) => setField('ambiguities', v)} />
              </div>

              <div className="px-4 py-3 flex items-center justify-end gap-2">
                <button
                  onClick={() => setEditMode(false)}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-default"
                >
                  Cancel
                </button>
                <Button variant="primary" size="sm" onClick={handleSave}>Save changes</Button>
              </div>

            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Two-column view ───────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {header}

      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Left column — task overview + run list */}
        <div className="w-56 shrink-0 flex flex-col border-r border-border overflow-hidden">

          {/* Goal */}
          <div className="px-3 py-3 border-b border-border-subtle shrink-0 space-y-1.5">
            <p className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">Goal</p>
            <p className="text-xs text-slate-400 leading-relaxed line-clamp-4">
              {task.goal || <span className="italic text-slate-600">No goal set</span>}
            </p>
          </div>

          {/* Runs header */}
          <div className="px-3 py-2 border-b border-border-subtle flex items-center shrink-0">
            <span className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">
              Runs ({runs.length})
            </span>
          </div>

          {/* Run list */}
          <div className="flex-1 overflow-y-auto">
            {runs.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-slate-600 text-center">No runs yet</p>
            ) : (
              runs.map((run, i) => (
                <RunSummaryRow
                  key={run.id}
                  run={run}
                  runIndex={runs.length - i}
                  isSelected={run.id === selectedRunId}
                  onClick={() => setSelectedRunId(run.id)}
                />
              ))
            )}
          </div>

          {/* Generate run */}
          <div className="px-3 py-3 border-t border-border shrink-0">
            <button
              onClick={handleGenerateRun}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-violet-500/10 text-violet-300 border border-violet-500/25 hover:bg-violet-500/20 transition-colors cursor-default"
            >
              <Play size={11} /> Generate Run
            </button>
          </div>

        </div>

        {/* Right column — run detail */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {selectedRun ? (
            <RunDetailPanel
              key={selectedRun.id}
              run={selectedRun}
              repoPath={repoPath}
              onUpdate={(patch) => updateRun(selectedRun.id, patch)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-1 px-6">
                <p className="text-sm text-slate-500">
                  {runs.length === 0 ? 'No runs yet' : '← Select a run to view detail'}
                </p>
                <p className="text-xs text-slate-600">
                  {runs.length === 0
                    ? 'Click "Generate Run" to create an execution prompt.'
                    : 'Click a run on the left to view it.'}
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
