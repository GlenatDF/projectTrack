import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderKanban, Activity, AlertCircle, Clock,
  CheckCircle2, GitBranch, Zap, Plus, Loader2, RefreshCw,
} from 'lucide-react';
import type { DashboardStats, Project } from '../lib/types';
import { getDashboardStats, getProjects, scanProject } from '../lib/api';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { PhaseBadge } from '../components/PhaseBadge';
import { HealthDot } from '../components/HealthDot';
import { projectTimestampLabel, loadPref, savePref } from '../lib/utils';
import { computeHealth } from '../lib/health';

const STATUS_OPTIONS = ['all', 'active', 'blocked', 'paused', 'done'] as const;
const STATUS_PILL_LABELS: Record<string, string> = {
  all: 'All', active: 'Active', blocked: 'Blocked', paused: 'Paused', done: 'Done',
};

const PRIORITY_ORD: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(() => loadPref('pt:dash:status', 'all'));
  const [sortBy, setSortBy] = useState<'updated_at' | 'last_scanned_at' | 'priority' | 'name'>(
    () => loadPref('pt:dash:sort', 'updated_at')
  );

  async function load() {
    try {
      setLoading(true);
      const [s, projects] = await Promise.all([getDashboardStats(), getProjects()]);
      setStats(s);
      setAllProjects(projects);
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

  function handleSortBy(s: 'updated_at' | 'last_scanned_at' | 'priority' | 'name') {
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
    return list.slice(0, 12);
  }, [allProjects, statusFilter, sortBy]);

  if (loading) return <PageShell><Spinner /></PageShell>;
  if (error) return <PageShell><ErrorMsg msg={error} /></PageShell>;
  if (!stats) return null;

  const isScanning = scanProgress !== null;

  return (
    <PageShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">Overview of all your projects</p>
        </div>
        <div className="flex items-center gap-2">
          {(scanProgress || scanResult) && (
            <span className="text-xs text-slate-400">{scanProgress ?? scanResult}</span>
          )}
          <button
            onClick={handleScanAll}
            disabled={isScanning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-300 bg-surface border border-border hover:bg-hover rounded-lg transition-colors disabled:opacity-50"
          >
            {isScanning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Scan All
          </button>
          <button
            onClick={() => navigate('/projects/new')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={15} />
            New Project
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-8">
        <StatCard label="Total" value={stats.total} icon={FolderKanban} accent="indigo"
          onClick={() => navigate('/projects')} />
        <StatCard label="Active" value={stats.active} icon={Activity} accent="green"
          onClick={() => navigate('/projects?status=active')} />
        <StatCard label="Blocked" value={stats.blocked} icon={AlertCircle} accent="red"
          highlight={stats.blocked > 0}
          onClick={() => navigate('/projects?status=blocked')} />
        <StatCard label="Paused" value={stats.paused} icon={Clock} accent="yellow"
          onClick={() => navigate('/projects?status=paused')} />
        <StatCard label="Done" value={stats.done} icon={CheckCircle2} accent="slate"
          onClick={() => navigate('/projects?status=done')} />
        <StatCard label="Stale" value={stats.stale} icon={Zap} accent="orange"
          highlight={stats.stale > 0} />
        <StatCard label="Dirty Repos" value={stats.dirty_repos} icon={GitBranch} accent="blue"
          highlight={stats.dirty_repos > 0} />
      </div>

      {/* Projects section */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-300">Projects</h2>
          <div className="flex items-center gap-2">
            {/* Status filter pills */}
            <div className="flex bg-surface border border-border rounded-lg p-0.5 gap-0.5">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusFilter(s)}
                  className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {STATUS_PILL_LABELS[s]}
                </button>
              ))}
            </div>
            {/* Sort select */}
            <select
              value={sortBy}
              onChange={(e) => handleSortBy(e.target.value as typeof sortBy)}
              className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-slate-300 outline-none focus:border-indigo-500/50"
            >
              <option value="updated_at">Updated</option>
              <option value="last_scanned_at">Last Scanned</option>
              <option value="priority">Priority</option>
              <option value="name">Name</option>
            </select>
            <button
              onClick={() => navigate('/projects')}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors whitespace-nowrap"
            >
              View all →
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-1.5">
            {filtered.map((p) => (
              <div
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-lg cursor-pointer hover:bg-hover hover:border-indigo-500/30 transition-all"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <HealthDot level={computeHealth(p, undefined)} />
                  <span className="text-sm text-slate-100 font-medium truncate">{p.name}</span>
                  <StatusBadge status={p.status} />
                  <PhaseBadge phase={p.phase} />
                  {p.blocker && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 text-xs shrink-0">
                      ⊘ Blocked
                    </span>
                  )}
                </div>
                {p.current_task && (
                  <span className="text-xs text-slate-400 truncate max-w-[240px] hidden md:block">
                    {p.current_task}
                  </span>
                )}
                <span className="text-xs text-slate-500 shrink-0 ml-auto">
                  {projectTimestampLabel(p)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-6 max-w-6xl mx-auto">{children}</div>;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
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

function EmptyState() {
  const navigate = useNavigate();
  return (
    <div className="text-center py-12 border border-dashed border-border rounded-xl">
      <FolderKanban size={32} className="text-slate-600 mx-auto mb-3" />
      <p className="text-slate-400 text-sm mb-4">No projects yet</p>
      <button
        onClick={() => navigate('/projects/new')}
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
      >
        Add your first project
      </button>
    </div>
  );
}
