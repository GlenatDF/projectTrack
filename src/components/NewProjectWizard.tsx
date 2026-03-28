import React, { useState, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Globe, Monitor, Wrench, Zap, BookOpen,
  LayoutTemplate, Package, Layers, FileText, BookMarked,
  Loader2, CheckCircle2, XCircle, Circle,
  Hammer, FolderOpen, Github, Triangle, Database, AlertCircle,
  MinusCircle, ExternalLink, Copy,
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { initNewProject, scaffoldFullProject, getSettings, checkGhCli } from '../lib/api';
import type { ProjectInitRequest, ProjectInitResult, FullScaffoldResult } from '../lib/types';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NewProjectConfig {
  name: string;
  description: string;
  projectType: string;
  mainGoal: string;
  starterTemplate: string;
  addOns: string[];
  constraints: string;
  codingStyle: string;
  uiStyle: string;
  createGitRepo: boolean;
  createClaudeSkills: boolean;
}

const DEFAULT_CONFIG: NewProjectConfig = {
  name: '',
  description: '',
  projectType: 'web_app',
  mainGoal: '',
  starterTemplate: 'nextjs',
  addOns: [],
  constraints: '',
  codingStyle: '',
  uiStyle: '',
  createGitRepo: true,
  createClaudeSkills: true,
};

type StepStatus = 'pending' | 'running' | 'done' | 'error';
interface ProgressStep { id: string; label: string; status: StepStatus; }
type ProgressPayload = { step: string; label: string; status: string };
type Phase = 'form' | 'running' | 'done' | 'error';
type Mode = 'choose' | 'scratch' | 'track';

function buildProgressSteps(config: NewProjectConfig): ProgressStep[] {
  const steps: ProgressStep[] = [
    { id: 'folder', label: 'Creating project folder', status: 'pending' },
    { id: 'docs',   label: 'Generating markdown docs', status: 'pending' },
  ];
  if (config.createClaudeSkills) {
    steps.push({ id: 'skills', label: 'Generating Claude skills', status: 'pending' });
  }
  if (config.createGitRepo) {
    steps.push({ id: 'git', label: 'Initialising git repo', status: 'pending' });
  }
  steps.push({ id: 'database', label: 'Saving to database', status: 'pending' });
  return steps;
}

function buildScratchProgressSteps(
  createClaudeSkills: boolean,
  createGithub: boolean,
  createVercel: boolean,
  createSupabase: boolean,
): ProgressStep[] {
  const steps: ProgressStep[] = [
    { id: 'files',    label: 'Creating project files',    status: 'pending' },
    { id: 'docs',     label: 'Generating markdown docs',  status: 'pending' },
  ];
  if (createClaudeSkills) {
    steps.push({ id: 'skills',  label: 'Generating Claude skills', status: 'pending' });
  }
  steps.push({ id: 'git', label: 'Initialising git repo', status: 'pending' });
  if (createGithub)   steps.push({ id: 'github',   label: 'Creating GitHub repo',     status: 'pending' });
  if (createVercel)   steps.push({ id: 'vercel',   label: 'Creating Vercel project',  status: 'pending' });
  if (createSupabase) steps.push({ id: 'supabase', label: 'Creating Supabase project',status: 'pending' });
  steps.push({ id: 'database', label: 'Saving to database', status: 'pending' });
  return steps;
}

// ── Static data ────────────────────────────────────────────────────────────────

const PROJECT_TYPES: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'web_app',       label: 'Web app',       icon: Globe },
  { value: 'desktop_app',   label: 'Desktop app',   icon: Monitor },
  { value: 'internal_tool', label: 'Internal tool', icon: Wrench },
  { value: 'api',           label: 'API / Service', icon: Zap },
  { value: 'docs_site',     label: 'Docs site',     icon: BookOpen },
];

const STARTER_TEMPLATES: { value: string; label: string; sub: string; icon: LucideIcon }[] = [
  { value: 'nextjs', label: 'Next.js',   sub: 'App Router + TypeScript', icon: LayoutTemplate },
  { value: 'tauri',  label: 'Tauri',     sub: 'Rust + React + SQLite',   icon: Package },
  { value: 'react',  label: 'React',     sub: 'Vite + TypeScript',       icon: Layers },
  { value: 'blank',  label: 'Blank',     sub: 'No template',             icon: FileText },
  { value: 'docs',   label: 'Docs site', sub: 'Nextra / MDX',            icon: BookMarked },
];

const ADD_ONS = [
  'Supabase', 'Tailwind CSS', 'shadcn/ui', 'Stripe',
  'OpenAI', 'TypeScript', 'Prisma', 'Auth.js',
];

const TRACK_STEPS = ['About', 'Setup', 'Options'] as const;
const SCRATCH_STEPS = ['About', 'Cloud'] as const;

// ── Wizard ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (projectId: number) => void;
}

export function NewProjectWizard({ open, onClose, onCreated }: Props) {
  // Mode
  const [mode, setMode] = useState<Mode>('choose');

  // Form
  const [formStep, setFormStep]   = useState(0);
  const [config, setConfig]       = useState<NewProjectConfig>(DEFAULT_CONFIG);
  const [nameError, setNameError] = useState(false);

  // Execution
  const [phase, setPhase]             = useState<Phase>('form');
  const [progress, setProgress]       = useState<ProgressStep[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [doneResult, setDoneResult]   = useState<ProjectInitResult | null>(null);

  // Scratch-specific
  const [projectsDir, setProjectsDir]     = useState('');
  const [ghAvailable, setGhAvailable]     = useState<boolean | null>(null);
  const [vercelToken, setVercelToken]     = useState('');
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [scaffoldGithub, setScaffoldGithub]     = useState(true);
  const [scaffoldVercel, setScaffoldVercel]     = useState(true);
  const [scaffoldSupabase, setScaffoldSupabase] = useState(true);
  const [fullResult, setFullResult]             = useState<FullScaffoldResult | null>(null);

  // Load settings/gh status whenever the modal opens
  useEffect(() => {
    if (!open) return;
    getSettings().then((s) => {
      setProjectsDir(s.projects_dir ?? '');
      setVercelToken(s.vercel_token ?? '');
      setSupabaseReady(!!(s.supabase_access_token && s.supabase_org_id));
    }).catch(() => {});
    checkGhCli().then(setGhAvailable).catch(() => setGhAvailable(false));
  }, [open]);

  function reset() {
    setMode('choose');
    setFormStep(0);
    setConfig(DEFAULT_CONFIG);
    setNameError(false);
    setPhase('form');
    setProgress([]);
    setCreateError(null);
    setDoneResult(null);
    setFullResult(null);
  }

  function handleClose() {
    if (phase === 'running') return;
    reset();
    onClose();
  }

  function patch(partial: Partial<NewProjectConfig>) {
    setConfig((c) => ({ ...c, ...partial }));
  }

  function toggleAddOn(addon: string) {
    setConfig((c) => ({
      ...c,
      addOns: c.addOns.includes(addon)
        ? c.addOns.filter((a) => a !== addon)
        : [...c.addOns, addon],
    }));
  }

  function handleChooseMode(m: 'scratch' | 'track') {
    setMode(m);
    setFormStep(0);
  }

  function handleNext() {
    if (formStep === 0 && !config.name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    const steps = mode === 'scratch' ? SCRATCH_STEPS : TRACK_STEPS;
    if (formStep < steps.length - 1) {
      setFormStep((s) => s + 1);
    }
  }

  function handleBack() {
    if (formStep === 0) {
      setMode('choose');
    } else {
      setFormStep((s) => s - 1);
    }
  }

  // ── Track mode: run initNewProject ──────────────────────────────────────────

  async function handleCreateTrack() {
    const initialSteps = buildProgressSteps(config);
    setProgress(initialSteps);
    setCreateError(null);
    setPhase('running');

    const unlisten = await listen<ProgressPayload>('project-init-progress', (event) => {
      const { step, status } = event.payload;
      setProgress((prev) =>
        prev.map((s) => s.id === step ? { ...s, status: status as StepStatus } : s)
      );
    });

    try {
      const req: ProjectInitRequest = {
        name:                 config.name,
        description:          config.description,
        project_type:         config.projectType,
        main_goal:            config.mainGoal,
        starter_template:     config.starterTemplate,
        add_ons:              config.addOns,
        constraints:          config.constraints,
        coding_style:         config.codingStyle,
        ui_style:             config.uiStyle,
        create_git_repo:      config.createGitRepo,
        create_claude_skills: config.createClaudeSkills,
      };
      const result = await initNewProject(req);
      setDoneResult(result);
      setPhase('done');
    } catch (e) {
      setCreateError(String(e));
      setPhase('error');
    } finally {
      unlisten();
    }
  }

  // ── Scratch mode: full scaffold + docs/skills + DB in one go ───────────────

  async function handleCreateScratch() {
    const initialSteps = buildScratchProgressSteps(
      config.createClaudeSkills,
      scaffoldGithub,
      scaffoldVercel,
      scaffoldSupabase,
    );
    setProgress(initialSteps);
    setCreateError(null);
    setPhase('running');

    const unlisten = await listen<ProgressPayload>('project-init-progress', (event) => {
      const { step, status } = event.payload;
      setProgress((prev) =>
        prev.map((s) => s.id === step ? { ...s, status: status as StepStatus } : s)
      );
    });

    try {
      const result = await scaffoldFullProject({
        projectName:        config.name,
        description:        config.description,
        mainGoal:           config.mainGoal,
        createGithub:       scaffoldGithub,
        createVercel:       scaffoldVercel,
        createSupabase:     scaffoldSupabase,
        createClaudeSkills: config.createClaudeSkills,
      });
      setFullResult(result);
      setPhase('done');
    } catch (e) {
      setCreateError(String(e));
      setPhase('error');
    } finally {
      unlisten();
    }
  }

  // ── Footer ──────────────────────────────────────────────────────────────────

  let footer: React.ReactNode = null;

  if (mode === 'choose') {
    footer = (
      <div className="flex justify-start w-full">
        <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
      </div>
    );
  } else if (phase === 'form') {
    const steps = mode === 'scratch' ? SCRATCH_STEPS : TRACK_STEPS;
    const isLast = formStep === steps.length - 1;
    footer = (
      <div className="flex items-center justify-between w-full">
        <Button variant="ghost" size="sm" onClick={handleBack}>← Back</Button>
        {isLast
          ? <Button variant="primary" size="sm" onClick={mode === 'scratch' ? handleCreateScratch : handleCreateTrack}>
              {mode === 'scratch' ? 'Scaffold & create' : 'Create project'}
            </Button>
          : <Button variant="primary" size="sm" onClick={handleNext}>Next →</Button>
        }
      </div>
    );
  } else if (phase === 'done') {
    const filesCount = mode === 'scratch'
      ? fullResult?.files_created.length ?? 0
      : doneResult?.files_created.length ?? 0;
    const projectId = mode === 'scratch' ? fullResult?.project_id : doneResult?.project_id;
    footer = (
      <div className="flex items-center justify-between w-full">
        <span className="text-[11px] text-slate-600">
          {filesCount > 0 ? `${filesCount} files created` : ''}
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={() => { onCreated(projectId!); reset(); onClose(); }}
        >
          Open Project →
        </Button>
      </div>
    );
  } else if (phase === 'error') {
    footer = (
      <div className="flex items-center justify-between w-full">
        <span className="text-[11px] text-red-400">Setup failed</span>
        <Button variant="ghost" size="sm" onClick={handleClose}>Close</Button>
      </div>
    );
  }
  // running → footer = null

  // ── Modal subtitle ──────────────────────────────────────────────────────────

  let subtitle = 'Set up your next project';
  if (mode !== 'choose') {
    if (phase === 'running') subtitle = mode === 'scratch' ? 'Scaffolding project…' : 'Creating your project…';
    else if (phase === 'done') subtitle = mode === 'scratch' ? (fullResult?.project_path ?? 'Done') : `Ready — ${doneResult?.project_path ?? ''}`;
    else if (phase === 'error') subtitle = 'Setup failed';
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="xl"
      title="New Project"
      subtitle={subtitle}
      footer={footer}
    >
      {mode === 'choose' && (
        <ModeChoice onChoose={handleChooseMode} />
      )}

      {mode === 'track' && phase === 'form' && (
        <>
          <StepIndicator steps={TRACK_STEPS as unknown as string[]} current={formStep} />
          {formStep === 0 && (
            <StepAbout config={config} patch={patch} nameError={nameError} onNameFocus={() => setNameError(false)} />
          )}
          {formStep === 1 && (
            <StepSetup config={config} patch={patch} toggleAddOn={toggleAddOn} />
          )}
          {formStep === 2 && (
            <StepOptions config={config} patch={patch} />
          )}
        </>
      )}

      {mode === 'scratch' && phase === 'form' && (
        <>
          <StepIndicator steps={SCRATCH_STEPS as unknown as string[]} current={formStep} />
          {formStep === 0 && (
            <StepScratchAbout config={config} patch={patch} nameError={nameError} onNameFocus={() => setNameError(false)} />
          )}
          {formStep === 1 && (
            <StepCloud
              projectsDir={projectsDir}
              ghAvailable={ghAvailable}
              vercelToken={vercelToken}
              supabaseReady={supabaseReady}
              scaffoldGithub={scaffoldGithub} setScaffoldGithub={setScaffoldGithub}
              scaffoldVercel={scaffoldVercel} setScaffoldVercel={setScaffoldVercel}
              scaffoldSupabase={scaffoldSupabase} setScaffoldSupabase={setScaffoldSupabase}
              config={config} patch={patch}
            />
          )}
        </>
      )}

      {phase === 'running' && (
        <ProgressPanel steps={progress} error={null} result={null} />
      )}

      {(phase === 'done' || phase === 'error') && mode === 'track' && (
        <ProgressPanel steps={progress} error={createError} result={doneResult} />
      )}

      {phase === 'done' && mode === 'scratch' && fullResult && (
        <ScratchResultPanel result={fullResult} />
      )}

      {phase === 'error' && mode === 'scratch' && (
        <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
          {createError}
        </div>
      )}
    </Modal>
  );
}

// ── Mode choice ─────────────────────────────────────────────────────────────────

function ModeChoice({ onChoose }: { onChoose: (m: 'scratch' | 'track') => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        onClick={() => onChoose('scratch')}
        className="flex flex-col items-start gap-2 p-4 rounded-lg border border-border bg-surface hover:bg-hover hover:border-violet-500/40 transition-colors cursor-default text-left group"
      >
        <Hammer size={18} className="text-violet-400" />
        <div>
          <div className="text-sm font-semibold text-slate-200 mb-1">Build from scratch</div>
          <div className="text-xs text-slate-500 leading-relaxed">
            Scaffold a Next.js + Supabase project on disk, set up GitHub, Vercel, and Supabase automatically.
          </div>
        </div>
      </button>

      <button
        onClick={() => onChoose('track')}
        className="flex flex-col items-start gap-2 p-4 rounded-lg border border-border bg-surface hover:bg-hover hover:border-violet-500/40 transition-colors cursor-default text-left group"
      >
        <FolderOpen size={18} className="text-slate-400" />
        <div>
          <div className="text-sm font-semibold text-slate-200 mb-1">Track existing project</div>
          <div className="text-xs text-slate-500 leading-relaxed">
            Import a repo you're already working on. Generates planning docs and Claude skills.
          </div>
        </div>
      </button>
    </div>
  );
}

// ── Step indicator ──────────────────────────────────────────────────────────────

function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center mb-5">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className="flex items-center gap-2">
            <div className={[
              'flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-colors',
              i === current
                ? 'bg-violet-600 text-white'
                : i < current
                  ? 'bg-violet-600/30 text-violet-400'
                  : 'bg-surface text-slate-600 border border-border',
            ].join(' ')}>
              {i < current ? '✓' : i + 1}
            </div>
            <span className={[
              'text-[11px] font-medium transition-colors',
              i === current ? 'text-slate-200' : i < current ? 'text-violet-400' : 'text-slate-600',
            ].join(' ')}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={['w-8 h-px mx-3', i < current ? 'bg-violet-600/40' : 'bg-border'].join(' ')} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Scratch result panel ────────────────────────────────────────────────────────

function ScratchResultPanel({ result }: { result: FullScaffoldResult }) {
  const hasError = result.scaffold_steps.some((s) => s.status === 'error');

  return (
    <div className="space-y-4">
      {/* Cloud service steps */}
      {result.scaffold_steps.length > 0 && (
        <div className="space-y-2">
          {result.scaffold_steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2.5">
              {step.status === 'ok'      ? <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" /> :
               step.status === 'error'   ? <XCircle      size={14} className="text-red-400 mt-0.5 shrink-0" /> :
                                           <MinusCircle  size={14} className="text-slate-600 mt-0.5 shrink-0" />}
              <div>
                <span className="text-sm text-slate-200">{step.label}</span>
                {step.detail && <span className="text-xs text-slate-500 ml-1.5">{step.detail}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="border-t border-border pt-3 space-y-1.5">
        <ScratchInfoRow label="Local path" value={result.project_path} mono copyable />
        {result.github_url && <ScratchInfoRow label="GitHub" value={result.github_url} link />}
        {result.vercel_project_url && <ScratchInfoRow label="Vercel" value={result.vercel_project_url} link />}
        {result.supabase_project_id && <ScratchInfoRow label="Supabase ref" value={result.supabase_project_id} mono copyable />}
        {result.supabase_db_password && (
          <ScratchInfoRow label="DB password" value={result.supabase_db_password} mono copyable warn="Save this — you can't retrieve it later" />
        )}
      </div>

      {/* Next steps */}
      {!hasError && (
        <div className="bg-panel rounded-lg p-3">
          <p className="text-xs text-slate-500 font-medium mb-2">Next steps</p>
          <div className="space-y-1">
            {buildNextSteps(result).map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                {s.startsWith('#')
                  ? <span className="text-xs text-slate-500">{s}</span>
                  : <><span className="text-slate-600 text-xs select-none">$</span><code className="text-xs text-slate-300 font-mono">{s}</code></>
                }
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function buildNextSteps(result: FullScaffoldResult): string[] {
  const steps: string[] = [];
  steps.push(`cd ${result.project_path}`);
  steps.push('npm install');
  if (!result.supabase_project_id) steps.push('# Create a Supabase project at supabase.com');
  steps.push('# Add Supabase URL + anon key to .env.local');
  if (!result.vercel_project_url) steps.push('vercel   # first deploy');
  if (!result.github_url) steps.push('# Create GitHub repo and push: gh repo create');
  return steps;
}

function ScratchInfoRow({
  label, value, mono, link, copyable, warn,
}: {
  label: string; value: string; mono?: boolean; link?: boolean; copyable?: boolean; warn?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-slate-500 shrink-0 w-24">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        {link ? (
          <a href={value} target="_blank" rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300 flex items-center gap-1 truncate">
            {value}<ExternalLink size={10} className="shrink-0" />
          </a>
        ) : (
          <span className={`text-slate-300 truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
        )}
        {copyable && (
          <button onClick={() => navigator.clipboard.writeText(value).catch(() => {})}
            className="text-slate-600 hover:text-slate-400 shrink-0">
            <Copy size={10} />
          </button>
        )}
      </div>
      {warn && <span className="text-yellow-500 text-xs shrink-0">{warn}</span>}
    </div>
  );
}

// ── Step: Scratch About ─────────────────────────────────────────────────────────

function StepScratchAbout({
  config, patch, nameError, onNameFocus,
}: {
  config: NewProjectConfig;
  patch: (p: Partial<NewProjectConfig>) => void;
  nameError: boolean;
  onNameFocus: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel required>Project name</FieldLabel>
        <input
          type="text"
          value={config.name}
          onChange={(e) => patch({ name: e.target.value })}
          onFocus={onNameFocus}
          placeholder="my-awesome-project"
          className={[INPUT_CLS, nameError ? 'border-red-500/60 focus:border-red-500/80' : ''].join(' ')}
          autoFocus
        />
        {nameError && <p className="mt-1 text-[11px] text-red-400">Project name is required</p>}
      </div>
      <div>
        <FieldLabel>Short description <OptionalTag /></FieldLabel>
        <textarea
          value={config.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="What is this project?"
          rows={2}
          className={`${INPUT_CLS} resize-none`}
        />
      </div>
      <div>
        <FieldLabel>Main goal <OptionalTag /></FieldLabel>
        <textarea
          value={config.mainGoal}
          onChange={(e) => patch({ mainGoal: e.target.value })}
          placeholder="What should this project achieve? (helps generate better docs)"
          rows={2}
          className={`${INPUT_CLS} resize-none`}
        />
      </div>
      <div className="px-3 py-2.5 rounded-lg bg-surface border border-border-subtle text-[11px] text-slate-500 leading-relaxed">
        Creates a <span className="text-slate-400">Next.js 15 + React 19 + TypeScript + Tailwind v4 + Supabase SSR</span> project
        with planning docs and Claude skills in your default projects directory.
      </div>
    </div>
  );
}

// ── Step: Cloud services ────────────────────────────────────────────────────────

function StepCloud({
  projectsDir, ghAvailable, vercelToken, supabaseReady,
  scaffoldGithub, setScaffoldGithub,
  scaffoldVercel, setScaffoldVercel,
  scaffoldSupabase, setScaffoldSupabase,
  config, patch,
}: {
  projectsDir: string;
  ghAvailable: boolean | null;
  vercelToken: string;
  supabaseReady: boolean;
  scaffoldGithub: boolean; setScaffoldGithub: (v: boolean) => void;
  scaffoldVercel: boolean; setScaffoldVercel: (v: boolean) => void;
  scaffoldSupabase: boolean; setScaffoldSupabase: (v: boolean) => void;
  config: NewProjectConfig;
  patch: (p: Partial<NewProjectConfig>) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Projects directory status */}
      {!projectsDir ? (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <AlertCircle size={13} className="text-yellow-400 mt-0.5 shrink-0" />
          <p className="text-xs text-yellow-300">
            No default projects directory configured.
            Go to <span className="font-medium">Settings → Integrations</span> to set one before scaffolding.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <CheckCircle2 size={11} className="text-green-400 shrink-0" />
          Will create in: <span className="font-mono text-slate-400">{projectsDir}</span>
        </div>
      )}

      {/* Claude skills */}
      <div className="border border-border rounded-lg overflow-hidden">
        <ToggleRow
          label="Generate Claude skills"
          description="Add .claude/skills/ with project-kickoff, task-planning, safe-feature-build, and more"
          value={config.createClaudeSkills}
          onChange={(v) => patch({ createClaudeSkills: v })}
          last
        />
      </div>

      {/* Cloud options */}
      <div>
        <FieldLabel>Cloud services <OptionalTag /></FieldLabel>
        <div className="space-y-2">
          <CloudOption
            icon={<Github size={13} />}
            label="Create GitHub repo"
            description={
              ghAvailable === null ? 'checking gh CLI…' :
              ghAvailable ? 'gh CLI ready' : 'gh CLI not found — run gh auth login'
            }
            available={ghAvailable ?? false}
            checked={scaffoldGithub}
            onChange={setScaffoldGithub}
          />
          <CloudOption
            icon={<Triangle size={13} />}
            label="Create Vercel project"
            description={vercelToken ? 'token configured' : 'no token — set in Settings'}
            available={!!vercelToken}
            checked={scaffoldVercel}
            onChange={setScaffoldVercel}
          />
          <CloudOption
            icon={<Database size={13} />}
            label="Create Supabase project"
            description={supabaseReady ? 'token + org ID configured' : 'token/org missing — set in Settings'}
            available={supabaseReady}
            checked={scaffoldSupabase}
            onChange={setScaffoldSupabase}
          />
        </div>
      </div>

      <p className="text-[11px] text-slate-600 leading-relaxed">
        Unchecked or unavailable services are skipped — you can set them up manually later.
      </p>
    </div>
  );
}

function CloudOption({
  icon, label, description, available, checked, onChange,
}: {
  icon: React.ReactNode; label: string; description: string;
  available: boolean; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 p-2.5 rounded-lg border border-border-subtle hover:border-border transition-colors cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-violet-500 w-3.5 h-3.5"
      />
      <span className={available ? 'text-slate-400' : 'text-slate-600'}>{icon}</span>
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-medium ${available ? 'text-slate-300' : 'text-slate-500'}`}>{label}</span>
        <span className={`text-xs ml-1.5 ${available ? 'text-slate-500' : 'text-slate-600'}`}>— {description}</span>
      </div>
    </label>
  );
}

// ── Track mode steps (unchanged) ────────────────────────────────────────────────

function StepAbout({
  config, patch, nameError, onNameFocus,
}: {
  config: NewProjectConfig;
  patch: (p: Partial<NewProjectConfig>) => void;
  nameError: boolean;
  onNameFocus: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel required>Project name</FieldLabel>
        <input
          type="text"
          value={config.name}
          onChange={(e) => patch({ name: e.target.value })}
          onFocus={onNameFocus}
          placeholder="my-awesome-project"
          className={[INPUT_CLS, nameError ? 'border-red-500/60 focus:border-red-500/80' : ''].join(' ')}
          autoFocus
        />
        {nameError && <p className="mt-1 text-[11px] text-red-400">Project name is required</p>}
      </div>

      <div>
        <FieldLabel>Short description</FieldLabel>
        <textarea
          value={config.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="What is this project?"
          rows={2}
          className={`${INPUT_CLS} resize-none`}
        />
      </div>

      <div>
        <FieldLabel>Project type</FieldLabel>
        <div className="grid grid-cols-3 gap-2">
          {PROJECT_TYPES.map(({ value, label, icon: Icon }) => (
            <CardOption key={value} active={config.projectType === value} onClick={() => patch({ projectType: value })}>
              <Icon size={15} className={config.projectType === value ? 'text-violet-400' : 'text-slate-500'} />
              <span className="text-xs font-medium leading-tight">{label}</span>
            </CardOption>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Main goal <OptionalTag /></FieldLabel>
        <textarea
          value={config.mainGoal}
          onChange={(e) => patch({ mainGoal: e.target.value })}
          placeholder="What should this project achieve? (helps generate better docs)"
          rows={2}
          className={`${INPUT_CLS} resize-none`}
        />
      </div>
    </div>
  );
}

function StepSetup({
  config, patch, toggleAddOn,
}: {
  config: NewProjectConfig;
  patch: (p: Partial<NewProjectConfig>) => void;
  toggleAddOn: (addon: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>Starter template</FieldLabel>
        <div className="grid grid-cols-3 gap-2">
          {STARTER_TEMPLATES.map(({ value, label, sub, icon: Icon }) => (
            <CardOption key={value} active={config.starterTemplate === value} onClick={() => patch({ starterTemplate: value })}>
              <Icon size={15} className={config.starterTemplate === value ? 'text-violet-400' : 'text-slate-500'} />
              <span className="text-xs font-medium leading-tight">{label}</span>
              <span className={`text-[10px] leading-tight ${config.starterTemplate === value ? 'text-violet-400' : 'text-slate-600'}`}>{sub}</span>
            </CardOption>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Stack add-ons <OptionalTag /></FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {ADD_ONS.map((addon) => {
            const active = config.addOns.includes(addon);
            return (
              <button
                key={addon}
                onClick={() => toggleAddOn(addon)}
                className={[
                  'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-default',
                  active
                    ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                    : 'border-border bg-surface text-slate-500 hover:bg-hover hover:text-slate-300',
                ].join(' ')}
              >
                {addon}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <FieldLabel>Key constraints <OptionalTag /></FieldLabel>
        <textarea
          value={config.constraints}
          onChange={(e) => patch({ constraints: e.target.value })}
          placeholder="e.g. Must run offline, no paid APIs, TypeScript only, ship in 2 weeks"
          rows={2}
          className={`${INPUT_CLS} resize-none`}
        />
      </div>
    </div>
  );
}

function StepOptions({
  config, patch,
}: {
  config: NewProjectConfig;
  patch: (p: Partial<NewProjectConfig>) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>Preferred coding style <OptionalTag /></FieldLabel>
        <input
          type="text"
          value={config.codingStyle}
          onChange={(e) => patch({ codingStyle: e.target.value })}
          placeholder="e.g. Clean, functional, typed, minimal abstractions"
          className={INPUT_CLS}
        />
      </div>

      <div>
        <FieldLabel>Preferred UI style <OptionalTag /></FieldLabel>
        <input
          type="text"
          value={config.uiStyle}
          onChange={(e) => patch({ uiStyle: e.target.value })}
          placeholder="e.g. Tailwind, minimal, dark mode first, no CSS-in-JS"
          className={INPUT_CLS}
        />
      </div>

      <div className="space-y-0 border border-border rounded-lg overflow-hidden">
        <ToggleRow
          label="Initialise Git repo"
          description="Run git init and create an initial commit"
          value={config.createGitRepo}
          onChange={(v) => patch({ createGitRepo: v })}
        />
        <ToggleRow
          label="Generate Claude skills"
          description="Add .claude/skills/ with project-kickoff, task-planning, safe-feature-build, and more"
          value={config.createClaudeSkills}
          onChange={(v) => patch({ createClaudeSkills: v })}
          last
        />
      </div>

      <div className="rounded-lg bg-surface border border-border-subtle px-3 py-2.5 text-[11px] text-slate-500 leading-relaxed">
        Will generate:{' '}
        <span className="text-slate-400">
          CLAUDE.md, PROJECT_BRIEF.md, PRODUCT_REQUIREMENTS.md, TECHNICAL_SPEC.md,
          TASKS.md, DECISION_LOG.md, SESSION_LOG.md, RISKS_ASSUMPTIONS_DEPENDENCIES.md,
          PROJECT_STAGE.md, PROJECT_START_PROMPT.md, README.md
        </span>
        {config.createClaudeSkills && (
          <> · <span className="text-violet-400">6 Claude skills</span></>
        )}
      </div>
    </div>
  );
}

// ── Track progress panel ────────────────────────────────────────────────────────

function ProgressPanel({
  steps, error, result,
}: {
  steps: ProgressStep[];
  error: string | null;
  result: ProjectInitResult | null;
}) {
  const doneCount  = steps.filter((s) => s.status === 'done').length;
  const total      = steps.length;
  const percent    = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const hasError   = steps.some((s) => s.status === 'error') || error !== null;
  const allDone    = doneCount === total && total > 0;
  const current    = steps.find((s) => s.status === 'running');

  const statusLabel = hasError ? 'Setup failed' : allDone ? 'Done' : current?.label ?? 'Setting up…';

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-400">{statusLabel}</span>
          <span className="text-xs tabular-nums text-slate-600">{percent}%</span>
        </div>
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className={['h-full rounded-full transition-all duration-500',
              hasError ? 'bg-red-500' : allDone ? 'bg-green-500' : 'bg-violet-600',
            ].join(' ')}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="space-y-2.5">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-2.5">
            <StepIcon status={step.status} />
            <span className={['text-sm transition-colors',
              step.status === 'done'    ? 'text-slate-300'            :
              step.status === 'running' ? 'text-slate-100 font-medium':
              step.status === 'error'   ? 'text-red-400'              :
                                          'text-slate-600',
            ].join(' ')}>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
          {error}
        </div>
      )}

      {allDone && result && (
        <div className="px-3 py-2.5 rounded-lg bg-surface border border-border-subtle text-[11px] text-slate-500 leading-relaxed">
          Created in{' '}
          <span className="text-slate-400 font-mono text-[10px]">{result.project_path}</span>
        </div>
      )}
    </div>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'done')    return <CheckCircle2 size={14} className="text-green-500 shrink-0" />;
  if (status === 'running') return <Loader2      size={14} className="text-violet-400 animate-spin shrink-0" />;
  if (status === 'error')   return <XCircle      size={14} className="text-red-400 shrink-0" />;
  return                           <Circle       size={14} className="text-slate-700 shrink-0" />;
}

// ── Shared primitives ───────────────────────────────────────────────────────────

const INPUT_CLS = [
  'w-full bg-surface border border-border rounded-md px-3 py-2',
  'text-sm text-slate-200 placeholder-slate-600',
  'outline-none focus:ring-1 focus:ring-violet-500/40 focus:border-violet-500/50',
  'transition-colors',
].join(' ');

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">
      {children}
      {required && <span className="text-violet-400 ml-0.5">*</span>}
    </label>
  );
}

function OptionalTag() {
  return (
    <span className="normal-case font-normal text-slate-700 tracking-normal">(optional)</span>
  );
}

function CardOption({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex flex-col items-start gap-1 p-3 rounded-lg border transition-colors cursor-default text-left',
        active
          ? 'border-violet-500/50 bg-violet-500/8 text-slate-200'
          : 'border-border bg-surface text-slate-400 hover:bg-hover hover:border-border hover:text-slate-300',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label, description, value, onChange, last,
}: {
  label: string; description: string; value: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <div className={['flex items-center justify-between gap-4 px-3 py-2.5 bg-surface',
      !last ? 'border-b border-border-subtle' : '',
    ].join(' ')}>
      <div>
        <div className="text-sm font-medium text-slate-300">{label}</div>
        <div className="text-[11px] text-slate-600 mt-0.5">{description}</div>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={['relative w-9 h-5 rounded-full transition-colors cursor-default shrink-0',
        value ? 'bg-violet-600' : 'bg-border',
      ].join(' ')}
      role="switch"
      aria-checked={value}
    >
      <span className={['absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform',
        value ? 'translate-x-4' : 'translate-x-0',
      ].join(' ')} />
    </button>
  );
}
