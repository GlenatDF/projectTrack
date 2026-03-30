import { invoke } from '@tauri-apps/api/core';
import type {
  AiPlanRun,
  AppSettings,
  AssembledPrompt,
  AuditRecord,
  AuditStoredResult,
  AuditWithFindings,
  DashboardStats,
  DiscoveredRepo,
  FullScaffoldResult,
  ImportPlanResult,
  InProgressTask,
  MethodologyBlock,
  OpenerPrompt,
  Project,
  ProjectDocument,
  ProjectFormData,
  ProjectInitRequest,
  ProjectInitResult,
  ProjectPhase,
  ProjectPlan,
  ProjectScan,
  ProjectTask,
  ScaffoldResult,
  SessionTurn,
  SkillEntry,
  UpdateInfo,
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

/** Fetch the latest scan for every project in one query — use on the dashboard. */
export const getLatestScans = (): Promise<ProjectScan[]> =>
  invoke('get_latest_scans');

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

/** Open Claude in a terminal at the project's repo path and copy the bootstrap prompt to clipboard. */
export const runClaudeBootstrap = (projectId: number): Promise<string> =>
  invoke('run_claude_bootstrap', { projectId });

/** Compose and copy the bootstrap prompt for a project to clipboard. Returns the prompt text. */
export const copyBootstrapPrompt = (projectId: number): Promise<string> =>
  invoke('copy_bootstrap_prompt', { projectId });

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

// ── Planning: Documents ────────────────────────────────────────────────────────

export const getProjectDocuments = (projectId: number): Promise<ProjectDocument[]> =>
  invoke('get_project_documents', { projectId });

export const updateProjectDocument = (
  projectId: number,
  docType: string,
  content: string,
): Promise<ProjectDocument> =>
  invoke('update_project_document', { projectId, docType, content });

export const updateDocumentStatus = (
  projectId: number,
  docType: string,
  status: string,
): Promise<ProjectDocument> =>
  invoke('update_document_status', { projectId, docType, status });

export const regenerateScaffold = (projectId: number): Promise<ProjectDocument[]> =>
  invoke('regenerate_scaffold', { projectId });

// ── Planning: Methodology ──────────────────────────────────────────────────────

export const getMethodologyBlocks = (): Promise<MethodologyBlock[]> =>
  invoke('get_methodology_blocks');

export const updateMethodologyBlock = (
  slug: string,
  content: string,
  isActive: boolean,
): Promise<MethodologyBlock> =>
  invoke('update_methodology_block', { slug, content, isActive });

// ── Planning: Prompt assembly & plan import ────────────────────────────────────

/** Assemble the planning prompt, copy to clipboard, return prompt + warnings. */
export const assemblePlanningPrompt = (projectId: number): Promise<AssembledPrompt> =>
  invoke('assemble_planning_prompt', { projectId });

/** Pipe the planning prompt to `claude --print` and return the raw response. */
export const runPlanWithClaudeCli = (projectId: number): Promise<string> =>
  invoke('run_plan_with_claude_cli', { projectId });

/** Import an AI plan response. Returns counts of imported/preserved records. */
export const importPlanResponse = (
  projectId: number,
  promptSent: string,
  rawResponse: string,
): Promise<ImportPlanResult> =>
  invoke('import_plan_response', { projectId, promptSent, rawResponse });

// ── Planning: Plan read / status updates ──────────────────────────────────────

export const getProjectPlan = (projectId: number): Promise<ProjectPlan> =>
  invoke('get_project_plan', { projectId });

export const updateTaskStatus = (
  taskId: number,
  projectId: number,
  status: string,
): Promise<ProjectTask> =>
  invoke('update_task_status', { taskId, projectId, status });

export const updateTaskProgressNote = (
  taskId: number,
  projectId: number,
  note: string,
): Promise<ProjectTask> =>
  invoke('update_task_progress_note', { taskId, projectId, note });

export const updatePhaseStatus = (
  phaseId: number,
  projectId: number,
  status: string,
): Promise<ProjectPhase> =>
  invoke('update_phase_status', { phaseId, projectId, status });

export const getAiPlanRuns = (projectId: number): Promise<AiPlanRun[]> =>
  invoke('get_ai_plan_runs', { projectId });

export const getInProgressTasks = (): Promise<InProgressTask[]> =>
  invoke('get_in_progress_tasks');

// ── Claude session ─────────────────────────────────────────────────────────────

export const getOpenerPrompt = (projectId: number): Promise<OpenerPrompt> =>
  invoke('get_opener_prompt', { projectId });

export const startClaudeSession = (projectId: number): Promise<SessionTurn> =>
  invoke('start_claude_session', { projectId });

export const sendSessionMessage = (
  projectId: number,
  message: string,
): Promise<SessionTurn> =>
  invoke('send_session_message', { projectId, message });

export const resetClaudeSession = (projectId: number): Promise<void> =>
  invoke('reset_claude_session', { projectId });

export const updateSessionNotes = (projectId: number, notes: string): Promise<void> =>
  invoke('update_session_notes', { projectId, notes });

// ── Settings ───────────────────────────────────────────────────────────────────

export const getSettings = (): Promise<Record<string, string>> =>
  invoke('get_settings');

export const updateSetting = (key: keyof AppSettings, value: string): Promise<void> =>
  invoke('update_setting', { key, value });

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
}): Promise<FullScaffoldResult> =>
  invoke('scaffold_full_project', params);

// ── Audits ────────────────────────────────────────────────────────────────────

export const assembleAuditPrompt = (projectId: number, auditKind: string, auditDepth: string): Promise<AssembledPrompt> =>
  invoke('assemble_audit_prompt', { projectId, auditKind, auditDepth });

export const runAuditWithClaudeCli = (projectId: number, auditKind: string, auditDepth: string): Promise<string> =>
  invoke('run_audit_with_claude_cli', { projectId, auditKind, auditDepth });

export const storeAuditResult = (
  projectId: number,
  auditKind: string,
  auditDepth: string,
  rawOutput: string,
): Promise<AuditStoredResult> =>
  invoke('store_audit_result', { projectId, auditKind, auditDepth, rawOutput });

export const getProjectAudits = (projectId: number): Promise<AuditRecord[]> =>
  invoke('get_project_audits', { projectId });

export const getAuditDetail = (auditId: number): Promise<AuditWithFindings | null> =>
  invoke('get_audit_detail', { auditId });

export const updateFindingStatus = (
  findingId: number,
  projectId: number,
  status: string,
): Promise<void> =>
  invoke('update_finding_status', { findingId, projectId, status });

export const createTaskFromFinding = (findingId: number, projectId: number): Promise<number> =>
  invoke('create_task_from_finding', { findingId, projectId });

export const checkForUpdate = (): Promise<UpdateInfo | null> =>
  invoke('check_for_update');

export const publishCurrentVersion = (notes: string): Promise<string> =>
  invoke('publish_current_version', { notes });

// ── Skills library ─────────────────────────────────────────────────────────────

export const fetchSkillsIndex = (): Promise<SkillEntry[]> =>
  invoke('fetch_skills_index');

export const fetchSkillContent = (path: string): Promise<string> =>
  invoke('fetch_skill_content', { path });

export const getInstalledSkills = (projectId: number): Promise<string[]> =>
  invoke('get_installed_skills', { projectId });

export const installSkill = (
  projectId: number,
  skillName: string,
  category: string,
  content: string,
  description: string,
): Promise<void> =>
  invoke('install_skill', { projectId, skillName, category, content, description });
