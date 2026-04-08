import { invoke } from '@tauri-apps/api/core';
import type {
  AppSettings,
  DashboardStats,
  Project,
  ProjectFormData,
  ProjectScan,
  UpdateInfo,
} from '../types';

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

export const archiveGithubRepo = (id: number): Promise<string> =>
  invoke('archive_github_repo', { id });

// ── Scanning ──────────────────────────────────────────────────────────────────

export const scanProject = (projectId: number): Promise<ProjectScan> =>
  invoke('scan_project', { projectId });

export const getProjectScans = (projectId: number, limit?: number): Promise<ProjectScan[]> =>
  invoke('get_project_scans', { projectId, limit });

/** Fetch the latest scan for every project in one query — use on the dashboard. */
export const getLatestScans = (): Promise<ProjectScan[]> =>
  invoke('get_latest_scans');

export const validateRepoPath = (path: string): Promise<boolean> =>
  invoke('validate_repo_path', { path });

// ── Dashboard ─────────────────────────────────────────────────────────────────

export const getDashboardStats = (): Promise<DashboardStats> =>
  invoke('get_dashboard_stats');

// ── File system ───────────────────────────────────────────────────────────────

export const openUrl = (url: string): Promise<void> =>
  invoke('open_url', { url });

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

/** Open Claude in a terminal at the project's repo path and copy the bootstrap prompt to clipboard. */
export const runClaudeBootstrap = (projectId: number): Promise<string> =>
  invoke('run_claude_bootstrap', { projectId });

/** Compose and copy the bootstrap prompt for a project to clipboard. Returns the prompt text. */
export const copyBootstrapPrompt = (projectId: number): Promise<string> =>
  invoke('copy_bootstrap_prompt', { projectId });

export const runGitStatus = (path: string): Promise<string> =>
  invoke('run_git_status', { path });

/** Read up to 5 000 bytes from a file inside the project's repo root.
 *  Throws with message "not_found" | "unsafe_path" | "not_a_file" on failure. */
export const readProjectFile = (repoPath: string, relativePath: string): Promise<string> =>
  invoke('read_project_file', { repoPath, relativePath });

export const isItermAvailable = (): Promise<boolean> =>
  invoke('is_iterm_available');

// ── Export / Import ───────────────────────────────────────────────────────────

export const exportProjects = (): Promise<string> =>
  invoke('export_projects');

export const importProjects = (json: string): Promise<number> =>
  invoke('import_projects', { json });

// ── Settings ───────────────────────────────────────────────────────────────────

export const getSettings = (): Promise<Record<string, string>> =>
  invoke('get_settings');

export const updateSetting = (key: keyof AppSettings, value: string): Promise<void> =>
  invoke('update_setting', { key, value });

// ── Update ─────────────────────────────────────────────────────────────────────

export const checkForUpdate = (): Promise<UpdateInfo | null> =>
  invoke('check_for_update');

export const publishCurrentVersion = (notes: string): Promise<string> =>
  invoke('publish_current_version', { notes });
