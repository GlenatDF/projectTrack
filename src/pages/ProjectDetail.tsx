import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit2, Trash2, RefreshCw, FolderOpen, Code2,
  AlertCircle, CheckCircle2, PauseCircle, GitBranch, Link2,
  Loader2, Terminal, Bot, Sparkles, X, Copy,
} from 'lucide-react';
import type { Project, ProjectScan } from '../lib/types';
import {
  getProject, getProjectScans, scanProject, updateProject,
  updateProjectStatus, deleteProject, openFolder, openInVscode,
  relinkRepoPath, validateRepoPath,
  openInTerminal, openInIterm, runClaudeHere, runClaudeBootstrap,
  copyBootstrapPrompt,
  runGitStatus, isItermAvailable,
} from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { PhaseBadge } from '../components/PhaseBadge';
import { PriorityDot } from '../components/PriorityDot';
import { HealthDot } from '../components/HealthDot';
import { GitBadge } from '../components/GitBadge';
import { AI_TOOL_LABELS, PHASE_LABELS } from '../lib/types';
import { relativeTime, shortHash } from '../lib/utils';
import { computeHealth } from '../lib/health';
import { PlanningDocs } from '../components/planning/PlanningDocs';
import { GeneratePlanModal } from '../components/planning/GeneratePlanModal';
import { PhasesView } from '../components/planning/PhasesView';
import { RisksView } from '../components/planning/RisksView';

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

  // Inline notes editing
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Relink modal
  const [showRelink, setShowRelink] = useState(false);
  const [relinkPath, setRelinkPath] = useState('');
  const [relinkValidating, setRelinkValidating] = useState(false);
  const [relinkValid, setRelinkValid] = useState<boolean | null>(null);

  // Planning tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'docs' | 'plan' | 'risks'>('overview');
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['overview']));
  const [planVersion, setPlanVersion] = useState(0);
  const [showGeneratePlan, setShowGeneratePlan] = useState(false);

  function handleSwitchTab(tab: typeof activeTab) {
    setActiveTab(tab);
    setVisitedTabs(prev => new Set([...prev, tab]));
  }

  function handlePlanImported() {
    setPlanVersion(v => v + 1);
    handleSwitchTab('plan');
  }

  // Terminal integration
  const [itermAvailable, setItermAvailable] = useState(false);
  const [gitStatusOutput, setGitStatusOutput] = useState<string | null>(null);
  const [gitStatusLoading, setGitStatusLoading] = useState(false);

  // Claude Setup inline editing
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
    } catch (e) {
      setActionError(String(e));
    }
  }

  async function handleDelete() {
    if (!project) return;
    try {
      setDeleting(true);
      await deleteProject(projectId);
      navigate('/projects');
    } catch (e) {
      setActionError(String(e));
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  async function handleOpenFolder() {
    if (!project?.local_repo_path) return;
    try {
      await openFolder(project.local_repo_path);
    } catch (e) {
      setActionError(String(e));
    }
  }

  async function handleOpenVscode() {
    if (!project?.local_repo_path) return;
    try {
      await openInVscode(project.local_repo_path);
    } catch (e) {
      setActionError(String(e));
    }
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

  async function handleRunClaude() {
    if (!project?.local_repo_path) return;
    try { await runClaudeHere(project.local_repo_path); }
    catch (e) { setActionError(String(e)); }
  }

  async function handleClaudeBootstrap() {
    if (!project) return;
    try {
      const msg = await runClaudeBootstrap(projectId);
      setActionNotice(msg);
    } catch (e) {
      setActionError(String(e));
    }
  }

  async function handleCopyBootstrap() {
    if (!project) return;
    try {
      await copyBootstrapPrompt(projectId);
      setActionNotice('Bootstrap prompt copied to clipboard (⌘V to paste)');
    } catch (e) {
      setActionError(String(e));
    }
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
    } catch (e) {
      setActionError(String(e));
    } finally {
      setGitStatusLoading(false);
    }
  }

  async function handleSaveNotes() {
    if (!project) return;
    try {
      setSavingNotes(true);
      const updated = await updateProject(projectId, { ...project, notes: notesValue });
      setProject(updated);
      setEditingNotes(false);
    } catch (e) {
      setActionError(String(e));
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleRelink() {
    try {
      const updated = await relinkRepoPath(projectId, relinkPath);
      setProject(updated);
      setShowRelink(false);
      setRelinkPath('');
      setRelinkValid(null);
    } catch (e) {
      setActionError(String(e));
    }
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

  if (loading) return <Shell><Spinner /></Shell>;
  if (error || !project) return <Shell><ErrMsg msg={error ?? 'Project not found'} /></Shell>;

  return (
    <Shell>
      {/* Back + Title bar */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button
            onClick={() => navigate('/projects')}
            className="mt-0.5 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-hover transition-colors shrink-0"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-100 truncate">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-slate-400 mt-0.5">{project.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowGeneratePlan(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-lg hover:bg-violet-500/20 transition-colors"
          >
            <Sparkles size={13} /> Plan
          </button>
          <button
            onClick={() => navigate(`/projects/${projectId}/edit`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-300 bg-surface border border-border rounded-lg hover:bg-hover transition-colors"
          >
            <Edit2 size={13} /> Edit
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete project"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <StatusBadge status={project.status} />
        <PhaseBadge phase={project.phase} />
        <PriorityDot priority={project.priority} />
        <HealthDot level={computeHealth(project, latestScan)} />
        <span className="text-xs text-slate-500 ml-1">
          {AI_TOOL_LABELS[project.ai_tool]}
        </span>
        <span className="text-xs text-slate-600 ml-auto">
          Updated {relativeTime(project.updated_at)}
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-5 border-b border-[#2a2d3a]">
        {(['overview', 'docs', 'plan', 'risks'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => handleSwitchTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab === 'overview' ? 'Overview' :
             tab === 'docs' ? 'Docs' :
             tab === 'plan' ? 'Tasks' : 'Risks'}
          </button>
        ))}
      </div>

      {/* Action error */}
      {actionError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-auto text-red-300 hover:text-red-200">✕</button>
        </div>
      )}

      {/* Action notice (e.g. bootstrap clipboard confirmation) */}
      {actionNotice && (
        <div className="mb-4 p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg text-violet-300 text-sm flex items-start gap-2">
          <Sparkles size={14} className="mt-0.5 shrink-0" />
          <span>{actionNotice}</span>
          <button onClick={() => setActionNotice(null)} className="ml-auto text-violet-400 hover:text-violet-200">✕</button>
        </div>
      )}

      {/* Planning tabs — mount on first visit, then hidden CSS to preserve state */}
      <div className={activeTab === 'docs' ? 'block' : 'hidden'}>
        {visitedTabs.has('docs') && (
          <PlanningDocs
            projectId={projectId}
            onNavigateToPlan={() => handleSwitchTab('plan')}
          />
        )}
      </div>
      <div className={activeTab === 'plan' ? 'block' : 'hidden'}>
        {visitedTabs.has('plan') && (
          <PhasesView
            projectId={projectId}
            planVersion={planVersion}
            onGeneratePlan={() => setShowGeneratePlan(true)}
          />
        )}
      </div>
      <div className={activeTab === 'risks' ? 'block' : 'hidden'}>
        {visitedTabs.has('risks') && (
          <RisksView projectId={projectId} planVersion={planVersion} />
        )}
      </div>

      <div className={activeTab === 'overview' ? 'block' : 'hidden'}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
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
              <button
                onClick={handleScan}
                disabled={scanning || !hasRepo}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scanning ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                Scan now
              </button>
            }
          >
            {!hasRepo ? (
              <p className="text-xs text-slate-500 italic">No repository path configured.</p>
            ) : repoMissing ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <AlertCircle size={14} />
                  Path not found — repo may have moved
                </div>
                <p className="text-xs text-slate-500 font-mono break-all">{project.local_repo_path}</p>
                <button
                  onClick={() => { setShowRelink(true); setRelinkPath(project.local_repo_path); }}
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <Link2 size={12} /> Relink repo path
                </button>
              </div>
            ) : (
              <GitBadge scan={latestScan} />
            )}

            {hasRepo && !repoMissing && (
              <p className="text-xs text-slate-600 mt-2 font-mono break-all">{project.local_repo_path}</p>
            )}

            {project.last_scanned_at && (
              <p className="text-xs text-slate-600 mt-1">
                Last scanned {relativeTime(project.last_scanned_at)}
              </p>
            )}
          </InfoCard>

          {/* Scan history */}
          {scans.length > 0 && (
            <InfoCard title="Recent Scans">
              <div className="space-y-2">
                {scans.map((s) => (
                  <div key={s.id} className="flex items-start justify-between gap-4 py-1.5 border-b border-border last:border-0">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 text-xs">
                        {s.current_branch && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <GitBranch size={10} />
                            {s.current_branch}
                          </span>
                        )}
                        <span className={s.is_dirty ? 'text-yellow-400' : 'text-green-400'}>
                          {s.is_dirty ? '● dirty' : '✓ clean'}
                        </span>
                        {!s.is_valid_repo && (
                          <span className="text-red-400 text-xs">{s.error_message}</span>
                        )}
                      </div>
                      {s.last_commit_hash && (
                        <p className="text-xs text-slate-500 truncate">
                          <span className="font-mono">{shortHash(s.last_commit_hash)}</span>
                          {' '}{s.last_commit_message}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-slate-600 shrink-0">{relativeTime(s.scanned_at)}</span>
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
            <div className="space-y-1.5">
              {hasRepo && (
                <>
                  <ActionBtn icon={FolderOpen} label="Open in Finder" onClick={handleOpenFolder} />
                  <ActionBtn icon={Code2} label="Open in Editor" onClick={handleOpenVscode} />
                  <ActionBtn icon={Terminal} label="Open in Terminal" onClick={handleOpenTerminal} />
                  {itermAvailable && (
                    <ActionBtn icon={Terminal} label="Open in iTerm" onClick={handleOpenIterm}
                      cls="text-teal-400 hover:bg-teal-500/10" />
                  )}
                  <ActionBtn icon={Bot} label="Run Claude here" onClick={handleRunClaude}
                    cls="text-violet-400 hover:bg-violet-500/10" />
                  <ActionBtn icon={Sparkles} label="Claude + Bootstrap" onClick={handleClaudeBootstrap}
                    cls="text-violet-300 hover:bg-violet-500/10" />
                  <ActionBtn icon={Copy} label="Copy Bootstrap Prompt" onClick={handleCopyBootstrap}
                    cls="text-violet-400/70 hover:bg-violet-500/10" />
                  <button
                    onClick={handleGitStatus}
                    disabled={gitStatusLoading}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-50"
                  >
                    {gitStatusLoading
                      ? <Loader2 size={14} className="shrink-0 animate-spin" />
                      : <GitBranch size={14} className="shrink-0" />}
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
                  cls="text-indigo-400 hover:bg-indigo-500/10" />
              )}
            </div>
            {gitStatusOutput !== null && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">git status</span>
                  <button
                    onClick={() => setGitStatusOutput(null)}
                    className="text-slate-600 hover:text-slate-400 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
                <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-all leading-relaxed bg-base rounded-lg p-2.5 max-h-48 overflow-y-auto">
                  {gitStatusOutput}
                </pre>
              </div>
            )}
          </InfoCard>

          {/* Meta */}
          <InfoCard title="Info">
            <InfoRow label="Phase" value={PHASE_LABELS[project.phase]} />
            <InfoRow label="AI tool" value={AI_TOOL_LABELS[project.ai_tool]} />
            <InfoRow label="Created" value={relativeTime(project.created_at)} />
            <InfoRow label="ID" value={String(project.id)} valueClass="font-mono text-slate-500" />
          </InfoCard>

          {/* Notes */}
          <InfoCard
            title="Notes"
            action={
              !editingNotes ? (
                <button onClick={() => setEditingNotes(true)}
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
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
                  className="w-full bg-base border border-border rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50 resize-none"
                  placeholder="Project notes…"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {savingNotes && <Loader2 size={11} className="animate-spin" />}
                    Save
                  </button>
                  <button
                    onClick={() => { setEditingNotes(false); setNotesValue(project.notes); }}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-hover rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className={`text-sm leading-relaxed whitespace-pre-wrap select-text ${project.notes ? 'text-slate-300' : 'text-slate-500 italic'}`}>
                {project.notes || 'No notes yet. Click Edit to add some.'}
              </p>
            )}
          </InfoCard>

          {/* Claude Setup */}
          <InfoCard
            title="Claude Setup"
            action={
              !editingClaudeSetup ? (
                <button onClick={handleEnterClaudeEdit}
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
                  Edit
                </button>
              ) : null
            }
          >
            {editingClaudeSetup ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Startup command</label>
                  <input
                    type="text"
                    value={claudeSetupDraft.startup_command}
                    onChange={(e) => setClaudeSetupDraft((d) => ({ ...d, startup_command: e.target.value }))}
                    placeholder="claude"
                    className="w-full bg-base border border-border rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Preferred terminal</label>
                  <select
                    value={claudeSetupDraft.preferred_terminal}
                    onChange={(e) => setClaudeSetupDraft((d) => ({ ...d, preferred_terminal: e.target.value }))}
                    className="w-full bg-base border border-border rounded-lg px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500/50 cursor-pointer"
                  >
                    <option value="">Auto (iTerm2 if available)</option>
                    <option value="iterm">iTerm2</option>
                    <option value="terminal">Terminal.app</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Prompt mode</label>
                  <select
                    value={claudeSetupDraft.claude_prompt_mode}
                    onChange={(e) => setClaudeSetupDraft((d) => ({ ...d, claude_prompt_mode: e.target.value as 'append' | 'replace' }))}
                    className="w-full bg-base border border-border rounded-lg px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500/50 cursor-pointer"
                  >
                    <option value="append">Append to global prompt</option>
                    <option value="replace">Replace global prompt</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Priority files to read first</label>
                  <textarea
                    value={claudeSetupDraft.claude_priority_files}
                    onChange={(e) => setClaudeSetupDraft((d) => ({ ...d, claude_priority_files: e.target.value }))}
                    rows={3}
                    placeholder="e.g. src/lib/types.ts, CLAUDE.md"
                    className="w-full bg-base border border-border rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50 resize-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Custom startup prompt</label>
                  <textarea
                    value={claudeSetupDraft.claude_startup_prompt}
                    onChange={(e) => setClaudeSetupDraft((d) => ({ ...d, claude_startup_prompt: e.target.value }))}
                    rows={4}
                    placeholder="Project-specific instructions for Claude…"
                    className="w-full bg-base border border-border rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Session handoff notes</label>
                  <textarea
                    value={claudeSetupDraft.session_handoff_notes}
                    onChange={(e) => setClaudeSetupDraft((d) => ({ ...d, session_handoff_notes: e.target.value }))}
                    rows={3}
                    placeholder="Notes to include at end of every bootstrap prompt…"
                    className="w-full bg-base border border-border rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50 resize-none"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSaveClaudeSetup}
                    disabled={savingClaudeSetup}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {savingClaudeSetup && <Loader2 size={11} className="animate-spin" />}
                    Save
                  </button>
                  <button
                    onClick={() => setEditingClaudeSetup(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-hover rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <InfoRow label="Command" value={project.startup_command || 'claude'} valueClass="text-slate-300 font-mono" />
                <InfoRow
                  label="Terminal"
                  value={project.preferred_terminal === 'iterm' ? 'iTerm2' : project.preferred_terminal === 'terminal' ? 'Terminal.app' : 'Auto'}
                />
                <InfoRow
                  label="Prompt mode"
                  value={project.claude_prompt_mode === 'replace' ? 'Replace global' : 'Append to global'}
                />
                {project.claude_priority_files && (
                  <div className="pt-1">
                    <p className="text-xs text-slate-500 mb-0.5">Priority files</p>
                    <p className="text-xs text-slate-400 font-mono whitespace-pre-wrap break-all leading-relaxed">{project.claude_priority_files}</p>
                  </div>
                )}
                {project.claude_startup_prompt && (
                  <div className="pt-1">
                    <p className="text-xs text-slate-500 mb-0.5">Custom prompt</p>
                    <p className="text-xs text-slate-400 whitespace-pre-wrap line-clamp-3">{project.claude_startup_prompt}</p>
                  </div>
                )}
                {project.session_handoff_notes && (
                  <div className="pt-1">
                    <p className="text-xs text-slate-500 mb-0.5">Handoff notes</p>
                    <p className="text-xs text-slate-400 whitespace-pre-wrap line-clamp-3">{project.session_handoff_notes}</p>
                  </div>
                )}
                {!project.claude_startup_prompt && !project.claude_priority_files && !project.session_handoff_notes && (
                  <p className="text-xs text-slate-500 italic">Using global defaults. Click Edit to customize.</p>
                )}
              </div>
            )}
          </InfoCard>
        </div>
      </div>

      </div>{/* end overview tab */}

      {/* Generate Plan Modal */}
      {showGeneratePlan && (
        <GeneratePlanModal
          projectId={projectId}
          onClose={() => setShowGeneratePlan(false)}
          onImported={handlePlanImported}
        />
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && project && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl p-5 w-full max-w-sm shadow-2xl">
            <h2 className="text-base font-semibold text-slate-100 mb-1">Delete Project</h2>
            <p className="text-sm text-slate-400 mb-1">
              Delete <span className="text-slate-200 font-medium">"{project.name}"</span>?
            </p>
            <p className="text-xs text-slate-500 mb-5">
              All scan history will also be removed. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 bg-hover rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting && <Loader2 size={13} className="animate-spin" />}
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Relink modal */}
      {showRelink && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl p-5 w-full max-w-lg shadow-2xl">
            <h2 className="text-base font-semibold text-slate-100 mb-1">Relink Repository Path</h2>
            <p className="text-sm text-slate-400 mb-4">
              Enter the new local path for this project's git repository.
            </p>
            <div className="relative mb-2">
              <input
                type="text"
                value={relinkPath}
                onChange={(e) => handleValidateRelink(e.target.value)}
                placeholder="/Users/you/projects/my-repo"
                className="w-full bg-base border border-border rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50 font-mono pr-8"
              />
              {relinkValidating && (
                <Loader2 size={13} className="absolute right-3 top-2.5 text-slate-400 animate-spin" />
              )}
              {!relinkValidating && relinkValid === true && (
                <CheckCircle2 size={13} className="absolute right-3 top-2.5 text-green-400" />
              )}
              {!relinkValidating && relinkValid === false && (
                <AlertCircle size={13} className="absolute right-3 top-2.5 text-red-400" />
              )}
            </div>
            {relinkValid === false && (
              <p className="text-xs text-red-400 mb-3">Not a valid git repository at that path.</p>
            )}
            {relinkValid === true && (
              <p className="text-xs text-green-400 mb-3">Valid git repository found.</p>
            )}
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => { setShowRelink(false); setRelinkValid(null); }}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 bg-hover rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRelink}
                disabled={!relinkPath.trim()}
                className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                Save Path
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-6 max-w-5xl mx-auto">{children}</div>;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ErrMsg({ msg }: { msg: string }) {
  return (
    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{msg}</div>
  );
}

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
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</h3>
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
    <div className="flex items-baseline justify-between gap-4 py-1 border-b border-border last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className={`text-sm text-right ${valueClass}`}>{value}</span>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  cls = 'text-slate-300 hover:bg-hover',
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  cls?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${cls}`}
    >
      <Icon size={14} className="shrink-0" />
      {label}
    </button>
  );
}

