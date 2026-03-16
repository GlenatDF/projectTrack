import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderSearch,
  FolderOpen,
  Search,
  GitBranch,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { discoverRepos, bulkImportRepos, chooseFolderMac } from '../lib/api';
import type { DiscoveredRepo } from '../lib/types';

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

  const showResults = repos.length > 0;

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <FolderSearch size={18} className="text-indigo-400" />
          <h1 className="text-base font-semibold text-slate-200">Discover Repos</h1>
        </div>
        <p className="text-xs text-slate-500">
          Point to a parent directory to find and import git repositories in bulk.
        </p>
      </div>

      <div className="flex-1 px-6 py-5 space-y-5 min-w-0">
        {/* Path input row */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={rootPath}
            onChange={(e) => setRootPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            placeholder="/Users/you/Projects"
            disabled={scanning}
            className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          />
          <button
            onClick={handleBrowse}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-slate-400 hover:text-slate-200 hover:bg-hover disabled:opacity-50 transition-colors"
          >
            <FolderOpen size={14} />
            Browse…
          </button>
          <button
            onClick={handleScan}
            disabled={scanning || !rootPath.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {scanning ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Scanning…
              </>
            ) : (
              <>
                <Search size={14} />
                Scan
              </>
            )}
          </button>
        </div>

        {/* Error */}
        {scanError && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
            <AlertCircle size={14} />
            {scanError}
          </div>
        )}

        {/* Success banner */}
        {importResult && (
          <div className="flex items-center justify-between gap-2 text-sm text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={14} />
              {importResult}
            </span>
            <Link
              to="/projects"
              className="flex items-center gap-1 text-green-300 hover:text-green-200 font-medium"
            >
              View Projects <ArrowRight size={12} />
            </Link>
          </div>
        )}

        {/* Results */}
        {showResults && (
          <div className="space-y-3">
            {/* Summary + filters */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-xs text-slate-500">
                Found {repos.length}
                {trackedCount > 0 && ` · ${trackedCount} already tracked`}
                {selected.size > 0 && ` · ${selected.size} selected`}
              </p>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={selectAll}
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Select all
                </button>
                <span className="text-slate-700">·</span>
                <button
                  onClick={clearAll}
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Clear
                </button>
                <span className="text-slate-700">·</span>
                <label className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideTracked}
                    onChange={(e) => setHideTracked(e.target.checked)}
                    className="rounded border-border bg-surface accent-indigo-500"
                  />
                  Hide tracked
                </label>
                <div className="relative">
                  <Search
                    size={12}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter…"
                    className="bg-surface border border-border rounded-md pl-6 pr-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500 w-36"
                  />
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface/50">
                    <th className="w-8 px-3 py-2" />
                    <th className="px-3 py-2 text-left text-slate-500 font-medium">Name</th>
                    <th className="px-3 py-2 text-left text-slate-500 font-medium hidden lg:table-cell">
                      Path
                    </th>
                    <th className="px-3 py-2 text-left text-slate-500 font-medium">Branch</th>
                    <th className="px-3 py-2 text-left text-slate-500 font-medium">State</th>
                    <th className="px-3 py-2 text-left text-slate-500 font-medium hidden sm:table-cell">
                      Last commit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((repo) => {
                    const isTracked = repo.already_tracked;
                    const isSelected = selected.has(repo.path);
                    return (
                      <tr
                        key={repo.path}
                        onClick={() => !isTracked && toggleRepo(repo.path)}
                        className={`border-b border-border last:border-0 transition-colors ${
                          isTracked
                            ? 'opacity-40 cursor-default'
                            : 'cursor-pointer hover:bg-hover'
                        } ${isSelected && !isTracked ? 'bg-indigo-500/5' : ''}`}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-2">
                          {isTracked ? (
                            <span className="text-slate-600 text-[10px] leading-none">tracked</span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRepo(repo.path)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-border bg-surface accent-indigo-500"
                            />
                          )}
                        </td>

                        {/* Name */}
                        <td className="px-3 py-2 text-slate-200 font-medium">{repo.name}</td>

                        {/* Path */}
                        <td className="px-3 py-2 text-slate-500 font-mono hidden lg:table-cell max-w-xs truncate">
                          {repo.path}
                        </td>

                        {/* Branch */}
                        <td className="px-3 py-2 text-slate-400">
                          {repo.current_branch ? (
                            <span className="flex items-center gap-1">
                              <GitBranch size={11} className="text-slate-600" />
                              {repo.current_branch}
                            </span>
                          ) : (
                            <span className="text-slate-700">—</span>
                          )}
                        </td>

                        {/* Dirty indicator */}
                        <td className="px-3 py-2">
                          {repo.is_dirty ? (
                            <span className="text-amber-500">● dirty</span>
                          ) : (
                            <span className="text-green-600">✓ clean</span>
                          )}
                        </td>

                        {/* Last commit */}
                        <td className="px-3 py-2 text-slate-500 hidden sm:table-cell">
                          {relativeDate(repo.last_commit_date)}
                        </td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-600">
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
                <button
                  onClick={handleImport}
                  disabled={importing || selected.size === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {importing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Importing…
                    </>
                  ) : (
                    <>
                      Import {selected.size} Selected
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
