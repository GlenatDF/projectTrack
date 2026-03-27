import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, FolderOpen, AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import type { Project, ProjectScan } from '../lib/types';
import { StatusBadge } from './StatusBadge';
import { PhaseBadge } from './PhaseBadge';
import { PriorityDot } from './PriorityDot';
import { HealthDot } from './HealthDot';
import { relativeTime, shortHash, projectTimestampLabel } from '../lib/utils';
import { computeHealth } from '../lib/health';

interface Props {
  project: Project;
  latestScan?: ProjectScan | null;
  onScan?: () => Promise<ProjectScan>;
  onStatusChange?: (status: string) => Promise<Project>;
}

export function ProjectCard({ project, latestScan, onScan, onStatusChange }: Props) {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [localScan, setLocalScan] = useState<ProjectScan | null | undefined>(latestScan);

  const hasRepo = project.local_repo_path.trim() !== '';
  const activeScan = localScan ?? latestScan;
  const repoMissing = hasRepo && activeScan && !activeScan.is_valid_repo;

  async function doScan() {
    if (!onScan) return;
    setScanning(true);
    try {
      const scan = await onScan();
      setLocalScan(scan);
    } finally {
      setScanning(false);
    }
  }

  return (
    <div
      className={`relative bg-card border border-border rounded-lg p-4 cursor-pointer hover:bg-hover hover:border-violet-500/25 transition-all group ${project.priority === 'high' ? 'border-l-2 border-l-red-500/50' : ''}`}
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      {/* Quick action overlay */}
      {(onScan || onStatusChange) && (
        <div className="absolute top-2 right-8 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 z-10">
          {onScan && (
            <button
              title="Scan now"
              disabled={scanning}
              onClick={(e) => { e.stopPropagation(); doScan(); }}
              className="p-1 rounded bg-surface hover:bg-hover text-slate-400 disabled:opacity-50 cursor-default"
            >
              {scanning ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            </button>
          )}
          {onStatusChange && project.status !== 'active' && (
            <button
              title="Mark Active"
              onClick={(e) => { e.stopPropagation(); onStatusChange('active'); }}
              className="p-1 rounded bg-surface hover:bg-hover text-green-400 cursor-default"
            >
              <CheckCircle2 size={11} />
            </button>
          )}
          {onStatusChange && project.status !== 'blocked' && (
            <button
              title="Mark Blocked"
              onClick={(e) => { e.stopPropagation(); onStatusChange('blocked'); }}
              className="p-1 rounded bg-surface hover:bg-hover text-red-400 cursor-default"
            >
              <AlertCircle size={11} />
            </button>
          )}
          {onStatusChange && project.status !== 'done' && (
            <button
              title="Mark Done"
              onClick={(e) => { e.stopPropagation(); onStatusChange('done'); }}
              className="p-1 rounded bg-surface hover:bg-hover text-slate-400 cursor-default"
            >
              <CheckCircle2 size={11} />
            </button>
          )}
        </div>
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <StatusBadge status={project.status} />
          <PhaseBadge phase={project.phase} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <HealthDot level={computeHealth(project, activeScan)} />
          <PriorityDot priority={project.priority} />
        </div>
      </div>

      {/* Name */}
      <h3 className="text-slate-100 font-semibold text-sm mb-1 group-hover:text-violet-300 transition-colors truncate">
        {project.name}
      </h3>

      {/* Description */}
      {project.description && (
        <p className="text-slate-500 text-xs mb-2 line-clamp-2 leading-relaxed">
          {project.description}
        </p>
      )}

      {/* Current task */}
      {project.current_task && (
        <div className="text-xs mb-2 truncate">
          <span className="text-slate-600">Task: </span>
          <span className="text-slate-400">{project.current_task}</span>
        </div>
      )}

      {/* Blocker */}
      {project.blocker && (
        <div className="text-xs text-red-400 mb-2 truncate flex items-center gap-1">
          <span>⊘</span>
          <span className="truncate">{project.blocker}</span>
        </div>
      )}

      {/* Git summary */}
      {hasRepo && (
        <div className="border-t border-border-subtle pt-2 mt-2">
          {repoMissing ? (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle size={11} />
              Repo missing —{' '}
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/projects/${project.id}`); }}
                className="underline hover:text-red-300 transition-colors cursor-default"
              >
                relink
              </button>
            </span>
          ) : activeScan ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
              {activeScan.current_branch && (
                <span className="flex items-center gap-1">
                  <GitBranch size={11} />
                  {activeScan.current_branch}
                </span>
              )}
              {activeScan.is_dirty && (
                <span className="text-yellow-500 font-medium">● dirty</span>
              )}
              {activeScan.last_commit_hash && (
                <span className="font-mono text-slate-600">
                  {shortHash(activeScan.last_commit_hash)}
                </span>
              )}
              {activeScan.last_commit_date && (
                <span>{relativeTime(activeScan.last_commit_date)}</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-slate-600">
              <FolderOpen size={11} />
              <span className="font-mono truncate">{project.local_repo_path.split('/').pop()}</span>
              <span>— not scanned</span>
            </div>
          )}
        </div>
      )}

      {/* Timestamp */}
      <div className="flex items-center justify-end mt-2 text-[11px] text-slate-600">
        {projectTimestampLabel(project, activeScan)}
      </div>
    </div>
  );
}
