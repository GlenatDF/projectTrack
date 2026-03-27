import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderOpen, Search, GitBranch, CheckCircle2, AlertCircle, Loader2, ArrowRight,
} from 'lucide-react';
import { discoverRepos, bulkImportRepos, chooseFolderMac } from '../lib/api';
import type { DiscoveredRepo } from '../lib/types';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Discover() {
  const [rootPath, setRootPath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [repos, setRepos] = useState<DiscoveredRepo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [hideTracked, setHideTracked] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const visible = useMemo(() => {
    let list = repos;
    if (hideTracked) list = list.filter((r) => !r.already_tracked);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q)
      );
    }
    return list;
  }, [repos, hideTracked, searchQuery]);

  const trackedCount = repos.filter((r) => r.already_tracked).length;
  const selectableCount = repos.filter((r) => !r.already_tracked).length;

  async function handleBrowse() {
    const path = await chooseFolderMac();
    if (path) setRootPath(path.replace(/\/$/, ''));
  }

  async function handleScan() {
    if (!rootPath.trim()) return;
    setScanning(true);
    setScanError(null);
    setRepos([]);
    setSelected(new Set());
    setImportResult(null);
    try {
      const result = await discoverRepos(rootPath.trim());
      setRepos(result);
      setSelected(new Set(result.filter((r) => !r.already_tracked).map((r) => r.path)));
    } catch (err) {
      setScanError(String(err));
    } finally {
      setScanning(false);
    }
  }

  function toggleRepo(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(repos.filter((r) => !r.already_tracked).map((r) => r.path)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function handleImport() {
    const toImport = [...selected].map((path) => {
      const repo = repos.find((r) => r.path === path)!;
      return { name: repo.name, path: repo.path };
    });
    if (toImport.length === 0) return;
    setImporting(true);
    try {
      const created = await bulkImportRepos(toImport);
      setImportResult(`${created.length} project${created.length === 1 ? '' : 's'} imported`);
      setRepos((prev) =>
        prev.map((r) => (selected.has(r.path) ? { ...r, already_tracked: true } : r))
      );
      setSelected(new Set());
    } catch (err) {
      setScanError(String(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="Discover" subtitle="Scan your filesystem for git repos to import" />

      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-4 max-w-5xl mx-auto space-y-4">
          {/* Path input row */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
              placeholder="/Users/you/Projects"
              disabled={scanning}
              className="flex-1 bg-surface border border-border rounded-md px-3 py-2 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 disabled:opacity-50 transition-colors"
            />
            <Button variant="secondary" size="sm" onClick={handleBrowse} disabled={scanning}>
              <FolderOpen size={12} />
              Browse…
            </Button>
            <Button variant="primary" size="sm" onClick={handleScan} disabled={scanning || !rootPath.trim()}>
              {scanning ? (
                <><Loader2 size={12} className="animate-spin" /> Scanning…</>
              ) : (
                <><Search size={12} /> Scan</>
              )}
            </Button>
          </div>

          {/* Error */}
          {scanError && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
              <AlertCircle size={12} />
              {scanError}
            </div>
          )}

          {/* Success banner */}
          {importResult && (
            <div className="flex items-center justify-between gap-2 text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded px-3 py-2">
              <span className="flex items-center gap-2">
                <CheckCircle2 size={12} />
                {importResult}
              </span>
              <Link
                to="/projects"
                className="flex items-center gap-1 text-green-300 hover:text-green-200 font-medium cursor-default"
              >
                View Projects <ArrowRight size={11} />
              </Link>
            </div>
          )}

          {/* Results */}
          {repos.length > 0 && (
            <div className="space-y-3">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs text-slate-500">
                  Found {repos.length}
                  {trackedCount > 0 && ` · ${trackedCount} tracked`}
                  {selected.size > 0 && ` · ${selected.size} selected`}
                </p>
                <div className="flex items-center gap-2 ml-auto">
                  <button onClick={selectAll} className="text-xs text-slate-500 hover:text-slate-300 cursor-default transition-colors">
                    Select all
                  </button>
                  <span className="text-slate-700">·</span>
                  <button onClick={clearAll} className="text-xs text-slate-500 hover:text-slate-300 cursor-default transition-colors">
                    Clear
                  </button>
                  <span className="text-slate-700">·</span>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 cursor-default select-none">
                    <input
                      type="checkbox"
                      checked={hideTracked}
                      onChange={(e) => setHideTracked(e.target.checked)}
                      className="rounded border-border bg-surface accent-violet-500"
                    />
                    Hide tracked
                  </label>
                  <div className="relative">
                    <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-700 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter…"
                      className="bg-surface border border-border rounded pl-6 pr-2 py-1 text-xs text-slate-400 placeholder-slate-700 focus:outline-none focus:border-violet-500/50 w-32"
                    />
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-panel border-b border-border">
                      <th className="w-8 px-3 py-2" />
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Name</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest hidden lg:table-cell">Path</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Branch</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">State</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest hidden sm:table-cell">Last commit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((repo, i) => {
                      const isTracked = repo.already_tracked;
                      const isSelected = selected.has(repo.path);
                      return (
                        <tr
                          key={repo.path}
                          onClick={() => !isTracked && toggleRepo(repo.path)}
                          className={`transition-colors ${
                            i < visible.length - 1 ? 'border-b border-border-subtle' : ''
                          } ${
                            isTracked
                              ? 'opacity-40 cursor-default'
                              : 'cursor-pointer hover:bg-hover'
                          } ${isSelected && !isTracked ? 'bg-violet-500/5' : ''}`}
                        >
                          <td className="px-3 py-2">
                            {isTracked ? (
                              <span className="text-slate-700 text-[10px]">tracked</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleRepo(repo.path)}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded border-border bg-surface accent-violet-500 cursor-default"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm text-slate-200 font-medium">{repo.name}</td>
                          <td className="px-3 py-2 text-xs text-slate-600 font-mono hidden lg:table-cell max-w-xs truncate">
                            {repo.path}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-500">
                            {repo.current_branch ? (
                              <span className="flex items-center gap-1">
                                <GitBranch size={11} className="text-slate-700" />
                                {repo.current_branch}
                              </span>
                            ) : (
                              <span className="text-slate-700">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {repo.is_dirty ? (
                              <span className="text-yellow-500">● dirty</span>
                            ) : (
                              <span className="text-green-500">✓ clean</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600 hidden sm:table-cell">
                            {relativeDate(repo.last_commit_date)}
                          </td>
                        </tr>
                      );
                    })}
                    {visible.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-xs text-slate-600">
                          No repos match the current filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Import button */}
              {selectableCount > 0 && (
                <div className="flex justify-end">
                  <Button variant="primary" size="sm" onClick={handleImport} disabled={importing || selected.size === 0}>
                    {importing ? (
                      <><Loader2 size={12} className="animate-spin" /> Importing…</>
                    ) : (
                      <>Import {selected.size} selected <ArrowRight size={12} /></>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
