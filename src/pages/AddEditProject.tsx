import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { ProjectFormData, Status, Phase, Priority, AiTool } from '../lib/types';
import {
  ALL_STATUSES, ALL_PHASES, ALL_PRIORITIES, ALL_AI_TOOLS,
  STATUS_LABELS, PHASE_LABELS, PRIORITY_LABELS, AI_TOOL_LABELS,
} from '../lib/types';
import {
  getProject, createProject, updateProject, validateRepoPath,
} from '../lib/api';

const EMPTY_FORM: ProjectFormData = {
  name: '',
  description: '',
  local_repo_path: '',
  status: 'active',
  phase: 'idea',
  priority: 'medium',
  ai_tool: 'claude',
  current_task: '',
  next_task: '',
  blocker: '',
  notes: '',
};

export default function AddEditProject() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = id !== undefined;
  const projectId = isEdit ? Number(id) : null;

  const [form, setForm] = useState<ProjectFormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Repo path validation feedback
  const [pathValidating, setPathValidating] = useState(false);
  const [pathValid, setPathValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isEdit || !projectId) return;
    getProject(projectId)
      .then((p) => {
        setForm({
          name: p.name,
          description: p.description,
          local_repo_path: p.local_repo_path,
          status: p.status,
          phase: p.phase,
          priority: p.priority,
          ai_tool: p.ai_tool,
          current_task: p.current_task,
          next_task: p.next_task,
          blocker: p.blocker,
          notes: p.notes,
        });
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [isEdit, projectId]);

  function set<K extends keyof ProjectFormData>(key: K, value: ProjectFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handlePathChange(value: string) {
    set('local_repo_path', value);
    setPathValid(null);
    if (!value.trim()) return;

    setPathValidating(true);
    const ok = await validateRepoPath(value).catch(() => false);
    setPathValid(ok);
    setPathValidating(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Project name is required.'); return; }

    try {
      setSaving(true);
      setError(null);
      if (isEdit && projectId !== null) {
        await updateProject(projectId, form);
        navigate(`/projects/${projectId}`);
      } else {
        const p = await createProject(form);
        navigate(`/projects/${p.id}`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate(isEdit ? `/projects/${projectId}` : '/projects')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-hover transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-xl font-bold text-slate-100">
          {isEdit ? 'Edit Project' : 'New Project'}
        </h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basic info */}
        <Section title="Basic Info">
          <Field label="Project name *">
            <TextInput
              value={form.name}
              onChange={(v) => set('name', v)}
              placeholder="My awesome project"
              autoFocus
            />
          </Field>
          <Field label="Description">
            <TextArea
              value={form.description}
              onChange={(v) => set('description', v)}
              placeholder="What is this project about?"
              rows={2}
            />
          </Field>
          <Field
            label="Local repo path"
            hint={
              pathValidating
                ? 'Checking…'
                : pathValid === true
                ? '✓ Valid git repository'
                : pathValid === false
                ? '⚠ Not a git repository at that path (you can still save)'
                : undefined
            }
            hintClass={pathValid === false ? 'text-yellow-400' : 'text-green-400'}
          >
            <div className="relative">
              <TextInput
                value={form.local_repo_path}
                onChange={handlePathChange}
                placeholder="/Users/you/projects/my-repo"
                mono
              />
              <div className="absolute right-3 top-2.5">
                {pathValidating && <Loader2 size={13} className="text-slate-400 animate-spin" />}
                {!pathValidating && pathValid === true && <CheckCircle2 size={13} className="text-green-400" />}
                {!pathValidating && pathValid === false && <AlertCircle size={13} className="text-yellow-400" />}
              </div>
            </div>
          </Field>
        </Section>

        {/* Status */}
        <Section title="Status & Phase">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <SelectInput
                value={form.status}
                onChange={(v) => set('status', v as Status)}
                options={ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
              />
            </Field>
            <Field label="Phase">
              <SelectInput
                value={form.phase}
                onChange={(v) => set('phase', v as Phase)}
                options={ALL_PHASES.map((p) => ({ value: p, label: PHASE_LABELS[p] }))}
              />
            </Field>
            <Field label="Priority">
              <SelectInput
                value={form.priority}
                onChange={(v) => set('priority', v as Priority)}
                options={ALL_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
              />
            </Field>
            <Field label="AI tool">
              <SelectInput
                value={form.ai_tool}
                onChange={(v) => set('ai_tool', v as AiTool)}
                options={ALL_AI_TOOLS.map((t) => ({ value: t, label: AI_TOOL_LABELS[t] }))}
              />
            </Field>
          </div>
        </Section>

        {/* Tasks */}
        <Section title="Tasks">
          <Field label="Current task">
            <TextInput
              value={form.current_task}
              onChange={(v) => set('current_task', v)}
              placeholder="What are you working on right now?"
            />
          </Field>
          <Field label="Next task">
            <TextInput
              value={form.next_task}
              onChange={(v) => set('next_task', v)}
              placeholder="What's coming up next?"
            />
          </Field>
          <Field label="Blocker">
            <TextInput
              value={form.blocker}
              onChange={(v) => set('blocker', v)}
              placeholder="What's blocking progress? (leave blank if none)"
            />
          </Field>
        </Section>

        {/* Notes */}
        <Section title="Notes">
          <TextArea
            value={form.notes}
            onChange={(v) => set('notes', v)}
            placeholder="Freeform notes, links, ideas…"
            rows={5}
          />
        </Section>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {isEdit ? 'Save changes' : 'Create project'}
          </button>
          <button
            type="button"
            onClick={() => navigate(isEdit ? `/projects/${projectId}` : '/projects')}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 bg-hover rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Form primitives ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</h2>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  hintClass = 'text-slate-400',
  children,
}: {
  label: string;
  hint?: string;
  hintClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-slate-300 mb-1">{label}</label>
      {children}
      {hint && <p className={`text-xs mt-1 ${hintClass}`}>{hint}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={`w-full bg-base border border-border rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50 transition-colors ${mono ? 'font-mono' : ''}`}
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-base border border-border rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50 transition-colors resize-none"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-base border border-border rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500/50 transition-colors cursor-pointer"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
