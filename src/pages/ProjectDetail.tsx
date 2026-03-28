import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Edit2, Trash2, RefreshCw, FolderOpen, Code2,
  AlertCircle, CheckCircle2, PauseCircle, GitBranch, Link2,
  Loader2, Terminal, Sparkles, X, Copy,
} from 'lucide-react';
import type { Project, ProjectScan } from '../lib/types';
import {
  getProject, getProjectScans, scanProject, updateProject,
  updateProjectStatus, deleteProject, openFolder, openInVscode,
  relinkRepoPath, validateRepoPath,
  openInTerminal, openInIterm, runClaudeBootstrap,
  copyBootstrapPrompt,
  runGitStatus, isItermAvailable,
} from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { PhaseBadge } from '../components/PhaseBadge';
import { PriorityDot } from '../components/PriorityDot';
import { HealthDot } from '../components/HealthDot';
import { GitBadge } from '../components/GitBadge';
import { AI_TOOL_LABELS, PHASE_LABELS } from '../lib/types';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { SectionLabel } from '../components/ui/SectionLabel';
import { relativeTime, shortHash } from '../lib/utils';
import { computeHealth } from '../lib/health';
import { PlanningDocs } from '../components/planning/PlanningDocs';
import { GeneratePlanModal } from '../components/planning/GeneratePlanModal';
import { PhasesView } from '../components/planning/PhasesView';
import { RisksView } from '../components/planning/RisksView';
import { ClaudeSessionView } from '../components/ClaudeSessionView';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'docs',     label: 'Docs' },
  { key: 'plan',     label: 'Tasks' },
  { key: 'risks',    label: 'Risks' },
  { key: 'session',  label: 'Session' },
] as const;

type Tab = typeof TABS[number]['key'];

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = Number(id);

  const [project, setProject] = useState<Project | null>(null);
  const [scans, setScans] = useState<ProjectScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showRelink, setShowRelink] = useState(false);
  const [relinkPath, setRelinkPath] = useState('');
  const [relinkValidating, setRelinkValidating] = useState(false);
  const [relinkValid, setRelinkValid] = useState<boolean | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['overview']));
  const [planVersion, setPlanVersion] = useState(0);
  const [showGeneratePlan, setShowGeneratePlan] = useState(false);

  const [itermAvailable, setItermAvailable] = useState(false);
  const [gitStatusOutput, setGitStatusOutput] = useState<string | null>(null);
  const [gitStatusLoading, setGitStatusLoading] = useState(false);

  const [editingClaudeSetup, setEditingClaudeSetup] = useState(false);
  const [claudeSetupDraft, setClaudeSetupDraft] = useState({
    startup_command: '',
    preferred_terminal: '',
    claude_prompt_mode: 'append' as 'append' | 'replace',
    claude_priority_files: '',
    claude_startup_prompt: '',
    session_handoff_notes: '',
  });
  const [savingClaudeSetup, setSavingClaudeSetup] = useState(false);

  function handleSwitchTab(tab: Tab) {
    setActiveTab(tab);
    setVisitedTabs(prev => new Set([...prev, tab]));
    if (tab === 'plan') setPlanVersion(v => v + 1);
  }

  function handlePlanImported() {
    setPlanVersion(v => v + 1);
    handleSwitchTab('plan');
  }

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [p, s] = await Promise.all([
        getProject(projectId),
        getProjectScans(projectId, 5),
      ]);
      setProject(p);
      setScans(s);
      setNotesValue(p.notes);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { isItermAvailable().then(setItermAvailable).catch(() => {}); }, []);

  async function handleScan() {
    if (!project) return;
    try {
      setScanning(true);
      setActionError(null);
      const scan = await scanProject(projectId);
      setScans((prev) => [scan, ...prev].slice(0, 5));
      setProject((p) => p ? { ...p, last_scanned_at: new Date().toISOString() } : p);
    } catch (e) {
      setActionError(String(e));
    } finally {
      setScanning(false);
    }
  }

  async function handleStatusChange(status: string) {
    if (!project) return;
    try {
      setActionError(null);
      const updated = await updateProjectStatus(projectId, status);
      setProject(updated);
    } catch (e) { setActionError(String(e)); }
  }

  async function handleDelete() {
    if (!project) return;
    try {
      setDeleting(true);
      await deleteProject(projectId);
      navigate('/');
    } catch (e) {
      setActionError(String(e));
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  async function handleOpenFolder() {
    if (!project?.local_repo_path) return;
    try { await openFolder(project.local_repo_path); }
    catch (e) { setActionError(String(e)); }
  }

  async function handleOpenVscode() {
    if (!project?.local_repo_path) return;
    try { await openInVscode(project.local_repo_path); }
    catch (e) { setActionError(String(e)); }
  }

  async function handleOpenTerminal() {
    if (!project?.local_repo_path) return;
    try { await openInTerminal(project.local_repo_path); }
    catch (e) { setActionError(String(e)); }
  }

  async function handleOpenIterm() {
    if (!project?.local_repo_path) return;
    try { await openInIterm(project.local_repo_path); }
    catch (e) { setActionError(String(e)); }
  }

  async function handleClaudeBootstrap() {
    if (!project) return;
    try {
      const msg = await runClaudeBootstrap(projectId);
      setActionNotice(msg);
    } catch (e) { setActionError(String(e)); }
  }

  async function handleCopyBootstrap() {
    if (!project) return;
    try {
      const msg = await copyBootstrapPrompt(projectId);
      setActionNotice(msg);
    } catch (e) { setActionError(String(e)); }
  }

  function handleEnterClaudeEdit() {
    if (!project) return;
    setClaudeSetupDraft({
      startup_command: project.startup_command,
      preferred_terminal: project.preferred_terminal,
      claude_prompt_mode: project.claude_prompt_mode === 'replace' ? 'replace' : 'append',
      claude_priority_files: project.claude_priority_files,
      claude_startup_prompt: project.claude_startup_prompt,
      session_handoff_notes: project.session_handoff_notes,
    });
    setEditingClaudeSetup(true);
  }

  async function handleSaveClaudeSetup() {
    if (!project) return;
    try {
      setSavingClaudeSetup(true);
      const updated = await updateProject(projectId, { ...project, ...claudeSetupDraft });
      setProject(updated);
      setEditingClaudeSetup(false);
    } catch (e) {
      setActionError(String(e));
    } finally {
      setSavingClaudeSetup(false);
    }
  }

  async function handleGitStatus() {
    if (!project?.local_repo_path) return;
    try {
      setGitStatusLoading(true);
      setGitStatusOutput(null);
      const output = await runGitStatus(project.local_repo_path);
      setGitStatusOutput(output.trim() || '(working tree clean)');
    } catch (e) { setActionError(String(e)); }
    finally { setGitStatusLoading(false); }
  }

  async function handleSaveNotes() {
    if (!project) return;
    try {
      setSavingNotes(true);
      const updated = await updateProject(projectId, { ...project, notes: notesValue });
      setProject(updated);
      setEditingNotes(false);
    } catch (e) { setActionError(String(e)); }
    finally { setSavingNotes(false); }
  }

  async function handleRelink() {
    try {
      const updated = await relinkRepoPath(projectId, relinkPath);
      setProject(updated);
      setShowRelink(false);
      setRelinkPath('');
      setRelinkValid(null);
    } catch (e) { setActionError(String(e)); }
  }

  async function handleValidateRelink(path: string) {
    setRelinkPath(path);
    if (!path.trim()) { setRelinkValid(null); return; }
    setRelinkValidating(true);
    const ok = await validateRepoPath(path).catch(() => false);
    setRelinkValid(ok);
    setRelinkValidating(false);
  }

  const latestScan = scans[0] ?? null;
  const hasRepo = !!project?.local_repo_path?.trim();
  const repoMissing = hasRepo && latestScan && !latestScan.is_valid_repo;

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !project) return (
    <div className="flex-1 flex items-center justify-center px-5">
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm max-w-md w-full">
        {error ?? 'Project not found'}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sticky header */}
      <div className="shrink-0 bg-panel border-b border-border">
        {/* Title row */}
        <div className="flex items-center gap-3 px-5 py-3">
          <button
            onClick={() => navigate('/')}
            className="p-1 -ml-1 rounded text-slate-500 hover:text-slate-300 hover:bg-hover transition-colors cursor-default shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-slate-100 tracking-tight truncate">{project.name}</h1>
            {project.description && (
              <p className="text-xs text-slate-500 truncate mt-0.5">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setShowGeneratePlan(true)}
              className="text-violet-400 hover:bg-violet-500/10">
              <Sparkles size={12} /> Plan
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate(`/projects/${projectId}/edit`)}>
              <Edit2 size={12} /> Edit
            </Button>
            <Button variant="danger" size="icon" onClick={() => setShowDeleteConfirm(true)} title="Delete">
              <Trash2 size={13} />
            </Button>
          </div>
        </div>

        {/* Badges row */}
        <div className="px-5 pb-2.5 flex items-center gap-2 flex-wrap">
          <StatusBadge status={project.status} />
          <PhaseBadge phase={project.phase} />
          <PriorityDot priority={project.priority} />
          <HealthDot level={computeHealth(project, latestScan)} />
          <span className="text-[11px] text-slate-600 ml-1">{AI_TOOL_LABELS[project.ai_tool]}</span>
          <span className="text-[11px] text-slate-700 ml-auto">
            Updated {relativeTime(project.updated_at)}
          </span>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0 px-5 border-t border-border">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleSwitchTab(key)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px cursor-default ${
                activeTab === key
                  ? 'border-violet-500 text-slate-100'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-4 max-w-5xl mx-auto">
          {/* Inline alerts */}
          {actionError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs flex items-start gap-2">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <span className="flex-1">{actionError}</span>
              <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-200 cursor-default"><X size={12} /></button>
            </div>
          )}
          {actionNotice && (
            <div className="mb-4 p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg text-violet-300 text-xs flex items-start gap-2">
              <Sparkles size={12} className="mt-0.5 shrink-0" />
              <span className="flex-1">{actionNotice}</span>
              <button onClick={() => setActionNotice(null)} className="text-violet-400 hover:text-violet-200 cursor-default"><X size={12} /></button>
            </div>
          )}

          {/* Tab panels: mount on first visit, then CSS hide */}
          <div className={activeTab === 'docs' ? 'block' : 'hidden'}>
            {visitedTabs.has('docs') && (
              <PlanningDocs projectId={projectId} onNavigateToPlan={() => handleSwitchTab('plan')} />
            )}
          </div>
          <div className={activeTab === 'plan' ? 'block' : 'hidden'}>
            {visitedTabs.has('plan') && (
              <PhasesView projectId={projectId} planVersion={planVersion} isActive={activeTab === 'plan'} onGeneratePlan={() => setShowGeneratePlan(true)} />
            )}
          </div>
          <div className={activeTab === 'risks' ? 'block' : 'hidden'}>
            {visitedTabs.has('risks') && (
              <RisksView projectId={projectId} planVersion={planVersion} />
            )}
          </div>
          <div className={activeTab === 'session' ? 'block' : 'hidden'}>
            {visitedTabs.has('session') && (
              <ClaudeSessionView projectId={projectId} projectName={project.name} />
            )}
          </div>

          {/* Overview tab */}
          <div className={activeTab === 'overview' ? 'block' : 'hidden'}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left column */}
              <div className="lg:col-span-2 space-y-4">
                {/* Task info */}
                <InfoCard title="Tasks & Status">
                  <InfoRow label="Current task" value={project.current_task} />
                  <InfoRow label="Next task" value={project.next_task} />
                  {project.blocker && (
                    <InfoRow label="Blocker" value={project.blocker} valueClass="text-red-400" />
                  )}
                </InfoCard>

                {/* Git status */}
                <InfoCard
                  title="Git Status"
                  action={
                    <Button variant="ghost" size="sm" onClick={handleScan} disabled={scanning || !hasRepo}>
                      {scanning ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                      Scan
                    </Button>
                  }
                >
                  {!hasRepo ? (
                    <p className="text-xs text-slate-600 italic">No repository path configured.</p>
                  ) : repoMissing ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-red-400">
                        <AlertCircle size={12} />
                        Path not found — repo may have moved
                      </div>
                      <p className="text-xs text-slate-600 font-mono break-all">{project.local_repo_path}</p>
                      <button
                        onClick={() => { setShowRelink(true); setRelinkPath(project.local_repo_path); }}
                        className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors cursor-default"
                      >
                        <Link2 size={11} /> Relink repo path
                      </button>
                    </div>
                  ) : (
                    <GitBadge scan={latestScan} />
                  )}
                  {hasRepo && !repoMissing && (
                    <p className="text-[11px] text-slate-700 mt-2 font-mono break-all">{project.local_repo_path}</p>
                  )}
                  {project.last_scanned_at && (
                    <p className="text-[11px] text-slate-700 mt-1">
                      Scanned {relativeTime(project.last_scanned_at)}
                    </p>
                  )}
                </InfoCard>

                {/* Scan history */}
                {scans.length > 0 && (
                  <InfoCard title="Recent Scans">
                    <div className="space-y-0">
                      {scans.map((s, i) => (
                        <div key={s.id} className={`flex items-start justify-between gap-4 py-2 ${i < scans.length - 1 ? 'border-b border-border-subtle' : ''}`}>
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 text-xs">
                              {s.current_branch && (
                                <span className="flex items-center gap-1 text-slate-500">
                                  <GitBranch size={10} />
                                  {s.current_branch}
                                </span>
                              )}
                              <span className={s.is_dirty ? 'text-yellow-500' : 'text-green-400'}>
                                {s.is_dirty ? '● dirty' : '✓ clean'}
                              </span>
                              {!s.is_valid_repo && (
                                <span className="text-red-400 text-xs">{s.error_message}</span>
                              )}
                            </div>
                            {s.last_commit_hash && (
                              <p className="text-xs text-slate-600 truncate">
                                <span className="font-mono">{shortHash(s.last_commit_hash)}</span>
                                {' '}{s.last_commit_message}
                              </p>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-700 shrink-0">{relativeTime(s.scanned_at)}</span>
                        </div>
                      ))}
                    </div>
                  </InfoCard>
                )}
              </div>

              {/* Right column */}
              <div className="space-y-4">
                {/* Quick actions */}
                <InfoCard title="Actions">
                  <div className="space-y-0.5">
                    {hasRepo && (
                      <>
                        <ActionBtn icon={FolderOpen} label="Open in Finder" onClick={handleOpenFolder} />
                        <ActionBtn icon={Code2} label="Open in Editor" onClick={handleOpenVscode} />
                        <ActionBtn icon={Terminal} label="Open in Terminal" onClick={handleOpenTerminal} />
                        {itermAvailable && (
                          <ActionBtn icon={Terminal} label="Open in iTerm" onClick={handleOpenIterm}
                            cls="text-teal-400 hover:bg-teal-500/10" />
                        )}
                        <ActionBtn icon={Sparkles} label="Claude + Bootstrap" onClick={handleClaudeBootstrap}
                          cls="text-violet-300 hover:bg-violet-500/10" />
                        <ActionBtn icon={Copy} label="Copy Bootstrap Prompt" onClick={handleCopyBootstrap}
                          cls="text-violet-400 hover:bg-violet-500/10" />
                        <button
                          onClick={handleGitStatus}
                          disabled={gitStatusLoading}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded text-xs transition-colors text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-50 cursor-default"
                        >
                          {gitStatusLoading
                            ? <Loader2 size={13} className="shrink-0 animate-spin" />
                            : <GitBranch size={13} className="shrink-0" />}
                          Git Status
                        </button>
                      </>
                    )}
                    {project.status !== 'active' && (
                      <ActionBtn icon={CheckCircle2} label="Mark Active" onClick={() => handleStatusChange('active')}
                        cls="text-green-400 hover:bg-green-500/10" />
                    )}
                    {project.status !== 'blocked' && (
                      <ActionBtn icon={AlertCircle} label="Mark Blocked" onClick={() => handleStatusChange('blocked')}
                        cls="text-red-400 hover:bg-red-500/10" />
                    )}
                    {project.status !== 'paused' && (
                      <ActionBtn icon={PauseCircle} label="Mark Paused" onClick={() => handleStatusChange('paused')}
                        cls="text-yellow-400 hover:bg-yellow-500/10" />
                    )}
                    {project.status !== 'done' && (
                      <ActionBtn icon={CheckCircle2} label="Mark Done" onClick={() => handleStatusChange('done')}
                        cls="text-slate-400 hover:bg-slate-500/10" />
                    )}
                    {hasRepo && (
                      <ActionBtn icon={Link2} label="Relink Repo Path"
                        onClick={() => { setShowRelink(true); setRelinkPath(project.local_repo_path); }}
                        cls="text-violet-400 hover:bg-violet-500/10" />
                    )}
                  </div>
                  {gitStatusOutput !== null && (
                    <div className="mt-3 pt-3 border-t border-border-subtle">
                      <div className="flex items-center justify-between mb-1.5">
                        <SectionLabel>git status</SectionLabel>
                        <button onClick={() => setGitStatusOutput(null)} className="text-slate-600 hover:text-slate-400 cursor-default">
                          <X size={11} />
                        </button>
                      </div>
                      <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-all leading-relaxed bg-base rounded p-2.5 max-h-48 overflow-y-auto">
                        {gitStatusOutput}
                      </pre>
                    </div>
                  )}
                </InfoCard>

                {/* Info */}
                <InfoCard title="Info">
                  <InfoRow label="Phase" value={PHASE_LABELS[project.phase]} />
                  <InfoRow label="AI tool" value={AI_TOOL_LABELS[project.ai_tool]} />
                  <InfoRow label="Created" value={relativeTime(project.created_at)} />
                  <InfoRow label="ID" value={String(project.id)} valueClass="font-mono text-slate-600" />
                </InfoCard>

                {/* Notes */}
                <InfoCard
                  title="Notes"
                  action={
                    !editingNotes ? (
                      <button onClick={() => setEditingNotes(true)}
                        className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors cursor-default">
                        Edit
                      </button>
                    ) : null
                  }
                >
                  {editingNotes ? (
                    <div className="space-y-2">
                      <textarea
                        value={notesValue}
                        onChange={(e) => setNotesValue(e.target.value)}
                        rows={6}
                        className="w-full bg-base border border-border rounded px-3 py-2 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50 resize-none"
                        placeholder="Project notes…"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button variant="primary" size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
                          {savingNotes && <Loader2 size={11} className="animate-spin" />}
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setEditingNotes(false); setNotesValue(project.notes); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className={`text-xs leading-relaxed whitespace-pre-wrap select-text ${project.notes ? 'text-slate-300' : 'text-slate-600 italic'}`}>
                      {project.notes || 'No notes yet.'}
                    </p>
                  )}
                </InfoCard>

                {/* Claude Setup */}
                <InfoCard
                  title="Claude Setup"
                  action={
                    !editingClaudeSetup ? (
                      <button onClick={handleEnterClaudeEdit}
                        className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors cursor-default">
                        Edit
                      </button>
                    ) : null
                  }
                >
                  {editingClaudeSetup ? (
                    <div className="space-y-3">
                      <Field label="Startup command">
                        <input
                          type="text"
                          value={claudeSetupDraft.startup_command}
                          onChange={(e) => setClaudeSetupDraft((d) => ({ ...d, startup_command: e.target.value }))}
                          placeholder="claude"
                          className="w-full bg-base border border-border rounded px-2.5 py-1.5 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50 font-mono"
                        />
                      </Field>
                      <Field label="Preferred terminal">
                        <select
                          value={claudeSetupDraft.preferred_terminal}
                          onChange={(e) => setClaudeSetupDraft((d) => ({ ...d, preferred_terminal: e.target.value }))}
                          className="w-full bg-base border border-border rounded px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-violet-500/50 cursor-default"
                        >
                          <option value="">Auto (iTerm2 if available)</option>
                          <option value="iterm">iTerm2</option>
                          <option value="terminal">Terminal.app</option>
                        </select>
                      </Field>
                      <Field label="Prompt mode">
                        <select
                          value={claudeSetupDraft.claude_prompt_mode}
                          onChange={(e) => setClaudeSetupDraft((d) => ({ ...d, claude_prompt_mode: e.target.value as 'append' | 'replace' }))}
                          className="w-full bg-base border border-border rounded px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-violet-500/50 cursor-default"
                        >
                          <option value="append">Append to global prompt</option>
                          <option value="replace">Replace global prompt</option>
                        </select>
                      </Field>
                      <Field label="Priority files">
                        <textarea
                          value={claudeSetupDraft.claude_priority_files}
                          onChange={(e) => setClaudeSetupDraft((d) => ({ ...d, claude_priority_files: e.target.value }))}
                          rows={3}
                          placeholder="e.g. src/lib/types.ts, CLAUDE.md"
                          className="w-full bg-base border border-border rounded px-2.5 py-1.5 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50 resize-none font-mono"
                        />
                      </Field>
                      <Field label="Custom startup prompt">
                        <textarea
                          value={claudeSetupDraft.claude_startup_prompt}
                          onChange={(e) => setClaudeSetupDraft((d) => ({ ...d, claude_startup_prompt: e.target.value }))}
                          rows={4}
                          placeholder="Project-specific instructions for Claude…"
                          className="w-full bg-base border border-border rounded px-2.5 py-1.5 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50 resize-none"
                        />
                      </Field>
                      <Field label="Session handoff notes">
                        <textarea
                          value={claudeSetupDraft.session_handoff_notes}
                          onChange={(e) => setClaudeSetupDraft((d) => ({ ...d, session_handoff_notes: e.target.value }))}
                          rows={3}
                          placeholder="Notes to include at end of every bootstrap prompt…"
                          className="w-full bg-base border border-border rounded px-2.5 py-1.5 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50 resize-none"
                        />
                      </Field>
                      <div className="flex gap-2 pt-1">
                        <Button variant="primary" size="sm" onClick={handleSaveClaudeSetup} disabled={savingClaudeSetup}>
                          {savingClaudeSetup && <Loader2 size={11} className="animate-spin" />}
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingClaudeSetup(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-0">
                      <InfoRow label="Command" value={project.startup_command || 'claude'} valueClass="font-mono text-slate-400" />
                      <InfoRow
                        label="Terminal"
                        value={project.preferred_terminal === 'iterm' ? 'iTerm2' : project.preferred_terminal === 'terminal' ? 'Terminal.app' : 'Auto'}
                      />
                      <InfoRow
                        label="Prompt mode"
                        value={project.claude_prompt_mode === 'replace' ? 'Replace global' : 'Append to global'}
                      />
                      {project.claude_priority_files && (
                        <div className="pt-2">
                          <p className="text-[11px] text-slate-600 mb-0.5 uppercase tracking-widest font-semibold">Priority files</p>
                          <p className="text-xs text-slate-400 font-mono whitespace-pre-wrap break-all leading-relaxed">{project.claude_priority_files}</p>
                        </div>
                      )}
                      {project.claude_startup_prompt && (
                        <div className="pt-2">
                          <p className="text-[11px] text-slate-600 mb-0.5 uppercase tracking-widest font-semibold">Custom prompt</p>
                          <p className="text-xs text-slate-400 whitespace-pre-wrap line-clamp-3">{project.claude_startup_prompt}</p>
                        </div>
                      )}
                      {project.session_handoff_notes && (
                        <div className="pt-2">
                          <p className="text-[11px] text-slate-600 mb-0.5 uppercase tracking-widest font-semibold">Handoff notes</p>
                          <p className="text-xs text-slate-400 whitespace-pre-wrap line-clamp-3">{project.session_handoff_notes}</p>
                        </div>
                      )}
                      {!project.claude_startup_prompt && !project.claude_priority_files && !project.session_handoff_notes && (
                        <p className="text-xs text-slate-600 italic">Using global defaults.</p>
                      )}
                    </div>
                  )}
                </InfoCard>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Generate Plan Modal */}
      {showGeneratePlan && (
        <GeneratePlanModal
          projectId={projectId}
          onClose={() => setShowGeneratePlan(false)}
          onImported={handlePlanImported}
        />
      )}

      {/* Delete confirmation modal */}
      <Modal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Project"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}
              className="bg-red-600 hover:bg-red-500 text-white border-transparent">
              {deleting && <Loader2 size={11} className="animate-spin" />}
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300 mb-1">
          Delete <span className="text-slate-100 font-medium">"{project.name}"</span>?
        </p>
        <p className="text-xs text-slate-500">All scan history will also be removed. This cannot be undone.</p>
      </Modal>

      {/* Relink modal */}
      <Modal
        open={showRelink}
        onClose={() => { setShowRelink(false); setRelinkValid(null); }}
        title="Relink Repository Path"
        subtitle="Enter the new local path for this project's git repository."
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => { setShowRelink(false); setRelinkValid(null); }}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleRelink} disabled={!relinkPath.trim()}>
              Save Path
            </Button>
          </>
        }
      >
        <div className="relative">
          <input
            type="text"
            value={relinkPath}
            onChange={(e) => handleValidateRelink(e.target.value)}
            placeholder="/Users/you/projects/my-repo"
            className="w-full bg-base border border-border rounded px-3 py-2 text-sm text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50 font-mono pr-8"
          />
          {relinkValidating && (
            <Loader2 size={12} className="absolute right-3 top-2.5 text-slate-500 animate-spin" />
          )}
          {!relinkValidating && relinkValid === true && (
            <CheckCircle2 size={12} className="absolute right-3 top-2.5 text-green-400" />
          )}
          {!relinkValidating && relinkValid === false && (
            <AlertCircle size={12} className="absolute right-3 top-2.5 text-red-400" />
          )}
        </div>
        {relinkValid === false && (
          <p className="text-xs text-red-400 mt-2">Not a valid git repository at that path.</p>
        )}
        {relinkValid === true && (
          <p className="text-xs text-green-400 mt-2">Valid git repository found.</p>
        )}
      </Modal>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function InfoCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>{title}</SectionLabel>
        {action}
      </div>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  valueClass = 'text-slate-300',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-border-subtle last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className={`text-xs text-right ${valueClass}`}>{value}</span>
    </div>
  );
}

function PulseDots() {
  return (
    <span className="flex gap-[3px] items-center shrink-0">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-current opacity-80 animate-bounce"
          style={{ animationDelay: `${i * 0.12}s`, animationDuration: '0.6s' }}
        />
      ))}
    </span>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  cls = 'text-slate-400 hover:bg-hover',
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => Promise<void> | void;
  cls?: string;
}) {
  const [busy, setBusy] = useState(false);
  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try { await onClick(); }
    finally { setBusy(false); }
  }
  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded text-xs transition-colors cursor-default disabled:opacity-60 ${cls}`}
    >
      {busy ? <PulseDots /> : <Icon size={13} className="shrink-0" />}
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-widest font-semibold">{label}</label>
      {children}
    </div>
  );
}
