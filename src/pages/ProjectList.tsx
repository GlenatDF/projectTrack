import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, RefreshCw, FolderKanban, Loader2, LayoutList, LayoutGrid } from 'lucide-react';
import type { Project, ProjectScan, Status } from '../lib/types';
import { getProjects, getProjectScans, scanProject, updateProjectStatus } from '../lib/api';
import { ALL_STATUSES, STATUS_LABELS, ALL_PHASES, PHASE_LABELS, ALL_PRIORITIES, PRIORITY_LABELS } from '../lib/types';
import { ProjectCard } from '../components/ProjectCard';
import { StatusBadge } from '../components/StatusBadge';
import { PhaseBadge } from '../components/PhaseBadge';
import { HealthDot } from '../components/HealthDot';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { loadPref, savePref, projectTimestampLabel } from '../lib/utils';
import { isOlderThanDays, computeHealth } from '../lib/health';

const PRIORITY_ORD: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function ProjectList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [projects, setProjects] = useState<Project[]>([]);
  const [latestScans, setLatestScans] = useState<Record<number, ProjectScan>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<string>(() => loadPref('pt:list:phase', 'all'));
  const [priorityFilter, setPriorityFilter] = useState<string>(() => loadPref('pt:list:priority', 'all'));
  const [dirtyOnly, setDirtyOnly] = useState(false);
  const [staleOnly, setStaleOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'updated_at' | 'last_scanned_at' | 'priority' | 'name'>(
    () => loadPref('pt:list:sort', 'updated_at')
  );
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => loadPref('pt:list:view', 'list'));
  const [scanProgress, setScanProgress] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const statusFilter = (searchParams.get('status') as Status | null) ?? 'all';

  async function load() {
    try {
      setLoading(true);
      const ps = await getProjects();
      setProjects(ps);

      const scanned = ps.filter((p) => p.last_scanned_at);
      const scanMap: Record<number, ProjectScan> = {};
      await Promise.all(
        scanned.map(async (p) => {
          const scans = await getProjectScans(p.id, 1);
          if (scans[0]) scanMap[p.id] = scans[0];
        })
      );
      setLatestScans(scanMap);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleScanAll() {
    const scannable = projects.filter((p) => p.local_repo_path.trim());
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

  function handleCardScan(projectId: number): Promise<ProjectScan> {
    return scanProject(projectId).then((scan) => {
      setLatestScans((prev) => ({ ...prev, [projectId]: scan }));
      return scan;
    });
  }

  function handleCardStatusChange(projectId: number, status: string): Promise<Project> {
    return updateProjectStatus(projectId, status).then((updated) => {
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      return updated;
    });
  }

  const filtered = useMemo(() => {
    let list = projects.filter((p) => {
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchQuery =
        query.trim() === '' ||
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.description.toLowerCase().includes(query.toLowerCase()) ||
        p.current_task.toLowerCase().includes(query.toLowerCase());
      const matchPhase = phaseFilter === 'all' || p.phase === phaseFilter;
      const matchPriority = priorityFilter === 'all' || p.priority === priorityFilter;
      const scan = latestScans[p.id];
      const matchDirty = !dirtyOnly || (scan?.is_dirty ?? false);
      const matchStale = !staleOnly || (
        p.status !== 'done' &&
        p.local_repo_path.trim() !== '' &&
        isOlderThanDays(p.last_scanned_at, 7)
      );
      return matchStatus && matchQuery && matchPhase && matchPriority && matchDirty && matchStale;
    });

    list.sort((a, b) => {
      if (sortBy === 'priority') return (PRIORITY_ORD[a.priority] ?? 2) - (PRIORITY_ORD[b.priority] ?? 2);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      const av = (sortBy === 'last_scanned_at' ? a.last_scanned_at : a.updated_at) ?? '';
      const bv = (sortBy === 'last_scanned_at' ? b.last_scanned_at : b.updated_at) ?? '';
      return bv.localeCompare(av);
    });

    return list;
  }, [projects, statusFilter, query, phaseFilter, priorityFilter, dirtyOnly, staleOnly, sortBy, latestScans]);

  function setStatus(s: string) {
    if (s === 'all') setSearchParams({});
    else setSearchParams({ status: s });
  }

  function clearFilters() {
    setQuery('');
    setStatus('all');
    setPhaseFilter('all');
    setPriorityFilter('all');
    setDirtyOnly(false);
    setStaleOnly(false);
  }

  function toggleView(v: 'list' | 'grid') {
    setViewMode(v);
    savePref('pt:list:view', v);
  }

  const isScanning = scanProgress !== null;

  const headerActions = (
    <>
      {(scanProgress || scanResult) && (
        <span className="text-xs text-slate-500">{scanProgress ?? scanResult}</span>
      )}
      <Button variant="ghost" size="sm" onClick={handleScanAll} disabled={isScanning}>
        {isScanning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        Scan All
      </Button>
      <Button variant="ghost" size="icon" onClick={load} title="Refresh">
        <RefreshCw size={13} />
      </Button>
      <Button variant="primary" size="sm" onClick={() => navigate('/projects/new')}>
        <Plus size={12} />
        New Project
      </Button>
    </>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader
        title="Projects"
        subtitle={`${projects.length} total`}
        actions={headerActions}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-4 max-w-5xl mx-auto space-y-3">
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status tabs */}
            <div className="flex bg-surface border border-border rounded p-0.5 gap-0.5">
              <FilterTab label="All" active={statusFilter === 'all'} onClick={() => setStatus('all')} />
              {ALL_STATUSES.map((s) => (
                <FilterTab
                  key={s}
                  label={STATUS_LABELS[s]}
                  active={statusFilter === s}
                  onClick={() => setStatus(s)}
                />
              ))}
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 bg-surface border border-border rounded px-2.5 py-1 flex-1 min-w-[160px] max-w-xs">
              <Search size={12} className="text-slate-600 shrink-0" />
              <input
                type="text"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-xs text-slate-300 placeholder-slate-600 outline-none"
              />
            </div>

            {/* Phase */}
            <select
              value={phaseFilter}
              onChange={(e) => { setPhaseFilter(e.target.value); savePref('pt:list:phase', e.target.value); }}
              className="bg-surface border border-border rounded px-2 py-1 text-xs text-slate-400 outline-none"
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
              className="bg-surface border border-border rounded px-2 py-1 text-xs text-slate-400 outline-none"
            >
              <option value="all">All Priorities</option>
              {ALL_PRIORITIES.map((pr) => (
                <option key={pr} value={pr}>{PRIORITY_LABELS[pr]}</option>
              ))}
            </select>

            {/* Toggle filters */}
            <button
              onClick={() => setDirtyOnly((v) => !v)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors border cursor-default ${
                dirtyOnly
                  ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400'
                  : 'bg-surface border-border text-slate-500 hover:text-slate-300'
              }`}
            >
              ● Dirty
            </button>

            <button
              onClick={() => setStaleOnly((v) => !v)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors border cursor-default ${
                staleOnly
                  ? 'bg-orange-500/15 border-orange-500/30 text-orange-400'
                  : 'bg-surface border-border text-slate-500 hover:text-slate-300'
              }`}
            >
              ⚡ Stale
            </button>

            {/* Sort + View toggle — right side */}
            <div className="flex items-center gap-1.5 ml-auto">
              <select
                value={sortBy}
                onChange={(e) => { const v = e.target.value as typeof sortBy; setSortBy(v); savePref('pt:list:sort', v); }}
                className="bg-surface border border-border rounded px-2 py-1 text-[11px] text-slate-400 outline-none"
              >
                <option value="updated_at">Updated</option>
                <option value="last_scanned_at">Scanned</option>
                <option value="priority">Priority</option>
                <option value="name">Name</option>
              </select>

              {/* View mode toggle */}
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

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={<FolderKanban size={20} />}
              title="No projects yet"
              description="Track your AI vibe-coding projects here"
              action={
                <Button variant="primary" size="sm" onClick={() => navigate('/projects/new')}>
                  <Plus size={12} /> New Project
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                <div
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-hover transition-colors ${
                    i < filtered.length - 1 ? 'border-b border-border-subtle' : ''
                  }`}
                >
                  <HealthDot level={computeHealth(p, latestScans[p.id])} />
                  <span className="text-sm text-slate-200 font-medium truncate flex-1 min-w-0">{p.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusBadge status={p.status} />
                    <PhaseBadge phase={p.phase} />
                    {p.blocker && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 text-[11px]">
                        ⊘ Blocked
                      </span>
                    )}
                  </div>
                  {p.current_task && (
                    <span className="text-xs text-slate-500 truncate max-w-[200px] hidden lg:block">
                      {p.current_task}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-600 shrink-0 ml-2">
                    {projectTimestampLabel(p)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-default ${
        active ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {label}
    </button>
  );
}
