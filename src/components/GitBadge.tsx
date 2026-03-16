import { GitBranch, GitCommit, AlertCircle } from 'lucide-react';
import type { ProjectScan } from '../lib/types';
import { shortHash, relativeTime } from '../lib/utils';

interface Props {
  scan: ProjectScan | null;
  /** If true, show a compact one-line version */
  compact?: boolean;
}

export function GitBadge({ scan, compact = false }: Props) {
  if (!scan) {
    return (
      <span className="text-xs text-slate-500 italic">Not scanned</span>
    );
  }

  if (!scan.is_valid_repo) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-400">
        <AlertCircle size={12} />
        {scan.error_message ?? 'Invalid repo'}
      </span>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
        {scan.current_branch && (
          <span className="flex items-center gap-1">
            <GitBranch size={11} className="text-slate-500" />
            {scan.current_branch}
          </span>
        )}
        {scan.is_dirty && (
          <span className="text-yellow-400 font-medium">● dirty</span>
        )}
        {scan.last_commit_hash && (
          <span className="flex items-center gap-1 text-slate-500">
            <GitCommit size={11} />
            {shortHash(scan.last_commit_hash)}
          </span>
        )}
        {scan.last_commit_message && (
          <span className="text-slate-500 truncate max-w-[200px]">
            {scan.last_commit_message}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3 flex-wrap">
        {scan.current_branch && (
          <span className="flex items-center gap-1 text-sm text-slate-300">
            <GitBranch size={13} className="text-indigo-400" />
            {scan.current_branch}
          </span>
        )}
        {scan.is_dirty ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 text-xs font-medium">● dirty</span>
        ) : (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-xs">✓ clean</span>
        )}
        {(scan.ahead_count != null || scan.behind_count != null) && (
          <span className="text-xs text-slate-400">
            {scan.ahead_count ?? 0} ahead · {scan.behind_count ?? 0} behind
          </span>
        )}
      </div>

      {(scan.changed_files_count > 0 || scan.untracked_files_count > 0 || scan.staged_files_count > 0) && (
        <div className="flex gap-3 text-xs text-slate-400">
          {scan.staged_files_count > 0 && (
            <span className="text-green-400">{scan.staged_files_count} staged</span>
          )}
          {scan.changed_files_count > 0 && (
            <span className="text-yellow-400">{scan.changed_files_count} modified</span>
          )}
          {scan.untracked_files_count > 0 && (
            <span className="text-slate-400">{scan.untracked_files_count} untracked</span>
          )}
        </div>
      )}

      {scan.last_commit_hash && (
        <div className="flex items-start gap-1.5 text-xs text-slate-400">
          <GitCommit size={12} className="mt-0.5 shrink-0 text-slate-500" />
          <div>
            <span className="font-mono text-slate-500 mr-1.5">{shortHash(scan.last_commit_hash)}</span>
            <span className="text-slate-300">{scan.last_commit_message}</span>
            {scan.last_commit_date && (
              <span className="ml-1.5 text-slate-500">{relativeTime(scan.last_commit_date)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
