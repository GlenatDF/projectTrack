import { invoke } from '@tauri-apps/api/core';
import type {
  DiscoveredRepo,
  FullScaffoldResult,
  Project,
  ProjectInitRequest,
  ProjectInitResult,
  ScaffoldResult,
} from '../types';

// ── Repo discovery ─────────────────────────────────────────────────────────────

export const discoverRepos = (rootPath: string): Promise<DiscoveredRepo[]> =>
  invoke('discover_repos', { rootPath });

export const bulkImportRepos = (
  repos: Array<{ name: string; path: string }>
): Promise<Project[]> =>
  invoke('bulk_import_repos', { repos });

export const chooseFolderMac = (): Promise<string | null> =>
  invoke('choose_folder_mac');

// ── Project init ───────────────────────────────────────────────────────────────

export const initNewProject = (config: ProjectInitRequest): Promise<ProjectInitResult> =>
  invoke('init_new_project', { config });

// ── Scaffold ───────────────────────────────────────────────────────────────────

export const checkGhCli = (): Promise<boolean> =>
  invoke('check_gh_cli');

export const scaffoldNewProject = (params: {
  projectName: string;
  description: string;
  createGithub: boolean;
  createVercel: boolean;
  createSupabase: boolean;
}): Promise<ScaffoldResult> =>
  invoke('scaffold_new_project', params);

export const scaffoldFullProject = (params: {
  projectName: string;
  description: string;
  mainGoal: string;
  createGithub: boolean;
  createVercel: boolean;
  createSupabase: boolean;
  createClaudeSkills: boolean;
  projectLevel: string;
}): Promise<FullScaffoldResult> =>
  invoke('scaffold_full_project', params);

export const scaffoldFromGithubTemplate = (params: {
  projectName: string;
  description: string;
  mainGoal: string;
  createVercel: boolean;
  createSupabase: boolean;
  createClaudeSkills: boolean;
  projectLevel: string;
}): Promise<FullScaffoldResult> =>
  invoke('scaffold_from_github_template', params);
