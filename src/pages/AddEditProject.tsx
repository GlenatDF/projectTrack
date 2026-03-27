import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Loader2, Github, Triangle, Database } from 'lucide-react';
import type { ProjectFormData, Status, Phase, Priority, AiTool, ScaffoldResult } from '../lib/types';
import {
  ALL_STATUSES, ALL_PHASES, ALL_PRIORITIES, ALL_AI_TOOLS,
  STATUS_LABELS, PHASE_LABELS, PRIORITY_LABELS, AI_TOOL_LABELS,
} from '../lib/types';
import {
  getProject, createProject, updateProject, validateRepoPath,
  getSettings, checkGhCli, scaffoldNewProject,
} from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { SectionLabel } from '../components/ui/SectionLabel';
import ScaffoldProgressModal from '../components/ScaffoldProgressModal';

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
  claude_startup_prompt: '',
  claude_prompt_mode: 'append',
  claude_priority_files: '',
  session_handoff_notes: '',
  startup_command: 'claude',
  preferred_terminal: '',
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

  const [pathValidating, setPathValidating] = useState(false);
  const [pathValid, setPathValid] = useState<boolean | null>(null);

  // Scaffold mode (new projects only)
  const [scaffoldMode, setScaffoldMode] = useState(false);
  const [scaffoldGithub, setScaffoldGithub] = useState(true);
  const [scaffoldVercel, setScaffoldVercel] = useState(true);
  const [scaffoldSupabase, setScaffoldSupabase] = useState(true);
  const [projectsDir, setProjectsDir] = useState('');
  const [ghAvailable, setGhAvailable] = useState<boolean | null>(null);
  const [vercelToken, setVercelToken] = useState('');
  const [supabaseReady, setSupabaseReady] = useState(false);
  // Scaffold modal
  const [scaffoldModalOpen, setScaffoldModalOpen] = useState(false);
  const [scaffoldRunning, setScaffoldRunning] = useState(false);
  const [scaffoldResult, setScaffoldResult] = useState<ScaffoldResult | null>(null);
  const [scaffoldError, setScaffoldError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit) return;
    getSettings().then((s) => {
      setProjectsDir(s.projects_dir ?? '');
      setVercelToken(s.vercel_token ?? '');
      setSupabaseReady(!!(s.supabase_access_token && s.supabase_org_id));
    }).catch(() => {});
    checkGhCli().then(setGhAvailable).catch(() => setGhAvailable(false));
  }, [isEdit]);

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
          claude_startup_prompt: p.claude_startup_prompt,
          claude_prompt_mode: p.claude_prompt_mode === 'replace' ? 'replace' : 'append',
          claude_priority_files: p.claude_priority_files,
          session_handoff_notes: p.session_handoff_notes,
          startup_command: p.startup_command,
          preferred_terminal: p.preferred_terminal,
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

    if (!isEdit && scaffoldMode) {
      if (!projectsDir) {
        setError('No default projects directory set. Please configure one in Settings first.');
        return;
      }
      // Run scaffold first, then create project record
      setScaffoldModalOpen(true);
      setScaffoldRunning(true);
      setScaffoldResult(null);
      setScaffoldError(null);
      try {
        const result = await scaffoldNewProject({
          projectName: form.name,
          description: form.description,
          createGithub: scaffoldGithub,
          createVercel: scaffoldVercel,
          createSupabase: scaffoldSupabase,
        });
        setScaffoldResult(result);
        // Pre-fill repo path from scaffold result
        set('local_repo_path', result.project_path);
      } catch (err) {
        setScaffoldError(String(err));
      } finally {
        setScaffoldRunning(false);
      }
      return;
    }

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

  async function handleScaffoldContinue(projectPath: string) {
    setScaffoldModalOpen(false);
    // Ensure path is set and save the project record
    const updatedForm = { ...form, local_repo_path: projectPath };
    try {
      setSaving(true);
      const p = await createProject(updatedForm);
      navigate(`/projects/${p.id}`);
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  }

  const backTo = isEdit ? `/projects/${projectId}` : '/projects';

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const headerActions = (
    <>
      <Button variant="ghost" size="sm" onClick={() => navigate(backTo)}>
        Cancel
      </Button>
      <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>
        {saving && <Loader2 size={11} className="animate-spin" />}
        {isEdit ? 'Save changes' : scaffoldMode ? 'Scaffold & create' : 'Create project'}
      </Button>
    </>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ScaffoldProgressModal
        open={scaffoldModalOpen}
        running={scaffoldRunning}
        result={scaffoldResult}
        error={scaffoldError}
        onContinue={handleScaffoldContinue}
        onClose={() => setScaffoldModalOpen(false)}
      />
      <PageHeader
        title={isEdit ? 'Edit Project' : 'New Project'}
        onBack={() => navigate(backTo)}
        actions={headerActions}
      />

      <div className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="px-5 py-4 max-w-2xl mx-auto space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs flex items-start gap-2">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Basic info */}
          <FormSection title="Basic Info">
            <Field label="Project name">
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
                  ? '⚠ Not a git repository (you can still save)'
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
                <div className="absolute right-3 top-2">
                  {pathValidating && <Loader2 size={12} className="text-slate-500 animate-spin" />}
                  {!pathValidating && pathValid === true && <CheckCircle2 size={12} className="text-green-400" />}
                  {!pathValidating && pathValid === false && <AlertCircle size={12} className="text-yellow-400" />}
                </div>
              </div>
            </Field>
          </FormSection>

          {/* Scaffold mode (new projects only) */}
          {!isEdit && (
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <SectionLabel>Create from scratch</SectionLabel>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-slate-500">
                    {scaffoldMode ? 'Enabled' : 'Disabled'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setScaffoldMode((v) => !v)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      scaffoldMode ? 'bg-violet-600' : 'bg-slate-700'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      scaffoldMode ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                </label>
              </div>

              {scaffoldMode && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Scaffolds a Next.js + Supabase project in your default projects directory,
                    runs git init, and optionally creates cloud accounts.
                  </p>

                  {/* Projects dir warning / redirect */}
                  {!projectsDir ? (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                      <AlertCircle size={12} className="text-yellow-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-yellow-300">
                        No default projects directory set.{' '}
                        <button
                          type="button"
                          onClick={() => navigate('/settings')}
                          className="underline hover:text-yellow-200"
                        >
                          Go to Settings
                        </button>{' '}
                        to configure one.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <CheckCircle2 size={11} className="text-green-400" />
                      Will create in: <span className="font-mono text-slate-400">{projectsDir}</span>
                    </div>
                  )}

                  {/* Cloud options */}
                  <div className="space-y-2 pt-1">
                    <ScaffoldOption
                      icon={<Github size={13} />}
                      label="Create GitHub repo"
                      description={
                        ghAvailable === null ? 'checking gh CLI…' :
                        ghAvailable ? 'gh CLI ready' : 'gh CLI not found — run `gh auth login`'
                      }
                      available={ghAvailable ?? false}
                      checked={scaffoldGithub}
                      onChange={setScaffoldGithub}
                    />
                    <ScaffoldOption
                      icon={<Triangle size={13} />}
                      label="Create Vercel project"
                      description={vercelToken ? 'token configured' : 'no token — set in Settings'}
                      available={!!vercelToken}
                      checked={scaffoldVercel}
                      onChange={setScaffoldVercel}
                    />
                    <ScaffoldOption
                      icon={<Database size={13} />}
                      label="Create Supabase project"
                      description={supabaseReady ? 'token + org ID configured' : 'token/org missing — set in Settings'}
                      available={supabaseReady}
                      checked={scaffoldSupabase}
                      onChange={setScaffoldSupabase}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status & Phase */}
          <FormSection title="Status & Phase">
            <div className="grid grid-cols-2 gap-3">
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
          </FormSection>

          {/* Tasks */}
          <FormSection title="Tasks">
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
          </FormSection>

          {/* Notes */}
          <FormSection title="Notes">
            <TextArea
              value={form.notes}
              onChange={(v) => set('notes', v)}
              placeholder="Freeform notes, links, ideas…"
              rows={5}
            />
          </FormSection>

          {/* Bottom actions (also in header, but useful for long forms) */}
          <div className="flex items-center gap-2 pb-2">
            <Button type="submit" variant="primary" size="sm" disabled={saving}>
              {saving && <Loader2 size={11} className="animate-spin" />}
              {isEdit ? 'Save changes' : scaffoldMode ? 'Scaffold & create' : 'Create project'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => navigate(backTo)}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Form primitives ───────────────────────────────────────────────────────────

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  hintClass = 'text-slate-500',
  children,
}: {
  label: string;
  hint?: string;
  hintClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
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
      className={`w-full bg-base border border-border rounded-md px-3 py-2 text-sm text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50 transition-colors ${mono ? 'font-mono' : ''}`}
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
      className="w-full bg-base border border-border rounded-md px-3 py-2 text-sm text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50 transition-colors resize-none"
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
      className="w-full bg-base border border-border rounded-md px-3 py-2 text-sm text-slate-300 outline-none focus:border-violet-500/50 transition-colors cursor-default"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function ScaffoldOption({
  icon, label, description, available, checked, onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  available: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 p-2.5 rounded-lg border border-border-subtle hover:border-border transition-colors cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-violet-500 w-3.5 h-3.5"
      />
      <span className={`${available ? 'text-slate-400' : 'text-slate-600'}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-medium ${available ? 'text-slate-300' : 'text-slate-500'}`}>
          {label}
        </span>
        <span className={`text-xs ml-1.5 ${available ? 'text-slate-500' : 'text-slate-600'}`}>
          — {description}
        </span>
      </div>
    </label>
  );
}
