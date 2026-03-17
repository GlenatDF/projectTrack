import { useRef, useState, useEffect } from 'react';
import {
  LayoutDashboard, FolderKanban, FolderSearch, Settings,
  BookOpen, Plus, RefreshCw, FolderOpen, Code2, Terminal,
  Bot, Sparkles, FileText, GitBranch, AlertTriangle,
  Download, Activity, CheckCircle2, BarChart3,
  ChevronRight, HelpCircle,
  XCircle, Circle, Star, ClipboardList, ShieldAlert,
} from 'lucide-react';

/* ── Section definitions ──────────────────────────────────────────── */
const sections = [
  { id: 'overview',       label: 'Overview' },
  { id: 'dashboard',      label: 'Dashboard' },
  { id: 'projects',       label: 'Projects' },
  { id: 'project-detail', label: 'Project Detail' },
  { id: 'planning',       label: 'Planning' },
  { id: 'discover',       label: 'Discover' },
  { id: 'settings',       label: 'Settings' },
  { id: 'reference',      label: 'Reference' },
];

/* ── Small reusable pieces ────────────────────────────────────────── */
function SectionHeading({ id, icon: Icon, title, subtitle }: {
  id: string; icon: React.ElementType; title: string; subtitle: string;
}) {
  return (
    <div id={id} className="flex items-start gap-3 mb-4 scroll-mt-4">
      <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={15} className="text-indigo-400" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-xl p-5 ${className}`}>
      {children}
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{children}</h3>;
}

function FeatureRow({ icon: Icon, label, desc, iconColor = 'text-indigo-400' }: {
  icon: React.ElementType; label: string; desc: string; iconColor?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <Icon size={14} className={`${iconColor} mt-0.5 shrink-0`} />
      <div>
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function KeyChip({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-slate-300 font-mono">
      {children}
    </kbd>
  );
}

function StatusRow({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${color}`} />
      <div>
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────── */
export default function Manual() {
  const [activeSection, setActiveSection] = useState('overview');
  const contentRef = useRef<HTMLDivElement>(null);

  /* Track which section is in view */
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handler = () => {
      for (const { id } of [...sections].reverse()) {
        const target = document.getElementById(id);
        if (target && target.getBoundingClientRect().top <= 80) {
          setActiveSection(id);
          return;
        }
      }
      setActiveSection('overview');
    };
    el.addEventListener('scroll', handler);
    return () => el.removeEventListener('scroll', handler);
  }, []);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left TOC ───────────────────────── */}
      <nav className="w-44 shrink-0 border-r border-border px-3 py-6 overflow-y-auto">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2 mb-3">
          Contents
        </p>
        <div className="space-y-0.5">
          {sections.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left transition-colors ${
                activeSection === id
                  ? 'bg-indigo-500/15 text-indigo-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-hover'
              }`}
            >
              {activeSection === id && <ChevronRight size={11} className="shrink-0" />}
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Content ────────────────────────── */}
      <div ref={contentRef} className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl">

          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <BookOpen size={17} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100">User Manual</h1>
              <p className="text-sm text-slate-400 mt-0.5">Complete guide to Project Tracker</p>
            </div>
          </div>

          {/* ─── Overview ─────────────────── */}
          <section className="mb-8">
            <SectionHeading
              id="overview"
              icon={HelpCircle}
              title="Overview"
              subtitle="What Project Tracker is and how to use it"
            />
            <Card>
              <p className="text-sm text-slate-300 leading-relaxed mb-4">
                <strong className="text-slate-100">Project Tracker</strong> is a local-only macOS desktop app
                for tracking your AI-assisted vibe-coding projects. All data is stored in a SQLite database on
                your Mac — no accounts, no cloud sync, no internet required.
              </p>
              <SubHeading>Key capabilities</SubHeading>
              <div className="space-y-0">
                <FeatureRow icon={FolderKanban} label="Project registry" desc="Keep a catalogue of all your coding projects with status, phase, priority, and health tracking." />
                <FeatureRow icon={Activity} label="Git scanning" desc="Scan linked repos for recent commits, dirty state, and activity to auto-update health scores." />
                <FeatureRow icon={Sparkles} label="AI planning" desc="Generate structured plans with phases, tasks, risks, and assumptions via Claude." />
                <FeatureRow icon={FileText} label="Project documents" desc="Auto-scaffold 8 living docs per project (brief, architecture, decisions log, etc.)." />
                <FeatureRow icon={Download} label="Portability" desc="Export/import all project metadata as JSON for backup or machine migration." />
              </div>
            </Card>
          </section>

          {/* ─── Dashboard ────────────────── */}
          <section className="mb-8">
            <SectionHeading
              id="dashboard"
              icon={LayoutDashboard}
              title="Dashboard"
              subtitle="Your home screen — at-a-glance stats and quick project access"
            />
            <Card className="mb-3">
              <SubHeading>Stat cards</SubHeading>
              <div className="space-y-0">
                <FeatureRow icon={BarChart3} label="Total / Active" desc="Count of all projects and those currently in-progress." iconColor="text-cyan-400" />
                <FeatureRow icon={AlertTriangle} label="Stale" desc="Projects with a repo path but no scan in the last 7 days and not marked done." iconColor="text-amber-400" />
                <FeatureRow icon={GitBranch} label="Dirty repos" desc="Projects whose repo has uncommitted changes detected on the last scan." iconColor="text-orange-400" />
              </div>
            </Card>
            <Card>
              <SubHeading>Status filter tabs</SubHeading>
              <p className="text-sm text-slate-400 mb-3">
                Click a status tab (All / Active / Paused / Done / Idea) to filter the project list below the stats.
                The count badge on each tab updates live.
              </p>
              <SubHeading>Project cards</SubHeading>
              <p className="text-sm text-slate-400">
                Each card shows the project name, status badge, phase, priority dot, health dot, last scan time,
                and a git dirty indicator. Click any card to open the full Project Detail view.
              </p>
            </Card>
          </section>

          {/* ─── Projects ─────────────────── */}
          <section className="mb-8">
            <SectionHeading
              id="projects"
              icon={FolderKanban}
              title="Projects"
              subtitle="Full project list with advanced filtering and sorting"
            />
            <Card className="mb-3">
              <SubHeading>Creating a project</SubHeading>
              <p className="text-sm text-slate-400 mb-3">
                Click <strong className="text-slate-300">+ New Project</strong> (top-right of Projects or Dashboard).
                Fill in:
              </p>
              <div className="space-y-0">
                <FeatureRow icon={CheckCircle2} label="Name" desc="Short identifier for the project." iconColor="text-green-400" />
                <FeatureRow icon={CheckCircle2} label="Description" desc="One-line summary of what the project does." iconColor="text-green-400" />
                <FeatureRow icon={CheckCircle2} label="Local repo path" desc="Absolute path to the folder on disk (optional — can be linked later)." iconColor="text-slate-500" />
                <FeatureRow icon={CheckCircle2} label="Status / Phase / Priority / AI tool" desc="Metadata fields for filtering and tracking." iconColor="text-slate-500" />
              </div>
            </Card>
            <Card>
              <SubHeading>Filtering &amp; sorting</SubHeading>
              <p className="text-sm text-slate-400 mb-3">
                The Projects page has filter controls for <strong className="text-slate-300">phase</strong>,{' '}
                <strong className="text-slate-300">priority</strong>, and quick toggles for{' '}
                <strong className="text-slate-300">Dirty</strong> and{' '}
                <strong className="text-slate-300">Stale</strong> projects.
                The search box filters by name/description in real time.
              </p>
              <SubHeading>Editing &amp; deleting</SubHeading>
              <p className="text-sm text-slate-400">
                Open a project then click the <strong className="text-slate-300">Edit</strong> button (pencil icon)
                in the detail header. To delete, use the trash icon — you'll be asked to confirm.
                Deletion is permanent and removes all associated scans, documents, and plan data.
              </p>
            </Card>
          </section>

          {/* ─── Project Detail ───────────── */}
          <section className="mb-8">
            <SectionHeading
              id="project-detail"
              icon={Activity}
              title="Project Detail"
              subtitle="Four-tab deep-dive into a single project"
            />
            <Card className="mb-3">
              <SubHeading>Overview tab</SubHeading>
              <div className="space-y-0">
                <FeatureRow icon={RefreshCw} label="Scan" desc="Runs a git scan on the linked repo to capture commit history, dirty state, and branch name." iconColor="text-cyan-400" />
                <FeatureRow icon={FolderOpen} label="Open folder" desc="Opens the repo directory in Finder." iconColor="text-slate-400" />
                <FeatureRow icon={Code2} label="Open in VS Code" desc="Opens the repo in VS Code." iconColor="text-blue-400" />
                <FeatureRow icon={Terminal} label="Open in Terminal / iTerm" desc="Opens a terminal session in the repo folder. Uses iTerm if available." iconColor="text-green-400" />
                <FeatureRow icon={Bot} label="Run Claude here" desc="Opens Claude Code in the terminal at the repo folder." iconColor="text-violet-400" />
                <FeatureRow icon={Sparkles} label="Claude bootstrap" desc="Generates a project-context prompt and optionally launches Claude with it pre-loaded." iconColor="text-amber-400" />
              </div>
            </Card>
            <Card className="mb-3">
              <SubHeading>Notes &amp; relinking</SubHeading>
              <p className="text-sm text-slate-400 mb-2">
                The <strong className="text-slate-300">Notes</strong> field on the Overview tab is free-form
                markdown text. Click to enter edit mode, then <KeyChip>Save</KeyChip> or press{' '}
                <KeyChip>Esc</KeyChip> to cancel.
              </p>
              <p className="text-sm text-slate-400">
                If the project was imported from another Mac (or the folder moved), use{' '}
                <strong className="text-slate-300">Relink Repo Path</strong> (link icon) to update the
                local path without touching any other metadata.
              </p>
            </Card>
            <Card>
              <SubHeading>Scan history</SubHeading>
              <p className="text-sm text-slate-400">
                The right column shows the last 10 git scans with timestamps, commit hashes, dirty status,
                and file change counts. Useful for spotting when a project went stale.
              </p>
            </Card>
          </section>

          {/* ─── Planning ─────────────────── */}
          <section className="mb-8">
            <SectionHeading
              id="planning"
              icon={Sparkles}
              title="Planning"
              subtitle="AI-powered planning with phases, tasks, risks, and living docs"
            />
            <Card className="mb-3">
              <SubHeading>Docs tab</SubHeading>
              <p className="text-sm text-slate-400 mb-3">
                Every project is auto-scaffolded with 8 living documents when it is created:
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400 mb-3">
                {[
                  'Project Brief', 'Architecture Notes', 'Decision Log',
                  'Implementation Notes', 'Testing Plan', 'Deployment Runbook',
                  'Retrospective', 'Claude Instructions',
                ].map(d => (
                  <div key={d} className="flex items-center gap-1.5 py-1 border-b border-border/50">
                    <FileText size={11} className="text-slate-500 shrink-0" />
                    <span>{d}</span>
                  </div>
                ))}
              </div>
              <p className="text-sm text-slate-400">
                Click any document to expand and edit it. Changes are saved immediately.
                Mark a doc as <strong className="text-slate-300">Done</strong> when it's complete.
              </p>
            </Card>
            <Card className="mb-3">
              <SubHeading>Generating a plan</SubHeading>
              <p className="text-sm text-slate-400 mb-2">
                On the <strong className="text-slate-300">Plan tab</strong>, click{' '}
                <strong className="text-slate-300">Generate Plan</strong>. The modal shows a prompt
                assembled from your project details and methodology blocks.
              </p>
              <p className="text-sm text-slate-400 mb-2">
                Copy the prompt, paste it into Claude (or another LLM), and paste the response back
                into the <strong className="text-slate-300">Import Plan Response</strong> field.
                The parser extracts phases, tasks, risks, and assumptions into structured records.
              </p>
              <p className="text-sm text-slate-400">
                Re-importing a plan only replaces phases/tasks you haven't manually edited
                (<strong className="text-slate-300">user_modified</strong> flag is respected).
              </p>
            </Card>
            <Card>
              <SubHeading>Tasks tab (Plan)</SubHeading>
              <div className="space-y-0">
                <FeatureRow icon={ClipboardList} label="Phases" desc="Top-level milestones. Each phase has an ordered list of tasks. Mark phases done when all tasks complete." iconColor="text-violet-400" />
                <FeatureRow icon={CheckCircle2} label="Tasks" desc="Leaf-level work items. Toggle between pending / in-progress / done by clicking the status icon." iconColor="text-green-400" />
              </div>
              <div className="mt-3">
                <SubHeading>Risks tab</SubHeading>
                <div className="space-y-0">
                  <FeatureRow icon={ShieldAlert} label="Risks" desc="Identified risks with likelihood and impact levels (low / medium / high / critical)." iconColor="text-red-400" />
                  <FeatureRow icon={AlertTriangle} label="Assumptions" desc="Captured assumptions from the plan response. Review and validate as the project progresses." iconColor="text-amber-400" />
                </div>
              </div>
            </Card>
          </section>

          {/* ─── Discover ─────────────────── */}
          <section className="mb-8">
            <SectionHeading
              id="discover"
              icon={FolderSearch}
              title="Discover"
              subtitle="Scan your filesystem for existing repos to add as projects"
            />
            <Card>
              <p className="text-sm text-slate-400 mb-3">
                The Discover page lets you point Project Tracker at a root folder (e.g.{' '}
                <code className="text-xs bg-surface border border-border rounded px-1 py-0.5 font-mono">~/Projects</code>)
                and find all git repositories beneath it.
              </p>
              <div className="space-y-0">
                <FeatureRow icon={FolderSearch} label="Scan directory" desc="Enter a path and click Scan. Results list all .git folders found, one level deep by default." />
                <FeatureRow icon={Plus} label="Add to tracker" desc="Click the + button next to any discovered repo to create a new project entry pre-filled with the path and name." iconColor="text-green-400" />
                <FeatureRow icon={CheckCircle2} label="Already tracked" desc="Repos that are already in Project Tracker are shown with a check mark and can't be added twice." iconColor="text-slate-500" />
              </div>
            </Card>
          </section>

          {/* ─── Settings ─────────────────── */}
          <section className="mb-8">
            <SectionHeading
              id="settings"
              icon={Settings}
              title="Settings"
              subtitle="Data portability and app information"
            />
            <Card>
              <SubHeading>Export JSON</SubHeading>
              <p className="text-sm text-slate-400 mb-4">
                Downloads a <code className="text-xs bg-surface border border-border rounded px-1 py-0.5 font-mono">.json</code> file
                containing all projects, documents, plan data, scans, and settings. Use this for:
              </p>
              <ul className="text-sm text-slate-400 space-y-1 mb-4 list-none pl-0">
                {[
                  'Regular backups of your project registry',
                  'Migrating to a new Mac',
                  'Sharing a project catalogue with a team member',
                ].map(t => (
                  <li key={t} className="flex items-start gap-2">
                    <Download size={12} className="text-indigo-400 mt-1 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
              <SubHeading>Import JSON</SubHeading>
              <p className="text-sm text-slate-400 mb-3">
                Select a previously exported file. Projects are imported without overwriting existing ones
                (matched by name). Local repo paths are preserved in the data but are machine-specific —
                use <strong className="text-slate-300">Relink Repo Path</strong> on each project after importing
                to restore git scanning.
              </p>
              <SubHeading>Storage location</SubHeading>
              <p className="text-xs text-slate-500 font-mono bg-surface border border-border rounded-lg px-3 py-2">
                ~/Library/Application Support/com.glen.projecttracker/projects.db
              </p>
            </Card>
          </section>

          {/* ─── Reference ────────────────── */}
          <section className="mb-12">
            <SectionHeading
              id="reference"
              icon={BookOpen}
              title="Reference"
              subtitle="Statuses, phases, priorities, and health scoring explained"
            />
            <Card className="mb-3">
              <SubHeading>Project statuses</SubHeading>
              <div className="space-y-0">
                <StatusRow color="bg-green-400" label="Active" desc="Currently being worked on." />
                <StatusRow color="bg-blue-400" label="Idea" desc="Not started yet — captured for future work." />
                <StatusRow color="bg-yellow-400" label="Paused" desc="Work is temporarily halted." />
                <StatusRow color="bg-slate-400" label="Done" desc="Completed. Excluded from stale calculations." />
                <StatusRow color="bg-red-400" label="Abandoned" desc="No longer being pursued." />
              </div>
            </Card>
            <Card className="mb-3">
              <SubHeading>Project phases</SubHeading>
              <div className="grid grid-cols-2 gap-x-4 text-xs text-slate-400">
                {[
                  ['Discovery', 'Research and requirements gathering'],
                  ['Planning', 'Architecture and task breakdown'],
                  ['Development', 'Active implementation'],
                  ['Testing', 'QA, bug fixing, and validation'],
                  ['Deployment', 'Releasing and monitoring'],
                  ['Maintenance', 'Ongoing improvements'],
                ].map(([name, desc]) => (
                  <div key={name} className="py-1.5 border-b border-border/50">
                    <span className="text-slate-300 font-medium">{name}</span>
                    <p className="text-slate-500 mt-0.5">{desc}</p>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="mb-3">
              <SubHeading>Priority levels</SubHeading>
              <div className="space-y-0">
                <FeatureRow icon={Star} label="Critical" desc="Must be done immediately. Shown with a red priority dot." iconColor="text-red-400" />
                <FeatureRow icon={Star} label="High" desc="Important but not blocking everything else. Orange dot." iconColor="text-orange-400" />
                <FeatureRow icon={Star} label="Medium" desc="Normal priority. Yellow dot." iconColor="text-yellow-400" />
                <FeatureRow icon={Star} label="Low" desc="Nice to have. Grey dot." iconColor="text-slate-500" />
              </div>
            </Card>
            <Card>
              <SubHeading>Health scoring</SubHeading>
              <p className="text-sm text-slate-400 mb-3">
                Health is computed from the most recent git scan. A project is considered:
              </p>
              <div className="space-y-0">
                <FeatureRow icon={CheckCircle2} label="Healthy (green)" desc="Recent commit activity within the expected cadence for the project's phase." iconColor="text-green-400" />
                <FeatureRow icon={AlertTriangle} label="Warning (yellow)" desc="No commits for several days or a dirty repo with many uncommitted changes." iconColor="text-yellow-400" />
                <FeatureRow icon={XCircle} label="Critical (red)" desc="No scan in 7+ days, or no commits in a long time on an active project." iconColor="text-red-400" />
                <FeatureRow icon={Circle} label="Unknown (grey)" desc="No repo linked or never scanned." iconColor="text-slate-500" />
              </div>
            </Card>
          </section>

        </div>
      </div>
    </div>
  );
}
