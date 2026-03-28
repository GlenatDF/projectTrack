import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderKanban, Activity, AlertCircle, Clock,
  CheckCircle2, GitBranch, Zap, Plus, Loader2, RefreshCw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DashboardStats, InProgressTask, Project } from '../lib/types';
import { getDashboardStats, getInProgressTasks, getProjects, scanProject } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { PhaseBadge } from '../components/PhaseBadge';
import { HealthDot } from '../components/HealthDot';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { SectionLabel } from '../components/ui/SectionLabel';
import { relativeTime, projectTimestampLabel, loadPref, savePref } from '../lib/utils';
import { computeHealth, isOlderThanDays } from '../lib/health';
import { NewProjectWizard } from '../components/NewProjectWizard';

const STATUS_OPTIONS = ['all', 'active', 'blocked', 'paused', 'done'] as const;
const STATUS_PILL_LABELS: Record<string, string> = {
  all: 'All', active: 'Active', blocked: 'Blocked', paused: 'Paused', done: 'Done',
};
const PRIORITY_ORD: Record<string, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_BAR: Record<string, string> = {
  high:   'bg-red-500/60',
  medium: 'bg-yellow-500/40',
  low:    'bg-transparent',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [inProgressTasks, setInProgressTasks] = useState<InProgressTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(() => loadPref('pt:dash:status', 'all'));
  const [sortBy, setSortBy] = useState<'updated_at' | 'last_scanned_at' | 'priority' | 'name'>(
    () => loadPref('pt:dash:sort', 'updated_at')
  );
  const [wizardOpen, setWizardOpen] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const [s, projects, tasks] = await Promise.all([
        getDashboardStats(), getProjects(), getInProgressTasks(),
      ]);
      setStats(s);
      setAllProjects(projects);
      setInProgressTasks(tasks);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleScanAll() {
    const scannable = allProjects.filter((p) => p.local_repo_path.trim());
    let done = 0, failed = 0;
    for (let i = 0; i < scannable.length; i++) {
      setScanProgress(`Scanning ${i + 1}/${scannable.length}…`);
      try { await scanProject(scannable[i].id); done++; }
      catch { failed++; }
    }
    setScanProgress(null);
    setScanResult(`✓ ${done} scanned${failed ? `, ${failed} failed` : ''}`);
    load();
    setTimeout(() => setScanResult(null), 5000);
  }

  function handleStatusFilter(s: string) {
    setStatusFilter(s);
    savePref('pt:dash:status', s);
  }

  function handleSortBy(s: typeof sortBy) {
    setSortBy(s);
    savePref('pt:dash:sort', s);
  }

  const filtered = useMemo(() => {
    let list = statusFilter === 'all' ? [...allProjects]
      : allProjects.filter((p) => p.status === statusFilter);
    list.sort((a, b) => {
      if (sortBy === 'priority') return (PRIORITY_ORD[a.priority] ?? 2) - (PRIORITY_ORD[b.priority] ?? 2);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      const av = (sortBy === 'last_scanned_at' ? a.last_scanned_at : a.updated_at) ?? '';
      const bv = (sortBy === 'last_scanned_at' ? b.last_scanned_at : b.updated_at) ?? '';
      return bv.localeCompare(av);
    });
    return list.slice(0, 20);
  }, [allProjects, statusFilter, sortBy]);

  // Tasks currently marked in_progress across all projects
  const inFocus = inProgressTasks.slice(0, 10);

  // Projects that need operator attention: blocked or stale with a repo
  const needsAttention = useMemo(() =>
    allProjects.filter(p => {
      if (p.status === 'done') return false;
      const blocked = p.blocker.trim() !== '';
      const stale = p.local_repo_path.trim() !== '' && isOlderThanDays(p.last_scanned_at, 7);
      return blocked || stale;
    }).slice(0, 7),
    [allProjects]
  );

  // Most recent scan across all projects
  const lastScanTime = useMemo(() =>
    allProjects
      .filter(p => p.last_scanned_at)
      .map(p => p.last_scanned_at!)
      .sort().reverse()[0] ?? null,
    [allProjects]
  );

  const isScanning = scanProgress !== null;

  const subtitle = stats
    ? `${stats.total} project${stats.total !== 1 ? 's' : ''} · ${stats.active} active${lastScanTime ? ` · scanned ${relativeTime(lastScanTime)}` : ''}`
    : undefined;

  const headerActions = (
    <>
      {(scanProgress || scanResult) && (
        <span className="text-xs text-slate-500">{scanProgress ?? scanResult}</span>
      )}
      <Button variant="ghost" size="sm" onClick={handleScanAll} disabled={isScanning || allProjects.every(p => !p.local_repo_path.trim())}>
        {isScanning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        Scan All
      </Button>
      <Button variant="primary" size="sm" onClick={() => setWizardOpen(true)}>
        <Plus size={12} />
        New Project
      </Button>
    </>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="Dashboard" subtitle={subtitle} actions={headerActions} />
      <div className="flex-1 overflow-y-auto">
        <NewProjectWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={(id) => { setWizardOpen(false); load(); navigate(`/projects/${id}`); }}
      />

      {loading ? (
          <Spinner />
        ) : error ? (
          <div className="px-5 py-4 max-w-5xl mx-auto">
            <ErrorMsg msg={error} />
          </div>
        ) : stats && (
          <div className="px-5 py-4 max-w-5xl mx-auto space-y-4">

            {/* ── Stats strip ─────────────────────────────────────── */}
            <div className="flex gap-3">
              {/* Status group — distribution across lifecycle states */}
              <div className="flex-1 bg-card border border-border rounded-lg overflow-hidden flex">
                <MetricCell
                  label="Total" value={stats.total} icon={FolderKanban} iconCls="text-violet-400"
                  onClick={() => navigate('/projects')}
                />
                <MetricCell sep
                  label="Active" value={stats.active} icon={Activity} iconCls="text-green-400"
                  onClick={() => { handleStatusFilter('active'); navigate('/projects?status=active'); }}
                />
                <MetricCell sep
                  label="Paused" value={stats.paused} icon={Clock} iconCls="text-yellow-500"
                  dim={stats.paused === 0}
                  onClick={() => { handleStatusFilter('paused'); navigate('/projects?status=paused'); }}
                />
                <MetricCell sep
                  label="Done" value={stats.done} icon={CheckCircle2} iconCls="text-slate-500"
                  dim
                  onClick={() => { handleStatusFilter('done'); navigate('/projects?status=done'); }}
                />
              </div>

              {/* Health group — operational concerns that need action */}
              <div className="bg-card border border-border rounded-lg overflow-hidden flex">
                <MetricCell
                  label="Blocked" value={stats.blocked} icon={AlertCircle} iconCls="text-red-400"
                  alertBg={stats.blocked > 0 ? 'bg-red-500/8' : undefined}
                  onClick={() => { handleStatusFilter('blocked'); navigate('/projects?status=blocked'); }}
                />
                <MetricCell sep
                  label="Stale" value={stats.stale} icon={Zap} iconCls="text-orange-400"
                  alertBg={stats.stale > 0 ? 'bg-orange-500/8' : undefined}
                />
                <MetricCell sep
                  label="Dirty" value={stats.dirty_repos} icon={GitBranch} iconCls="text-blue-400"
                  alertBg={stats.dirty_repos > 0 ? 'bg-blue-500/8' : undefined}
                />
              </div>
            </div>

            {/* ── Two-column workspace ─────────────────────────────── */}
            <div className="flex gap-4 items-start">

              {/* Left: project list — primary workspace surface */}
              <div className="flex-1 min-w-0">
                {/* Toolbar */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex bg-surface border border-border rounded p-0.5 gap-0.5">
                      {STATUS_OPTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusFilter(s)}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-default ${
                            statusFilter === s
                              ? 'bg-violet-600 text-white'
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {STATUS_PILL_LABELS[s]}
                        </button>
                      ))}
                    </div>
                    {allProjects.length > 0 && (
                      <span className="text-[11px] text-slate-700">
                        {filtered.length}{allProjects.length > 20 && statusFilter === 'all' ? ` of ${allProjects.length}` : ''}
                        {' '}project{filtered.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={sortBy}
                      onChange={(e) => handleSortBy(e.target.value as typeof sortBy)}
                      className="bg-surface border border-border rounded px-2 py-0.5 text-[11px] text-slate-400 outline-none cursor-default"
                    >
                      <option value="updated_at">Updated</option>
                      <option value="last_scanned_at">Scanned</option>
                      <option value="priority">Priority</option>
                      <option value="name">Name</option>
                    </select>
                    <button
                      onClick={() => navigate('/projects')}
                      className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors whitespace-nowrap cursor-default"
                    >
                      All projects →
                    </button>
                  </div>
                </div>

                {/* Project rows */}
                {filtered.length === 0 ? (
                  <EmptyState
                    icon={<FolderKanban size={20} />}
                    title={statusFilter !== 'all' ? `No ${STATUS_PILL_LABELS[statusFilter].toLowerCase()} projects` : 'No projects yet'}
                    description={statusFilter === 'all' ? 'Add your first project to get started' : undefined}
                    action={
                      statusFilter === 'all' ? (
                        <Button variant="primary" size="sm" onClick={() => navigate('/projects/new')}>
                          <Plus size={12} /> New Project
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden">
                    {filtered.map((p, i) => (
                      <ProjectRow
                        key={p.id}
                        project={p}
                        isLast={i === filtered.length - 1}
                        onClick={() => navigate(`/projects/${p.id}`)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Right: operational panels */}
              <div className="w-[220px] shrink-0 space-y-3">

                {/* In Focus — active projects with a current task */}
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-border-subtle">
                    <SectionLabel>In Focus</SectionLabel>
                  </div>
                  {inFocus.length === 0 ? (
                    <p className="px-3 py-3 text-[11px] text-slate-700 leading-relaxed">
                      Mark tasks as in progress on the Plan tab to track them here.
                    </p>
                  ) : (
                    <div>
                      {inFocus.map((t, i) => (
                        <button
                          key={t.id}
                          onClick={() => navigate(`/projects/${t.project_id}`)}
                          className={`w-full text-left px-3 py-2 hover:bg-hover transition-colors cursor-default group ${
                            i < inFocus.length - 1 ? 'border-b border-border-subtle' : ''
                          }`}
                        >
                          <div className="text-[11px] text-slate-600 truncate leading-tight">
                            {t.project_name}
                          </div>
                          <div className="text-[11px] font-medium text-slate-400 truncate mt-0.5 group-hover:text-slate-200 transition-colors">
                            {t.title}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Needs Attention — blocked or stale */}
                {needsAttention.length > 0 ? (
                  <div className="bg-card border border-border rounded-lg overflow-hidden">
                    <div className="px-3 py-2 border-b border-border-subtle">
                      <SectionLabel>Needs Attention</SectionLabel>
                    </div>
                    <div>
                      {needsAttention.map((p, i) => {
                        const isBlocked = p.blocker.trim() !== '';
                        const isStale = p.local_repo_path.trim() !== '' && isOlderThanDays(p.last_scanned_at, 7);
                        return (
                          <button
                            key={p.id}
                            onClick={() => navigate(`/projects/${p.id}`)}
                            className={`w-full text-left px-3 py-2 hover:bg-hover transition-colors cursor-default group ${
                              i < needsAttention.length - 1 ? 'border-b border-border-subtle' : ''
                            }`}
                          >
                            <div className="text-[11px] font-medium text-slate-400 truncate group-hover:text-slate-200 transition-colors">
                              {p.name}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {isBlocked && (
                                <span className="text-[10px] font-medium text-red-400">⊘ blocked</span>
                              )}
                              {isStale && (
                                <span className="text-[10px] text-orange-400">
                                  {isBlocked ? '· ' : ''}stale {relativeTime(p.last_scanned_at)}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : allProjects.length > 0 ? (
                  /* All-clear state */
                  <div className="bg-card border border-border rounded-lg px-3 py-2.5 flex items-center gap-2">
                    <CheckCircle2 size={11} className="text-green-400 shrink-0" />
                    <span className="text-[11px] text-slate-700">No blocked or stale projects</span>
                  </div>
                ) : null}

              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Metric cell for stats strip ────────────────────────────────────────────────

function MetricCell({
  label, value, icon: Icon, iconCls, dim, alertBg, sep, onClick,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  iconCls: string;
  dim?: boolean;
  alertBg?: string;
  sep?: boolean;       // render left border separator
  onClick?: () => void;
}) {
  const isAlert = alertBg !== undefined;
  return (
    <div
      onClick={onClick}
      className={[
        'flex items-center gap-2.5 px-4 py-3 flex-1 min-w-[80px]',
        sep ? 'border-l border-border' : '',
        onClick ? 'cursor-pointer hover:bg-hover transition-colors' : '',
        isAlert ? alertBg : '',
      ].filter(Boolean).join(' ')}
    >
      <Icon size={14} className={dim ? 'text-slate-700' : iconCls} />
      <div>
        <div className={[
          'text-lg font-bold leading-none tabular-nums',
          dim ? 'text-slate-600' : isAlert ? 'text-slate-100' : 'text-slate-300',
        ].join(' ')}>
          {value}
        </div>
        <div className={`text-[10px] uppercase tracking-wide mt-0.5 ${dim ? 'text-slate-700' : 'text-slate-600'}`}>
          {label}
        </div>
      </div>
    </div>
  );
}

// ── Project row ────────────────────────────────────────────────────────────────

function ProjectRow({
  project: p, isLast, onClick,
}: {
  project: Project; isLast: boolean; onClick: () => void;
}) {
  const health = computeHealth(p, undefined);
  return (
    <div
      onClick={onClick}
      className={`flex items-stretch cursor-pointer hover:bg-hover transition-colors group ${
        !isLast ? 'border-b border-border-subtle' : ''
      }`}
    >
      {/* Priority accent bar */}
      <div className={`w-0.5 shrink-0 ${PRIORITY_BAR[p.priority] ?? 'bg-transparent'}`} />

      {/* Row content */}
      <div className="flex items-center gap-3 px-3 py-2.5 flex-1 min-w-0">
        <HealthDot level={health} />

        {/* Name + current task stacked */}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-slate-300 font-medium truncate group-hover:text-slate-100 transition-colors">
            {p.name}
          </div>
          {p.current_task.trim() && (
            <div className="text-[11px] text-slate-600 truncate mt-0.5 leading-tight">
              {p.current_task}
            </div>
          )}
        </div>

        {/* Status + phase */}
        <div className="flex items-center gap-1 shrink-0">
          <StatusBadge status={p.status} />
          <PhaseBadge phase={p.phase} />
        </div>

        {/* Timestamp */}
        <span className="text-[11px] text-slate-600 shrink-0 w-[88px] text-right hidden sm:block">
          {projectTimestampLabel(p)}
        </span>
      </div>
    </div>
  );
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
      {msg}
    </div>
  );
}
