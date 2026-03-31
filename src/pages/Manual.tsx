import { useRef, useState, useEffect } from 'react';
import {
  LayoutDashboard, FolderKanban, FolderSearch, Settings,
  BookOpen, Plus, RefreshCw, FolderOpen, Code2, Terminal,
  Bot, Sparkles, FileText, GitBranch, AlertTriangle,
  Download, Activity, CheckCircle2, BarChart3,
  HelpCircle, XCircle, Circle, Star, ClipboardList, ShieldAlert,
  MessageSquare, MessageSquarePlus, Wrench, Wand2, FlaskConical, Hammer, Search,
} from 'lucide-react';

/* ── Section definitions ──────────────────────────────────────────── */
const sections = [
  { id: 'overview',          label: 'Overview' },
  { id: 'dashboard',         label: 'Dashboard' },
  { id: 'new-project',       label: 'New Project' },
  { id: 'projects',          label: 'Projects' },
  { id: 'project-detail',    label: 'Project Detail' },
  { id: 'planning',          label: 'Planning' },
  { id: 'session',           label: 'Claude Session' },
  { id: 'audits',            label: 'Audits' },
  { id: 'discover',          label: 'Discover' },
  { id: 'settings',          label: 'Settings' },
  { id: 'testing-standard',  label: 'Testing Standard' },
  { id: 'reference',         label: 'Reference' },
];

/* ── Small reusable pieces ────────────────────────────────────────── */
function SectionHeading({ id, icon: Icon, title, subtitle }: {
  id: string; icon: React.ElementType; title: string; subtitle: string;
}) {
  return (
    <div id={id} className="flex items-start gap-3 mb-4 scroll-mt-4">
      <div className="w-7 h-7 rounded bg-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={13} className="text-violet-400" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-slate-100 tracking-tight">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-lg p-4 ${className}`}>
      {children}
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
      {children}
    </p>
  );
}

function FeatureRow({ icon: Icon, label, desc, iconColor = 'text-violet-400' }: {
  icon: React.ElementType; label: string; desc: string; iconColor?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border-subtle last:border-0">
      <Icon size={13} className={`${iconColor} mt-0.5 shrink-0`} />
      <div>
        <span className="text-xs font-medium text-slate-200">{label}</span>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
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
    <div className="flex items-start gap-3 py-2 border-b border-border-subtle last:border-0">
      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${color}`} />
      <div>
        <span className="text-xs font-medium text-slate-200">{label}</span>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
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
    <div className="flex-1 flex overflow-hidden">
      {/* ── Left TOC ───────────────────────── */}
      <nav className="w-44 shrink-0 border-r border-border overflow-y-auto flex flex-col">
        <div className="px-3 py-3 border-b border-border">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
            Contents
          </p>
        </div>
        <div className="py-1">
          {sections.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-default border-l-2 ${
                activeSection === id
                  ? 'bg-hover text-slate-100 font-medium border-l-2 border-violet-500'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-hover border-transparent'
              }`}
            >
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
            <div className="w-8 h-8 rounded bg-violet-500/20 flex items-center justify-center shrink-0">
              <BookOpen size={15} className="text-violet-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-100 tracking-tight">User Manual</h1>
              <p className="text-xs text-slate-500 mt-0.5">Complete guide to Launchpad</p>
            </div>
          </div>

          {/* ─── Overview ─────────────────── */}
          <section className="mb-8">
            <SectionHeading
              id="overview"
              icon={HelpCircle}
              title="Overview"
              subtitle="What Launchpad is and how to use it"
            />
            <Card>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                <strong className="text-slate-100">Launchpad</strong> is a local-only macOS desktop app
                for tracking your AI-assisted vibe-coding projects. All data is stored in a SQLite database on
                your Mac — no accounts, no cloud sync, no internet required.
              </p>
              <SubHeading>Key capabilities</SubHeading>
              <div className="space-y-0">
                <FeatureRow icon={FolderKanban} label="Project registry" desc="Keep a catalogue of all your coding projects with status, phase, priority, and health tracking." />
                <FeatureRow icon={Activity} label="Git scanning" desc="Scan linked repos for recent commits, dirty state, and activity to auto-update health scores." iconColor="text-cyan-400" />
                <FeatureRow icon={Sparkles} label="AI planning" desc="Generate structured plans with phases, tasks, risks, and assumptions via Claude." iconColor="text-amber-400" />
                <FeatureRow icon={FileText} label="Project documents" desc="Auto-scaffold 8 living docs per project (brief, architecture, decisions log, etc.)." iconColor="text-slate-400" />
                <FeatureRow icon={Download} label="Portability" desc="Export/import all project metadata as JSON for backup or machine migration." iconColor="text-green-400" />
              </div>
            </Card>
          </section>

          {/* ─── Dashboard ────────────────── */}
          <section className="mb-8">
            <SectionHeading
              id="dashboard"
              icon={LayoutDashboard}
              title="Projects"
              subtitle="Your home screen — stats, full filter toolbar, and project list"
            />
            <Card className="mb-3">
              <SubHeading>Stats strip</SubHeading>
              <div className="space-y-0">
                <FeatureRow icon={BarChart3} label="Total / Active" desc="Count of all projects and those currently in-progress. Click to filter the list to that subset." iconColor="text-cyan-400" />
                <FeatureRow icon={AlertTriangle} label="Stale" desc="Projects with a repo path but no scan in the last 7 days and not marked done. Click to filter." iconColor="text-amber-400" />
                <FeatureRow icon={GitBranch} label="Dirty repos" desc="Projects whose repo has uncommitted changes on the last scan. Click to filter." iconColor="text-orange-400" />
              </div>
            </Card>
            <Card className="mb-3">
              <SubHeading>Filter toolbar</SubHeading>
              <div className="space-y-0">
                <FeatureRow icon={CheckCircle2} label="Status pills" desc="All / Active / Paused / Done / Idea — click to filter by status. Count badge updates live." iconColor="text-green-400" />
                <FeatureRow icon={Activity} label="Search" desc="Filters by project name and description in real time as you type." iconColor="text-slate-400" />
                <FeatureRow icon={CheckCircle2} label="Phase / Priority dropdowns" desc="Filter the list to a specific phase (Planning, Core Build, etc.) or priority level." iconColor="text-slate-400" />
                <FeatureRow icon={GitBranch} label="Dirty / Stale toggles" desc="Quick filters to show only repos with uncommitted changes or projects that haven't been scanned recently." iconColor="text-orange-400" />
                <FeatureRow icon={BarChart3} label="Sort" desc="Sort by name, last updated, status, or priority." iconColor="text-slate-400" />
                <FeatureRow icon={Activity} label="List / Grid toggle" desc="Switch between a compact row view and a card grid layout." iconColor="text-slate-400" />
              </div>
            </Card>
            <Card>
              <SubHeading>Actions</SubHeading>
              <p className="text-xs text-slate-500 mb-2">
                <strong className="text-slate-300">Scan All</strong> runs a git scan on every project with a linked repo.
                The <strong className="text-slate-300">New</strong> button (brain icon, top right) opens the New Project Wizard.
              </p>
              <p className="text-xs text-slate-500">
                Click any project row or card to open the full Project Detail view.
              </p>
            </Card>
          </section>

          {/* ─── New Project Wizard ───────── */}
          <section className="mb-8">
            <SectionHeading
              id="new-project"
              icon={Wand2}
              title="New Project Wizard"
              subtitle="Two modes: build a full scaffold from scratch, or track an existing project"
            />
            <Card className="mb-3">
              <p className="text-xs text-slate-500 mb-3">
                Click the <strong className="text-slate-300">New</strong> button (brain icon, top right of Projects)
                to open the wizard. The first screen asks which mode you want:
              </p>
              <div className="space-y-0 mb-3">
                <FeatureRow
                  icon={Hammer}
                  label="Build from scratch"
                  desc="Scaffold a complete Next.js 15 + Supabase project, write all planning docs and Claude skills, set up git, and optionally create GitHub / Vercel / Supabase — all in one action."
                  iconColor="text-violet-400"
                />
                <FeatureRow
                  icon={FolderOpen}
                  label="Track existing project"
                  desc="Import a repo you're already working on. Creates the project record, generates planning docs, and optionally adds Claude skills to the folder on disk."
                  iconColor="text-slate-400"
                />
              </div>
              <p className="text-xs text-slate-500">
                The <strong className="text-slate-300">Default projects directory</strong> must be set in
                Settings → Integrations &amp; Scaffold before using Build from scratch.
              </p>
            </Card>

            <Card className="mb-3">
              <SubHeading>Build from scratch — 2 steps</SubHeading>
              <div className="space-y-0 mb-3">
                <FeatureRow icon={CheckCircle2} label="1. About" desc="Project name (required), short description, and main goal. The goal is used to pre-populate planning docs." iconColor="text-green-400" />
                <FeatureRow icon={CheckCircle2} label="2. Cloud" desc="Choose whether to generate Claude skills, and which cloud services to set up: GitHub repo (requires gh CLI), Vercel project, and Supabase project." iconColor="text-violet-400" />
              </div>
              <p className="text-xs text-slate-500 mb-2">
                Click <strong className="text-slate-300">Scaffold &amp; create</strong> to start. A progress panel tracks
                each step as it runs — files, docs, skills, git, cloud services, and database record. Everything
                is committed in a single initial git commit so your repo starts clean.
              </p>
              <p className="text-xs text-slate-500">
                When complete, click <strong className="text-slate-300">Open Project →</strong> to go straight
                to the project detail view.
              </p>
            </Card>

            <Card className="mb-3">
              <SubHeading>Track existing — 3 steps</SubHeading>
              <div className="space-y-0">
                <FeatureRow icon={CheckCircle2} label="1. About" desc="Project name, description, project type, and main goal." iconColor="text-green-400" />
                <FeatureRow icon={CheckCircle2} label="2. Setup" desc="Starter template, stack add-ons, and key constraints (used to populate docs)." iconColor="text-blue-400" />
                <FeatureRow icon={CheckCircle2} label="3. Options" desc="Coding style, UI style, and whether to initialise a git repo and generate Claude skills." iconColor="text-violet-400" />
              </div>
            </Card>

            <Card className="mb-3">
              <SubHeading>Generated markdown docs — 11 files</SubHeading>
              <p className="text-xs text-slate-500 mb-3">
                Both modes generate the same set of planning docs, pre-populated with your project details.
                They are living documents — keep them updated as the project evolves.
              </p>
              <div className="grid grid-cols-1 gap-0">
                {[
                  ['CLAUDE.md',                         'Claude Code context, stack, working preferences, and testing standard'],
                  ['PROJECT_BRIEF.md',                  'One-page overview — goal, audience, scope, success criteria'],
                  ['PRODUCT_REQUIREMENTS.md',           'Functional requirements, user flows, and acceptance criteria'],
                  ['TECHNICAL_SPEC.md',                 'Architecture, components, data model, and API contracts'],
                  ['TASKS.md',                          'Phase-based task list — keep current throughout development'],
                  ['DECISION_LOG.md',                   'Key decisions with context, options considered, and rationale'],
                  ['SESSION_LOG.md',                    'Brief notes from each working session'],
                  ['RISKS_ASSUMPTIONS_DEPENDENCIES.md', 'Known risks, assumptions, and add-on dependencies'],
                  ['PROJECT_STAGE.md',                  'Stage reference table — track current phase of the project'],
                  ['PROJECT_START_PROMPT.md',           'Starter prompt to give Claude at the top of a new session'],
                  ['README.md',                         'Public-facing intro with stack info and setup instructions'],
                ].map(([name, desc]) => (
                  <div key={name} className="flex items-start gap-2.5 py-1.5 border-b border-border-subtle last:border-0">
                    <FileText size={11} className="text-slate-600 shrink-0 mt-0.5" />
                    <div>
                      <code className="text-[11px] font-mono text-slate-300">{name}</code>
                      <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <SubHeading>Claude skills — 4 files in .claude/skills/</SubHeading>
              <p className="text-xs text-slate-500 mb-3">
                Skill files are plain markdown. Claude Code reads them when you invoke the skill by name.
                Generated when <strong className="text-slate-300">Generate Claude skills</strong> is enabled.
              </p>
              <div className="space-y-0">
                <FeatureRow icon={Bot}          label="project-kickoff"    desc="Read project docs and propose a scoped task plan before writing any code." iconColor="text-violet-400" />
                <FeatureRow icon={ClipboardList} label="feature-chunking"  desc="Explore first, break into reviewable chunks, implement one at a time, report testing honestly." iconColor="text-slate-400" />
                <FeatureRow icon={Wrench}       label="ui-readability"     desc="Readability, contrast, and visual warmth checklist for UI work." iconColor="text-blue-400" />
                <FeatureRow icon={FlaskConical} label="testing-discipline" desc="Honest testing reporting — distinguishes build checks, manual testing, and automated tests." iconColor="text-green-400" />
              </div>
            </Card>
          </section>

          {/* ─── Projects ─────────────────── */}
          <section className="mb-8">
            <SectionHeading
              id="projects"
              icon={FolderKanban}
              title="Managing Projects"
              subtitle="Editing, deleting, and maintaining project metadata"
            />
            <Card className="mb-3">
              <SubHeading>Editing a project</SubHeading>
              <p className="text-xs text-slate-500 mb-2">
                Open a project then click the <strong className="text-slate-300">Edit</strong> button (pencil icon)
                in the detail header to update name, description, local repo path, status, phase, priority,
                AI tool, startup command, and Claude settings.
              </p>
              <p className="text-xs text-slate-500">
                If the repo folder was moved to a different location, use the{' '}
                <strong className="text-slate-300">Relink Repo Path</strong> button (link icon) to update
                just the path without touching any other metadata.
              </p>
            </Card>
            <Card>
              <SubHeading>Deleting a project</SubHeading>
              <p className="text-xs text-slate-500">
                Use the trash icon in the project detail header. You'll be asked to confirm.
                Deletion is permanent and removes all associated scans, documents, plan phases/tasks, and session data.
                It does <strong className="text-slate-300">not</strong> delete any files on disk.
              </p>
            </Card>
          </section>

          {/* ─── Project Detail ───────────── */}
          <section className="mb-8">
            <SectionHeading
              id="project-detail"
              icon={Activity}
              title="Project Detail"
              subtitle="Five-tab deep-dive into a single project"
            />
            <Card className="mb-3">
              <SubHeading>Overview tab — actions</SubHeading>
              <div className="space-y-0">
                <FeatureRow icon={RefreshCw} label="Scan" desc="Runs a git scan on the linked repo to capture commit history, dirty state, and branch name." iconColor="text-cyan-400" />
                <FeatureRow icon={FolderOpen} label="Open in Finder" desc="Opens the repo directory in Finder." iconColor="text-slate-400" />
                <FeatureRow icon={Code2} label="Open in Editor" desc="Opens the repo in your installed editor — tries VS Code, Cursor, Windsurf, Zed, BBEdit, and Sublime Text." iconColor="text-blue-400" />
                <FeatureRow icon={Terminal} label="Open in Terminal / iTerm" desc="Opens a terminal session in the repo folder. Uses iTerm if available." iconColor="text-green-400" />
                <FeatureRow icon={Bot} label="Run Claude here" desc="Opens Claude Code in the terminal at the repo folder." iconColor="text-violet-400" />
                <FeatureRow icon={Sparkles} label="Claude + Bootstrap" desc="Launches Claude in the terminal and pre-loads a project-context prompt." iconColor="text-amber-400" />
                <FeatureRow icon={ClipboardList} label="Copy Bootstrap Prompt" desc="Copies the bootstrap prompt to clipboard so you can paste it into any AI." iconColor="text-slate-400" />
              </div>
            </Card>
            <Card className="mb-3">
              <SubHeading>Notes &amp; relinking</SubHeading>
              <p className="text-xs text-slate-500 mb-2">
                The <strong className="text-slate-300">Notes</strong> field on the Overview tab is free-form
                text. Click to enter edit mode, then <KeyChip>Save</KeyChip> or press{' '}
                <KeyChip>Esc</KeyChip> to cancel.
              </p>
              <p className="text-xs text-slate-500">
                If the project was imported from another Mac (or the folder moved), use{' '}
                <strong className="text-slate-300">Relink Repo Path</strong> (link icon) to update the
                local path without touching any other metadata.
              </p>
            </Card>
            <Card>
              <SubHeading>Scan history</SubHeading>
              <p className="text-xs text-slate-500">
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
              <p className="text-xs text-slate-500 mb-3">
                Every project is auto-scaffolded with 9 living documents when it is created:
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0 text-xs text-slate-400 mb-3">
                {[
                  'Project Brief', 'Product Requirements', 'Technical Specification',
                  'AI Instructions', 'Risks / Assumptions', 'Decision Log',
                  'Session Handoff', 'Scratchpad', 'Operating Standard',
                ].map(d => (
                  <div key={d} className="flex items-center gap-1.5 py-1 border-b border-border-subtle">
                    <FileText size={11} className="text-slate-600 shrink-0" />
                    <span>{d}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Click any document to open and edit it in the editor pane.
                Mark a doc status as <strong className="text-slate-300">Final</strong> when it's complete.
              </p>
            </Card>
            <Card className="mb-3">
              <SubHeading>Generating a plan</SubHeading>
              <p className="text-xs text-slate-500 mb-3">
                On the <strong className="text-slate-300">Plan tab</strong>, click{' '}
                <strong className="text-slate-300">Generate Plan</strong>. The modal assembles a
                prompt from your project details and methodology blocks, then gives you two options:
              </p>
              <div className="space-y-0 mb-3">
                <FeatureRow
                  icon={Bot}
                  label="Run with Claude CLI"
                  desc="Pipes the prompt directly to `claude --print` and imports the response automatically — no copy-paste required. Takes ~15–30 seconds. Requires Claude Code CLI to be installed."
                  iconColor="text-violet-400"
                />
                <FeatureRow
                  icon={ClipboardList}
                  label="Paste manually"
                  desc="Copy the prompt, send it to any LLM, then paste the response back in. Use this if Claude CLI isn't available or you want to use a different model."
                  iconColor="text-slate-400"
                />
              </div>
              <p className="text-xs text-slate-500">
                Re-importing a plan only replaces phases/tasks you haven't manually edited
                (<strong className="text-slate-300">user_modified</strong> flag is respected).
              </p>
            </Card>
            <Card>
              <SubHeading>Plan tab — phases &amp; tasks</SubHeading>
              <div className="space-y-0">
                <FeatureRow icon={ClipboardList} label="Phases" desc="Top-level milestones. Each phase has an ordered list of tasks. Mark phases done when all tasks complete." iconColor="text-violet-400" />
                <FeatureRow icon={CheckCircle2} label="Tasks" desc="Click the status icon to cycle: pending → in-progress → paused → done → pending. Blocked tasks go directly back to in-progress when clicked." iconColor="text-green-400" />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                When a task is in-progress or paused, a <strong className="text-slate-300">progress note</strong> field
                appears automatically — jot down where you left off. Notes are saved on blur.
              </p>
              <div className="mt-3 pt-1">
                <SubHeading>Risks tab</SubHeading>
                <div className="space-y-0">
                  <FeatureRow icon={ShieldAlert} label="Risks" desc="Identified risks with likelihood and impact levels (low / medium / high / critical)." iconColor="text-red-400" />
                  <FeatureRow icon={AlertTriangle} label="Assumptions" desc="Captured assumptions from the plan response. Review and validate as the project progresses." iconColor="text-amber-400" />
                </div>
              </div>
            </Card>
          </section>

          {/* ─── Claude Session ───────────── */}
          <section className="mb-8">
            <SectionHeading
              id="session"
              icon={MessageSquare}
              title="Claude Session"
              subtitle="Persistent AI conversation tied to a project"
            />
            <Card className="mb-3">
              <p className="text-xs text-slate-500 mb-3">
                The <strong className="text-slate-300">Session tab</strong> (5th tab in Project Detail) lets you
                run a persistent Claude conversation scoped to the project. Sessions are stored in the database
                and can be resumed across app launches.
              </p>
              <div className="space-y-0">
                <FeatureRow
                  icon={Sparkles}
                  label="Opener prompt"
                  desc="The first message is auto-assembled from your project metadata, active tasks, and upcoming work — giving Claude full context before you type anything."
                  iconColor="text-amber-400"
                />
                <FeatureRow
                  icon={MessageSquare}
                  label="Send messages"
                  desc="Type follow-up messages and they are sent via `claude --resume` to continue the same session thread."
                  iconColor="text-violet-400"
                />
                <FeatureRow
                  icon={RefreshCw}
                  label="New Session"
                  desc="Click New Session to clear the session ID and start fresh. The previous conversation is no longer accessible."
                  iconColor="text-slate-400"
                />
              </div>
            </Card>
            <Card>
              <SubHeading>Requirements</SubHeading>
              <p className="text-xs text-slate-500">
                Claude Code CLI must be installed and accessible in your PATH.
                Install it from <code className="bg-surface border border-border rounded px-1 py-0.5 font-mono">claude.ai/code</code>{' '}
                and verify with <code className="bg-surface border border-border rounded px-1 py-0.5 font-mono">claude --version</code> in a terminal.
                The project must also have a valid local repo path set.
              </p>
            </Card>
          </section>

          {/* ─── Audits ───────────────────── */}
          <section className="mb-8">
            <SectionHeading
              id="audits"
              icon={Search}
              title="Audits"
              subtitle="AI-powered codebase reviews: security, performance, and reliability"
            />
            <Card className="mb-3">
              <p className="text-xs text-slate-500 mb-3">
                The <strong className="text-slate-300">Audits tab</strong> (4th tab in Project Detail) runs
                structured AI reviews of your codebase and stores the findings. Audits are scoped to a project
                and do not require a git scan.
              </p>
              <SubHeading>Audit kinds</SubHeading>
              <div className="space-y-0">
                <FeatureRow icon={Search}       label="Full codebase"  desc="A broad review covering overall code quality, structure, and maintainability." iconColor="text-slate-400" />
                <FeatureRow icon={ShieldAlert}  label="Security"       desc="Identifies vulnerabilities, unsafe patterns, and exposure risks." iconColor="text-red-400" />
                <FeatureRow icon={Activity}     label="Performance"    desc="Surfaces slow paths, inefficient queries, and unnecessary re-renders." iconColor="text-cyan-400" />
                <FeatureRow icon={AlertTriangle} label="Reliability"   desc="Flags error handling gaps, race conditions, and fragile dependencies." iconColor="text-amber-400" />
              </div>
            </Card>
            <Card className="mb-3">
              <SubHeading>Depth options</SubHeading>
              <div className="space-y-0">
                <FeatureRow icon={CheckCircle2} label="Quick" desc="Faster, higher-level scan — good for a regular health check between features." iconColor="text-slate-400" />
                <FeatureRow icon={Search}       label="Full"  desc="Deeper analysis — best before a release or when investigating a specific problem area." iconColor="text-violet-400" />
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Click <strong className="text-slate-300">Run Audit ↓</strong> and select a kind + depth from
                the dropdown. The audit runs via <code className="bg-surface border border-border rounded px-1 py-0.5 font-mono text-[11px]">claude --print</code> and
                results are imported automatically. Requires Claude Code CLI in your PATH.
              </p>
            </Card>
            <Card>
              <SubHeading>Findings &amp; actions</SubHeading>
              <p className="text-xs text-slate-500 mb-3">
                Each audit produces a list of findings. Click a finding to expand its full description,
                file reference, and suggested fix.
              </p>
              <div className="space-y-0">
                <FeatureRow icon={Circle}       label="Open"         desc="Finding has not been addressed yet." iconColor="text-slate-500" />
                <FeatureRow icon={CheckCircle2} label="Resolved"     desc="Fixed — mark when the underlying issue has been addressed." iconColor="text-green-400" />
                <FeatureRow icon={XCircle}      label="Won't fix"    desc="Acknowledged but intentionally not addressed." iconColor="text-slate-500" />
                <FeatureRow icon={ClipboardList} label="Task created" desc="A project task was generated from this finding and linked to the plan." iconColor="text-violet-400" />
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Use <strong className="text-slate-300">Create task →</strong> on any finding to add it
                directly to the project plan as a task. The finding status updates to{' '}
                <strong className="text-slate-300">Task created</strong> automatically.
              </p>
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
              <p className="text-xs text-slate-500 mb-3">
                The Discover page lets you point Launchpad at a root folder (e.g.{' '}
                <code className="bg-surface border border-border rounded px-1 py-0.5 font-mono">~/Projects</code>)
                and find all git repositories beneath it.
              </p>
              <div className="space-y-0">
                <FeatureRow icon={FolderSearch} label="Scan directory" desc="Enter a path and click Scan. Results list all .git folders found, one level deep by default." iconColor="text-slate-400" />
                <FeatureRow icon={Plus} label="Add to tracker" desc="Select repos and click Import. New project entries are pre-filled with the path and name." iconColor="text-green-400" />
                <FeatureRow icon={CheckCircle2} label="Already tracked" desc="Repos that are already in Launchpad are shown as tracked and can't be added twice." iconColor="text-slate-500" />
              </div>
            </Card>
          </section>

          {/* ─── Settings ─────────────────── */}
          <section className="mb-8">
            <SectionHeading
              id="settings"
              icon={Settings}
              title="Settings"
              subtitle="Appearance, integrations, and data portability"
            />
            <Card className="mb-3">
              <SubHeading>Appearance</SubHeading>
              <div className="space-y-0">
                <FeatureRow icon={Settings} label="Theme" desc="Toggle between Dark and Light mode. Your choice is saved and restored on next launch." iconColor="text-violet-400" />
                <FeatureRow icon={Settings} label="Zoom" desc="Scale the entire UI to 90%, 100%, 115%, or 130%. Useful for high-DPI displays or personal preference." iconColor="text-slate-400" />
              </div>
            </Card>
            <Card className="mb-3">
              <SubHeading>Integrations &amp; Scaffold</SubHeading>
              <div className="space-y-0">
                <FeatureRow icon={FolderOpen} label="Default projects directory" desc="Where new scaffolded projects are created (e.g. ~/Projects). Required before using scaffold from scratch." iconColor="text-slate-400" />
                <FeatureRow icon={GitBranch} label="GitHub (gh CLI)" desc="Shows whether the gh CLI is installed and authenticated. Install with `brew install gh` and run `gh auth login`." iconColor="text-cyan-400" />
                <FeatureRow icon={Wrench} label="Vercel access token" desc="Enables automatic Vercel project creation during scaffold. Get your token from vercel.com/account/tokens." iconColor="text-slate-400" />
                <FeatureRow icon={Wrench} label="Supabase access token + org ID" desc="Enables automatic Supabase project provisioning during scaffold. Find both at supabase.com/dashboard." iconColor="text-slate-400" />
              </div>
            </Card>
            <Card>
              <SubHeading>Export JSON</SubHeading>
              <p className="text-xs text-slate-500 mb-3">
                Downloads a <code className="bg-surface border border-border rounded px-1 py-0.5 font-mono">.json</code> file
                containing all projects, documents, plan data, scans, and settings. Use this for:
              </p>
              <ul className="text-xs text-slate-500 space-y-1 mb-4 list-none pl-0">
                {[
                  'Regular backups of your project registry',
                  'Migrating to a new Mac',
                  'Sharing a project catalogue with a team member',
                ].map(t => (
                  <li key={t} className="flex items-start gap-2">
                    <Download size={11} className="text-violet-400 mt-0.5 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
              <SubHeading>Import JSON</SubHeading>
              <p className="text-xs text-slate-500 mb-3">
                Select a previously exported file. Projects are imported without overwriting existing ones
                (matched by name). Local repo paths are preserved in the data but are machine-specific —
                use <strong className="text-slate-300">Relink Repo Path</strong> on each project after importing
                to restore git scanning.
              </p>
              <SubHeading>Storage location</SubHeading>
              <p className="text-xs text-slate-600 font-mono bg-surface border border-border rounded px-3 py-2">
                ~/Library/Application Support/com.glen.launchpad/projects.db
              </p>
            </Card>
            <Card className="mt-3">
              <SubHeading>Feedback</SubHeading>
              <FeatureRow
                icon={MessageSquarePlus}
                label="Send feedback"
                desc="The message icon in the bottom-left of the sidebar is always available. Click it to open a feedback form — choose a type (Bug report, Feature request, or General feedback), add a description, and click Open GitHub issue. Your browser will open a pre-filled GitHub issue ready to submit."
                iconColor="text-violet-400"
              />
            </Card>
          </section>

          {/* ─── Testing Standard ─────────── */}
          <section className="mb-8">
            <SectionHeading
              id="testing-standard"
              icon={FlaskConical}
              title="Testing Standard"
              subtitle="How to test and report testing honestly at every stage of development"
            />
            <Card className="mb-3">
              <p className="text-xs text-slate-500 mb-3">
                Launchpad enforces a clear distinction between three types of verification.
                This standard is built into the <code className="bg-surface border border-border rounded px-1 py-0.5 font-mono text-[11px]">CLAUDE.md</code> of
                every new project and into the <strong className="text-slate-300">testing-discipline</strong> skill.
                The core rule is simple: <strong className="text-slate-300">build passing is not the same as tested.</strong>
              </p>
              <SubHeading>Three testing categories</SubHeading>
              <div className="space-y-0">
                <FeatureRow
                  icon={CheckCircle2}
                  label="Build / type checks"
                  desc="Running npm run build, cargo build, tsc, or a linter. These confirm code compiles — they do not prove that features work correctly."
                  iconColor="text-slate-400"
                />
                <FeatureRow
                  icon={Activity}
                  label="Manual functional testing"
                  desc="Actually launching the app and verifying behaviour: opening the feature, checking validation, loading states, success and error outcomes, disabled controls, and light/dark mode readability."
                  iconColor="text-blue-400"
                />
                <FeatureRow
                  icon={CheckCircle2}
                  label="Automated tests"
                  desc="Repeatable checks for pure functions and deterministic logic. Added where the test runner supports it — not forced where the overhead is not justified."
                  iconColor="text-green-400"
                />
              </div>
            </Card>
            <Card className="mb-3">
              <SubHeading>Required reporting format</SubHeading>
              <p className="text-xs text-slate-500 mb-2">
                Every implementation summary should include a <strong className="text-slate-300">Testing performed</strong> section structured like this:
              </p>
              <div className="bg-surface border border-border rounded-md px-3 py-2.5 font-mono text-[11px] text-slate-400 leading-relaxed whitespace-pre-wrap">
                <span className="text-slate-300">Testing performed</span><br />
                - Build/type checks:<br />
                {'    '}- [exact commands run]<br />
                - Manual testing:<br />
                {'    '}- [exact behaviours verified]<br />
                - Automated tests:<br />
                {'    '}- [tests added or run, or "none"]<br />
                - Limitations:<br />
                {'    '}- [what was not tested]
              </div>
            </Card>
            <Card>
              <SubHeading>Honesty rules</SubHeading>
              <div className="space-y-0">
                <FeatureRow icon={XCircle}      label="Never say 'tested' without specifics"                desc="Always name the kind of testing and what was verified. 'Tested and working' is not acceptable." iconColor="text-red-400" />
                <FeatureRow icon={XCircle}      label="Don't claim manual testing unless the app was launched" desc="If the feature was not exercised in a running app, say so explicitly." iconColor="text-red-400" />
                <FeatureRow icon={CheckCircle2} label="State clearly when automated tests don't exist"      desc="'None — no test runner configured for this layer' is the right answer, not silence." iconColor="text-green-400" />
                <FeatureRow icon={CheckCircle2} label="Prefer automated tests for pure functions first"     desc="Deterministic helpers and pure logic are the cheapest, most reliable place to add automated coverage." iconColor="text-green-400" />
              </div>
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
              <div className="grid grid-cols-2 gap-x-4 text-xs text-slate-500">
                {[
                  ['Discovery', 'Research and requirements gathering'],
                  ['Planning', 'Architecture and task breakdown'],
                  ['Development', 'Active implementation'],
                  ['Testing', 'QA, bug fixing, and validation'],
                  ['Deployment', 'Releasing and monitoring'],
                  ['Maintenance', 'Ongoing improvements'],
                ].map(([name, desc]) => (
                  <div key={name} className="py-1.5 border-b border-border-subtle">
                    <span className="text-slate-300 font-medium">{name}</span>
                    <p className="text-slate-600 mt-0.5">{desc}</p>
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
              <p className="text-xs text-slate-500 mb-3">
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
