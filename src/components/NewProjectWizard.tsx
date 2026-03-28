import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Globe, Monitor, Wrench, Zap, BookOpen,
  LayoutTemplate, Package, Layers, FileText, BookMarked,
  Loader2, CheckCircle2, XCircle, Circle,
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { initNewProject } from '../lib/api';
import type { ProjectInitRequest, ProjectInitResult } from '../lib/types';

// ── Config type (camelCase — internal to wizard) ───────────────────────────────

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

// ── Progress types ─────────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'done' | 'error';

interface ProgressStep {
  id: string;
  label: string;
  status: StepStatus;
}

type ProgressPayload = { step: string; label: string; status: string };

function buildProgressSteps(config: NewProjectConfig): ProgressStep[] {
  const steps: ProgressStep[] = [
    { id: 'folder',   label: 'Creating project folder',  status: 'pending' },
    { id: 'docs',     label: 'Generating markdown docs',  status: 'pending' },
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

const FORM_STEPS = ['About', 'Setup', 'Options'] as const;

// ── Phase state machine ────────────────────────────────────────────────────────
// form     → user is filling in the wizard
// running  → backend is generating the project
// done     → all steps completed successfully
// error    → one or more steps failed

type Phase = 'form' | 'running' | 'done' | 'error';

// ── Wizard ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (projectId: number) => void;
}

export function NewProjectWizard({ open, onClose, onCreated }: Props) {
  const [formStep, setFormStep]   = useState(0);
  const [config, setConfig]       = useState<NewProjectConfig>(DEFAULT_CONFIG);
  const [nameError, setNameError] = useState(false);

  const [phase, setPhase]         = useState<Phase>('form');
  const [progress, setProgress]   = useState<ProgressStep[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [doneResult, setDoneResult]   = useState<ProjectInitResult | null>(null);

  function reset() {
    setFormStep(0);
    setConfig(DEFAULT_CONFIG);
    setNameError(false);
    setPhase('form');
    setProgress([]);
    setCreateError(null);
    setDoneResult(null);
  }

  function handleClose() {
    if (phase === 'running') return; // block close while generating
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

  function handleNext() {
    if (formStep === 0 && !config.name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setFormStep((s) => s + 1);
  }

  function handleBack() {
    setFormStep((s) => s - 1);
  }

  async function handleCreate() {
    const initialSteps = buildProgressSteps(config);
    setProgress(initialSteps);
    setCreateError(null);
    setPhase('running');

    // Subscribe before invoking to avoid any race between emit and listen.
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

  // ── Footer varies by phase ────────────────────────────────────────────────────

  let footer: React.ReactNode;

  if (phase === 'form') {
    footer = (
      <div className="flex items-center justify-between w-full">
        <div>
          {formStep > 0
            ? <Button variant="ghost" size="sm" onClick={handleBack}>← Back</Button>
            : <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          }
        </div>
        {formStep < FORM_STEPS.length - 1
          ? <Button variant="primary" size="sm" onClick={handleNext}>Next →</Button>
          : <Button variant="primary" size="sm" onClick={handleCreate}>Create Project</Button>
        }
      </div>
    );
  } else if (phase === 'done') {
    footer = (
      <div className="flex items-center justify-between w-full">
        <span className="text-[11px] text-slate-600">
          {doneResult ? `${doneResult.files_created.length} files created` : ''}
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={() => { onCreated(doneResult!.project_id); reset(); onClose(); }}
        >
          Open Project →
        </Button>
      </div>
    );
  } else if (phase === 'error') {
    footer = (
      <div className="flex items-center justify-between w-full">
        <span className="text-[11px] text-red-400">
          Setup failed
        </span>
        <Button variant="ghost" size="sm" onClick={handleClose}>Close</Button>
      </div>
    );
  } else {
    footer = null; // running — no footer buttons
  }

  // ── Modal subtitle ────────────────────────────────────────────────────────────

  const subtitleMap: Record<Phase, string> = {
    form:    'Set up a Claude-ready project with docs, skills, and structure',
    running: 'Creating your project…',
    done:    `Ready — ${doneResult?.project_path ?? ''}`,
    error:   'Setup failed',
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="xl"
      title="New Project"
      subtitle={subtitleMap[phase]}
      footer={footer}
    >
      {phase === 'form' ? (
        <>
          {/* Step indicator */}
          <div className="flex items-center mb-5">
            {FORM_STEPS.map((label, i) => (
              <div key={i} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div className={[
                    'flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-colors',
                    i === formStep
                      ? 'bg-violet-600 text-white'
                      : i < formStep
                        ? 'bg-violet-600/30 text-violet-400'
                        : 'bg-surface text-slate-600 border border-border',
                  ].join(' ')}>
                    {i < formStep ? '✓' : i + 1}
                  </div>
                  <span className={[
                    'text-[11px] font-medium transition-colors',
                    i === formStep ? 'text-slate-200' : i < formStep ? 'text-violet-400' : 'text-slate-600',
                  ].join(' ')}>
                    {label}
                  </span>
                </div>
                {i < FORM_STEPS.length - 1 && (
                  <div className={['w-8 h-px mx-3', i < formStep ? 'bg-violet-600/40' : 'bg-border'].join(' ')} />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          {formStep === 0 && (
            <StepAbout
              config={config}
              patch={patch}
              nameError={nameError}
              onNameFocus={() => setNameError(false)}
            />
          )}
          {formStep === 1 && (
            <StepSetup config={config} patch={patch} toggleAddOn={toggleAddOn} />
          )}
          {formStep === 2 && (
            <StepOptions config={config} patch={patch} />
          )}
        </>
      ) : (
        <ProgressPanel
          steps={progress}
          error={createError}
          result={doneResult}
        />
      )}
    </Modal>
  );
}

// ── Progress panel ─────────────────────────────────────────────────────────────

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

  const statusLabel = hasError
    ? 'Setup failed'
    : allDone
      ? 'Done'
      : current?.label ?? 'Setting up…';

  return (
    <div className="space-y-5">
      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-400">
            {statusLabel}
          </span>
          <span className="text-xs tabular-nums text-slate-600">{percent}%</span>
        </div>
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className={[
              'h-full rounded-full transition-all duration-500',
              hasError ? 'bg-red-500' : allDone ? 'bg-green-500' : 'bg-violet-600',
            ].join(' ')}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Steps checklist */}
      <div className="space-y-2.5">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-2.5">
            <StepIcon status={step.status} />
            <span className={[
              'text-sm transition-colors',
              step.status === 'done'    ? 'text-slate-300'       :
              step.status === 'running' ? 'text-slate-100 font-medium' :
              step.status === 'error'   ? 'text-red-400'         :
                                          'text-slate-600',
            ].join(' ')}>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Backend error detail */}
      {error && (
        <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Success detail */}
      {allDone && result && (
        <div className="px-3 py-2.5 rounded-lg bg-surface border border-border-subtle text-[11px] text-slate-500 leading-relaxed">
          Created in{' '}
          <span className="text-slate-400 font-mono text-[10px]">
            {result.project_path}
          </span>
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

// ── Step 1 — About ─────────────────────────────────────────────────────────────

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
        {nameError && (
          <p className="mt-1 text-[11px] text-red-400">
            Project name is required
          </p>
        )}
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
            <CardOption
              key={value}
              active={config.projectType === value}
              onClick={() => patch({ projectType: value })}
            >
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

// ── Step 2 — Setup ─────────────────────────────────────────────────────────────

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
            <CardOption
              key={value}
              active={config.starterTemplate === value}
              onClick={() => patch({ starterTemplate: value })}
            >
              <Icon size={15} className={config.starterTemplate === value ? 'text-violet-400' : 'text-slate-500'} />
              <span className="text-xs font-medium leading-tight">{label}</span>
              <span className={`text-[10px] leading-tight ${config.starterTemplate === value ? 'text-violet-400' : 'text-slate-600'}`}>
                {sub}
              </span>
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

// ── Step 3 — Options ───────────────────────────────────────────────────────────

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

// ── Shared primitives ──────────────────────────────────────────────────────────

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
    <span className="normal-case font-normal text-slate-700 tracking-normal">
      (optional)
    </span>
  );
}

function CardOption({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
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
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <div className={[
      'flex items-center justify-between gap-4 px-3 py-2.5 bg-surface',
      !last ? 'border-b border-border-subtle' : '',
    ].join(' ')}>
      <div>
        <div className="text-sm font-medium text-slate-300">
          {label}
        </div>
        <div className="text-[11px] text-slate-600 mt-0.5">
          {description}
        </div>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={[
        'relative w-9 h-5 rounded-full transition-colors cursor-default shrink-0',
        value ? 'bg-violet-600' : 'bg-border',
      ].join(' ')}
      role="switch"
      aria-checked={value}
    >
      <span className={[
        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform',
        value ? 'translate-x-4' : 'translate-x-0',
      ].join(' ')} />
    </button>
  );
}
