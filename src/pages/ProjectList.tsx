import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, RefreshCw, FolderKanban, Loader2 } from 'lucide-react';
import type { Project, ProjectScan, Status } from '../lib/types';
import { getProjects, getProjectScans, scanProject, updateProjectStatus } from '../lib/api';
import { ALL_STATUSES, STATUS_LABELS, ALL_PHASES, PHASE_LABELS, ALL_PRIORITIES, PRIORITY_LABELS } from '../lib/types';
import { ProjectCard } from '../components/ProjectCard';
import { loadPref, savePref } from '../lib/utils';
import { isOlderThanDays } from '../lib/health';

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

  const isScanning = scanProgress !== null;

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Projects</h1>
          <p className="text-sm text-slate-400 mt-0.5">{projects.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          {(scanProgress || scanResult) && (
            <span className="text-xs text-slate-400">{scanProgress ?? scanResult}</span>
          )}
          <button
            onClick={handleScanAll}
            disabled={isScanning}
            title="Scan all projects"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-300 bg-surface border border-border hover:bg-hover rounded-lg transition-colors disabled:opacity-50"
          >
            {isScanning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Scan All
          </button>
          <button
            onClick={load}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-hover rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} />
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

      {/* Primary filters: status tabs + search */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <div className="flex bg-surface border border-border rounded-lg p-0.5 gap-0.5">
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

        <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-1.5 flex-1 min-w-[180px] max-w-xs">
          <Search size={13} className="text-slate-500 shrink-0" />
          <input
            type="text"
            placeholder="Search projects…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
          />
        </div>
      </div>

      {/* Secondary filters: phase, priority, dirty, stale, sort */}
      {projects.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <select
            value={phaseFilter}
            onChange={(e) => { setPhaseFilter(e.target.value); savePref('pt:list:phase', e.target.value); }}
            className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-slate-300 outline-none focus:border-indigo-500/50"
          >
            <option value="all">All Phases</option>
            {ALL_PHASES.map((ph) => (
              <option key={ph} value={ph}>{PHASE_LABELS[ph]}</option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => { setPriorityFilter(e.target.value); savePref('pt:list:priority', e.target.value); }}
            className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-slate-300 outline-none focus:border-indigo-500/50"
          >
            <option value="all">All Priorities</option>
            {ALL_PRIORITIES.map((pr) => (
              <option key={pr} value={pr}>{PRIORITY_LABELS[pr]}</option>
            ))}
          </select>

          <button
            onClick={() => setDirtyOnly((v) => !v)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
              dirtyOnly
                ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300'
                : 'bg-surface border-border text-slate-400 hover:text-slate-200'
            }`}
          >
            ● Dirty
          </button>

          <button
            onClick={() => setStaleOnly((v) => !v)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
              staleOnly
                ? 'bg-orange-500/15 border-orange-500/30 text-orange-300'
                : 'bg-surface border-border text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚡ Stale
          </button>

          <select
            value={sortBy}
            onChange={(e) => { const v = e.target.value as typeof sortBy; setSortBy(v); savePref('pt:list:sort', v); }}
            className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-slate-300 outline-none focus:border-indigo-500/50 ml-auto"
          >
            <option value="updated_at">Sort: Updated</option>
            <option value="last_scanned_at">Sort: Last Scanned</option>
            <option value="priority">Sort: Priority</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <FolderKanban size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 text-sm font-medium mb-1">No projects yet</p>
          <p className="text-slate-500 text-xs mb-4">Track your AI vibe-coding projects here</p>
          <button
            onClick={() => navigate('/projects/new')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
          >
            Add your first project
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">
          No projects match your filters.{' '}
          <button
            onClick={clearFilters}
            className="text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            × Clear filter
          </button>
        </div>
      ) : (
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
      )}
    </div>
  );
}

function FilterTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
        active
          ? 'bg-indigo-600 text-white'
          : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  );
}
