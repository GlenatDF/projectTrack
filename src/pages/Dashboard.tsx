import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderKanban, CheckCircle2,
  Brain, Loader2, RefreshCw, Search, LayoutList, LayoutGrid,
} from 'lucide-react';
import type { DashboardStats, InProgressTask, Project, ProjectScan } from '../lib/types';
import {
  getDashboardStats, getInProgressTasks, getProjects, getLatestScans,
  scanProject, updateProjectStatus,
} from '../lib/api';
import { ALL_PHASES, PHASE_LABELS, ALL_PRIORITIES, PRIORITY_LABELS } from '../lib/types';
import { StatusBadge } from '../components/StatusBadge';
import { PhaseBadge } from '../components/PhaseBadge';
import { HealthDot } from '../components/HealthDot';
import { ProjectCard } from '../components/ProjectCard';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { SectionLabel } from '../components/ui/SectionLabel';
import { relativeTime, projectTimestampLabel, loadPref, savePref } from '../lib/utils';
import { computeHealth, isOlderThanDays } from '../lib/health';
import { NewProjectWizard } from '../components/NewProjectWizard';

type ActiveFilter = 'all' | 'active' | 'paused' | 'done' | 'blocked' | 'dirty';
const FILTER_OPTIONS: { value: ActiveFilter; label: string }[] = [
  { value: 'all',     label: 'All' },
  { value: 'active',  label: 'Active' },
  { value: 'paused',  label: 'Paused' },
  { value: 'done',    label: 'Done' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'dirty',   label: 'Dirty' },
];
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
  const [latestScans, setLatestScans] = useState<Record<number, ProjectScan>>({});
  const [inProgressTasks, setInProgressTasks] = useState<InProgressTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(() => loadPref('pt:dash:filter', 'all') as ActiveFilter);
  const [query, setQuery] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<string>(() => loadPref('pt:list:phase', 'all'));
  const [priorityFilter, setPriorityFilter] = useState<string>(() => loadPref('pt:list:priority', 'all'));
  const [sortBy, setSortBy] = useState<'updated_at' | 'last_scanned_at' | 'priority' | 'name'>(
    () => loadPref('pt:dash:sort', 'updated_at'),
  );
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => loadPref('pt:list:view', 'list'));
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

      // Fetch the latest scan per project in one query
      const allScans = await getLatestScans();
      const scanMap: Record<number, ProjectScan> = {};
      for (const s of allScans) scanMap[s.project_id] = s;
      setLatestScans(scanMap);
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
      const p = scannable[i];
      setScanProgress(`Scanning ${i + 1}/${scannable.length}…`);
      try {
        const scan = await scanProject(p.id);
        setLatestScans((prev) => ({ ...prev, [p.id]: scan }));
        done++;
      } catch { failed++; }
    }
    setScanProgress(null);
    setScanResult(`✓ ${done} scanned${failed ? `, ${failed} failed` : ''}`);
    load();
    setTimeout(() => setScanResult(null), 5000);
  }

  function handleCardScan(projectId: number): Promise<ProjectScan> {
    return scanProject(projectId).then((scan) => {
      setLatestScans((prev) => ({ ...prev, [projectId]: scan }));
      return scan;
    });
  }

  function handleCardStatusChange(projectId: number, status: string): Promise<Project> {
    return updateProjectStatus(projectId, status).then((updated) => {
      setAllProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      return updated;
    });
  }

  function handleFilterChange(f: ActiveFilter) {
    setActiveFilter(f);
    savePref('pt:dash:filter', f);
  }

  function handleSortBy(s: typeof sortBy) {
    setSortBy(s);
    savePref('pt:dash:sort', s);
  }

  function toggleView(v: 'list' | 'grid') {
    setViewMode(v);
    savePref('pt:list:view', v);
  }

  function clearFilters() {
    setQuery('');
    handleFilterChange('all');
    setPhaseFilter('all'); savePref('pt:list:phase', 'all');
    setPriorityFilter('all'); savePref('pt:list:priority', 'all');
  }

  const filtered = useMemo(() => {
    const list = allProjects.filter((p) => {
      const scan = latestScans[p.id];
      const matchFilter =
        activeFilter === 'all'     ? true :
        activeFilter === 'dirty'   ? (scan?.is_dirty ?? false) :
        p.status === activeFilter;
      const matchQuery =
        query.trim() === '' ||
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.description.toLowerCase().includes(query.toLowerCase()) ||
        p.current_task.toLowerCase().includes(query.toLowerCase());
      const matchPhase = phaseFilter === 'all' || p.phase === phaseFilter;
      const matchPriority = priorityFilter === 'all' || p.priority === priorityFilter;
      return matchFilter && matchQuery && matchPhase && matchPriority;
    });
    list.sort((a, b) => {
      if (sortBy === 'priority') return (PRIORITY_ORD[a.priority] ?? 2) - (PRIORITY_ORD[b.priority] ?? 2);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      const av = (sortBy === 'last_scanned_at' ? a.last_scanned_at : a.updated_at) ?? '';
      const bv = (sortBy === 'last_scanned_at' ? b.last_scanned_at : b.updated_at) ?? '';
      return bv.localeCompare(av);
    });
    return list;
  }, [allProjects, activeFilter, query, phaseFilter, priorityFilter, sortBy, latestScans]);

  const inFocus = inProgressTasks.slice(0, 10);

  const needsAttention = useMemo(() =>
    allProjects.filter((p) => {
      if (p.status === 'done') return false;
      return p.blocker.trim() !== '' || (
        p.local_repo_path.trim() !== '' && isOlderThanDays(p.last_scanned_at, 7)
      );
    }).slice(0, 7),
    [allProjects],
  );

  const lastScanTime = useMemo(() =>
    allProjects
      .filter((p) => p.last_scanned_at)
      .map((p) => p.last_scanned_at!)
      .sort().reverse()[0] ?? null,
    [allProjects],
  );

  const hasActiveFilters = activeFilter !== 'all' || query.trim() !== '' || phaseFilter !== 'all' || priorityFilter !== 'all';
  const isScanning = scanProgress !== null;

  const subtitle = stats
    ? `${stats.total} project${stats.total !== 1 ? 's' : ''} · ${stats.active} active${lastScanTime ? ` · scanned ${relativeTime(lastScanTime)}` : ''}`
    : undefined;

  const headerActions = (
    <>
      {(scanProgress || scanResult) && (
        <span className="text-xs text-slate-500">{scanProgress ?? scanResult}</span>
      )}
      <Button variant="ghost" size="sm" onClick={handleScanAll} disabled={isScanning || allProjects.every((p) => !p.local_repo_path.trim())}>
        {isScanning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        Scan All
      </Button>
      <Button variant="primary" size="sm" onClick={() => setWizardOpen(true)}>
        <Brain size={12} />
        New
      </Button>
    </>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="Projects" subtitle={subtitle} actions={headerActions} />
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

            {/* ── Two-column workspace ─────────────────────────────── */}
            <div className="flex gap-4 items-start">

              {/* Left: project list */}
              <div className="flex-1 min-w-0">
                {/* Toolbar */}
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  {/* Unified filter pills */}
                  <div className="flex bg-surface border border-border rounded p-0.5 gap-0.5">
                    {FILTER_OPTIONS.map((f) => (
                      <button
                        key={f.value}
                        onClick={() => handleFilterChange(f.value)}
                        className={`px-3 py-1 rounded text-xs font-medium transition-all cursor-default ${
                          activeFilter === f.value
                            ? 'bg-violet-500/10 text-violet-300 ring-1 ring-inset ring-violet-500/40'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Search */}
                  <div className="flex items-center gap-1.5 bg-surface border border-border rounded px-2 py-0.5 w-[130px]">
                    <Search size={11} className="text-slate-600 shrink-0" />
                    <input
                      type="text"
                      placeholder="Search…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="flex-1 bg-transparent text-[11px] text-slate-300 placeholder-slate-600 outline-none min-w-0"
                    />
                  </div>

                  {/* Phase */}
                  <select
                    value={phaseFilter}
                    onChange={(e) => { setPhaseFilter(e.target.value); savePref('pt:list:phase', e.target.value); }}
                    className="bg-surface border border-border rounded px-2 py-0.5 text-[11px] text-slate-400 outline-none"
                  >
                    <option value="all">All Phases</option>
                    {ALL_PHASES.map((ph) => (
                      <option key={ph} value={ph}>{PHASE_LABELS[ph]}</option>
                    ))}
                  </select>

                  {/* Priority */}
                  <select
                    value={priorityFilter}
                    onChange={(e) => { setPriorityFilter(e.target.value); savePref('pt:list:priority', e.target.value); }}
                    className="bg-surface border border-border rounded px-2 py-0.5 text-[11px] text-slate-400 outline-none"
                  >
                    <option value="all">All Priorities</option>
                    {ALL_PRIORITIES.map((pr) => (
                      <option key={pr} value={pr}>{PRIORITY_LABELS[pr]}</option>
                    ))}
                  </select>

                  {/* Sort + view — push right */}
                  <div className="flex items-center gap-1.5 ml-auto">
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors cursor-default"
                      >
                        × Clear
                      </button>
                    )}
                    <select
                      value={sortBy}
                      onChange={(e) => handleSortBy(e.target.value as typeof sortBy)}
                      className="bg-surface border border-border rounded px-2 py-0.5 text-[11px] text-slate-400 outline-none"
                    >
                      <option value="updated_at">Updated</option>
                      <option value="last_scanned_at">Scanned</option>
                      <option value="priority">Priority</option>
                      <option value="name">Name</option>
                    </select>
                    <div className="flex bg-surface border border-border rounded p-0.5 gap-0.5">
                      <button
                        onClick={() => toggleView('list')}
                        className={`p-1 rounded cursor-default transition-colors ${viewMode === 'list' ? 'bg-hover text-slate-200' : 'text-slate-600 hover:text-slate-400'}`}
                        title="List view"
                      >
                        <LayoutList size={12} />
                      </button>
                      <button
                        onClick={() => toggleView('grid')}
                        className={`p-1 rounded cursor-default transition-colors ${viewMode === 'grid' ? 'bg-hover text-slate-200' : 'text-slate-600 hover:text-slate-400'}`}
                        title="Grid view"
                      >
                        <LayoutGrid size={12} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Project list / grid */}
                {allProjects.length === 0 ? (
                  <EmptyState
                    icon={<FolderKanban size={20} />}
                    title="No projects yet"
                    description="Track your AI vibe-coding projects here"
                    action={
                      <Button variant="primary" size="sm" onClick={() => setWizardOpen(true)}>
                        <Brain size={12} /> New
                      </Button>
                    }
                  />
                ) : filtered.length === 0 ? (
                  <EmptyState
                    title="No projects match your filters"
                    action={
                      <button
                        onClick={clearFilters}
                        className="text-xs text-violet-400 hover:text-violet-300 transition-colors cursor-default"
                      >
                        × Clear filters
                      </button>
                    }
                  />
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filtered.map((p) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        latestScan={latestScans[p.id] ?? null}
                        onScan={() => handleCardScan(p.id)}
                        onStatusChange={(status) => handleCardStatusChange(p.id, status)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden">
                    {filtered.map((p, i) => (
                      <ProjectRow
                        key={p.id}
                        project={p}
                        latestScan={latestScans[p.id] ?? null}
                        isLast={i === filtered.length - 1}
                        onClick={() => navigate(`/projects/${p.id}`)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Right: operational panels */}
              <div className="w-[200px] shrink-0 space-y-3">

                {/* In Focus */}
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

                {/* Needs Attention */}
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

// ── Project row ─────────────────────────────────────────────────────────────────

function ProjectRow({
  project: p, latestScan, isLast, onClick,
}: {
  project: Project; latestScan: ProjectScan | null; isLast: boolean; onClick: () => void;
}) {
  const health = computeHealth(p, latestScan ?? undefined);
  return (
    <div
      onClick={onClick}
      className={`flex items-stretch cursor-pointer hover:bg-hover transition-colors group ${
        !isLast ? 'border-b border-border-subtle' : ''
      }`}
    >
      <div className={`w-0.5 shrink-0 ${PRIORITY_BAR[p.priority] ?? 'bg-transparent'}`} />
      <div className="flex items-center gap-3 px-3 py-2.5 flex-1 min-w-0">
        <HealthDot level={health} />
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
        <div className="flex items-center gap-1 shrink-0">
          <StatusBadge status={p.status} />
          <PhaseBadge phase={p.phase} />
          {p.blocker && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 text-[11px]">
              ⊘
            </span>
          )}
        </div>
        <span className="text-[11px] text-slate-600 shrink-0 w-[88px] text-right hidden sm:block">
          {projectTimestampLabel(p)}
        </span>
      </div>
    </div>
  );
}

// ── Utilities ───────────────────────────────────────────────────────────────────

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
