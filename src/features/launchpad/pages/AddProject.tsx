import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Github, Triangle, Database, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ProjectFormData, ScaffoldResult } from '../../../lib/types';
import {
  createProject, validateRepoPath,
  getSettings, checkGhCli, scaffoldNewProject,
} from '../../../lib/api';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { SectionLabel } from '../../../components/ui/SectionLabel';
import ScaffoldProgressModal from '../components/ScaffoldProgressModal';
import { ProjectFormFields } from '../../../components/ProjectFormFields';

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

export function AddProject() {
  const navigate = useNavigate();

  const [form, setForm] = useState<ProjectFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pathValidating, setPathValidating] = useState(false);
  const [pathValid, setPathValid] = useState<boolean | null>(null);

  // Scaffold mode
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
    getSettings().then((s) => {
      setProjectsDir(s.projects_dir ?? '');
      setVercelToken(s.vercel_token ?? '');
      setSupabaseReady(!!(s.supabase_access_token && s.supabase_org_id));
    }).catch(() => {});
    checkGhCli().then(setGhAvailable).catch(() => setGhAvailable(false));
  }, []);

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

    if (scaffoldMode) {
      if (!projectsDir) {
        setError('No default projects directory set. Please configure one in Settings first.');
        return;
      }
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
      const p = await createProject(form);
      navigate(`/projects/${p.id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleScaffoldContinue(projectPath: string) {
    setScaffoldModalOpen(false);
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

  const submitLabel = scaffoldMode ? 'Scaffold & create' : 'Create project';

  const headerActions = (
    <>
      <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
        Cancel
      </Button>
      <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>
        {saving && <Loader2 size={11} className="animate-spin" />}
        {submitLabel}
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
        title="New Project"
        onBack={() => navigate('/projects')}
        actions={headerActions}
      />

      <div className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="px-5 py-4 max-w-2xl mx-auto space-y-4">
          <ProjectFormFields
            form={form}
            saving={saving}
            error={error}
            pathValidating={pathValidating}
            pathValid={pathValid}
            set={set}
            onPathChange={handlePathChange}
            onCancel={() => navigate('/projects')}
            submitLabel={submitLabel}
            scaffoldSlot={
              <ScaffoldSetupSection
                scaffoldMode={scaffoldMode}
                projectsDir={projectsDir}
                ghAvailable={ghAvailable}
                vercelToken={vercelToken}
                supabaseReady={supabaseReady}
                scaffoldGithub={scaffoldGithub}
                scaffoldVercel={scaffoldVercel}
                scaffoldSupabase={scaffoldSupabase}
                onToggleMode={() => setScaffoldMode((v) => !v)}
                onChangeGithub={setScaffoldGithub}
                onChangeVercel={setScaffoldVercel}
                onChangeSupabase={setScaffoldSupabase}
              />
            }
          />
        </form>
      </div>
    </div>
  );
}

// ── Scaffold setup section ────────────────────────────────────────────────────

function ScaffoldSetupSection({
  scaffoldMode,
  projectsDir,
  ghAvailable,
  vercelToken,
  supabaseReady,
  scaffoldGithub,
  scaffoldVercel,
  scaffoldSupabase,
  onToggleMode,
  onChangeGithub,
  onChangeVercel,
  onChangeSupabase,
}: {
  scaffoldMode: boolean;
  projectsDir: string;
  ghAvailable: boolean | null;
  vercelToken: string;
  supabaseReady: boolean;
  scaffoldGithub: boolean;
  scaffoldVercel: boolean;
  scaffoldSupabase: boolean;
  onToggleMode: () => void;
  onChangeGithub: (v: boolean) => void;
  onChangeVercel: (v: boolean) => void;
  onChangeSupabase: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Create from scratch</SectionLabel>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-slate-500">
            {scaffoldMode ? 'Enabled' : 'Disabled'}
          </span>
          <button
            type="button"
            onClick={onToggleMode}
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
              onChange={onChangeGithub}
            />
            <ScaffoldOption
              icon={<Triangle size={13} />}
              label="Create Vercel project"
              description={vercelToken ? 'token configured' : 'no token — set in Settings'}
              available={!!vercelToken}
              checked={scaffoldVercel}
              onChange={onChangeVercel}
            />
            <ScaffoldOption
              icon={<Database size={13} />}
              label="Create Supabase project"
              description={supabaseReady ? 'token + org ID configured' : 'token/org missing — set in Settings'}
              available={supabaseReady}
              checked={scaffoldSupabase}
              onChange={onChangeSupabase}
            />
          </div>
        </div>
      )}
    </div>
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
