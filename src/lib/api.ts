import { invoke } from '@tauri-apps/api/core';
import type {
  DashboardStats,
  DiscoveredRepo,
  Project,
  ProjectFormData,
  ProjectScan,
} from './types';

// ── Projects ──────────────────────────────────────────────────────────────────

export const getProjects = (): Promise<Project[]> =>
  invoke('get_projects');

export const getProject = (id: number): Promise<Project> =>
  invoke('get_project', { id });

export const createProject = (project: ProjectFormData): Promise<Project> =>
  invoke('create_project', { project });

export const updateProject = (id: number, project: ProjectFormData): Promise<Project> =>
  invoke('update_project', { id, project });

export const updateProjectStatus = (id: number, status: string): Promise<Project> =>
  invoke('update_project_status', { id, status });

/** Relink a project to a new (or moved) local repo path. */
export const relinkRepoPath = (id: number, path: string): Promise<Project> =>
  invoke('relink_repo_path', { id, path });

export const deleteProject = (id: number): Promise<void> =>
  invoke('delete_project', { id });

// ── Scanning ──────────────────────────────────────────────────────────────────

export const scanProject = (projectId: number): Promise<ProjectScan> =>
  invoke('scan_project', { projectId });

export const getProjectScans = (projectId: number, limit?: number): Promise<ProjectScan[]> =>
  invoke('get_project_scans', { projectId, limit });

export const validateRepoPath = (path: string): Promise<boolean> =>
  invoke('validate_repo_path', { path });

// ── Dashboard ─────────────────────────────────────────────────────────────────

export const getDashboardStats = (): Promise<DashboardStats> =>
  invoke('get_dashboard_stats');

// ── File system ───────────────────────────────────────────────────────────────

export const openFolder = (path: string): Promise<void> =>
  invoke('open_folder', { path });

export const openInVscode = (path: string): Promise<void> =>
  invoke('open_in_vscode', { path });

export const openInTerminal = (path: string): Promise<void> =>
  invoke('open_in_terminal', { path });

export const openInIterm = (path: string): Promise<void> =>
  invoke('open_in_iterm', { path });

export const runClaudeHere = (path: string): Promise<void> =>
  invoke('run_claude_here', { path });

export const runGitStatus = (path: string): Promise<string> =>
  invoke('run_git_status', { path });

export const isItermAvailable = (): Promise<boolean> =>
  invoke('is_iterm_available');

// ── Export / Import ───────────────────────────────────────────────────────────

export const exportProjects = (): Promise<string> =>
  invoke('export_projects');

export const importProjects = (json: string): Promise<number> =>
  invoke('import_projects', { json });

// ── Repo discovery ─────────────────────────────────────────────────────────────

export const discoverRepos = (rootPath: string): Promise<DiscoveredRepo[]> =>
  invoke('discover_repos', { rootPath });

export const bulkImportRepos = (
  repos: Array<{ name: string; path: string }>
): Promise<Project[]> =>
  invoke('bulk_import_repos', { repos });

export const chooseFolderMac = (): Promise<string | null> =>
  invoke('choose_folder_mac');
