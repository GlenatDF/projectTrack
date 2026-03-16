import type { Project, ProjectScan } from './types';

export type HealthLevel = 'red' | 'yellow' | 'green' | 'neutral';

export function computeHealth(
  project: Project,
  scan: ProjectScan | null | undefined
): HealthLevel {
  if (project.status === 'done' || project.status === 'paused') return 'neutral';
  if (project.status === 'blocked') return 'red';
  if (scan && !scan.is_valid_repo) return 'red';
  const hasRepo = project.local_repo_path.trim() !== '';
  const isStale = hasRepo && isOlderThanDays(project.last_scanned_at, 7);
  const isDirty = scan?.is_dirty ?? false;
  if (isStale && isDirty) return 'red';
  if (isStale || isDirty) return 'yellow';
  if (project.status === 'active' && !isStale && !isDirty) return 'green';
  return 'neutral';
}

export function isOlderThanDays(dateStr: string | null | undefined, days: number): boolean {
  if (!dateStr) return true;
  return Date.now() - new Date(dateStr).getTime() > days * 86400000;
}
