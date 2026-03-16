// ── Enums ─────────────────────────────────────────────────────────────────────

export type Status = 'active' | 'blocked' | 'paused' | 'done';
export type Phase =
  | 'idea'
  | 'planning'
  | 'scaffolding'
  | 'core_build'
  | 'debugging'
  | 'testing'
  | 'polishing'
  | 'shipped';
export type Priority = 'low' | 'medium' | 'high';
export type AiTool = 'claude' | 'chatgpt' | 'both' | 'other';

// ── Domain types ──────────────────────────────────────────────────────────────

export interface Project {
  id: number;
  name: string;
  description: string;
  local_repo_path: string;
  status: Status;
  phase: Phase;
  priority: Priority;
  ai_tool: AiTool;
  current_task: string;
  next_task: string;
  blocker: string;
  notes: string;
  created_at: string;
  updated_at: string;
  last_scanned_at: string | null;
  claude_startup_prompt: string;
  claude_prompt_mode: 'append' | 'replace';
  claude_priority_files: string;
  session_handoff_notes: string;
  startup_command: string;
  preferred_terminal: string;
}

export interface ProjectScan {
  id: number;
  project_id: number;
  scanned_at: string;
  current_branch: string | null;
  is_dirty: boolean;
  changed_files_count: number;
  untracked_files_count: number;
  staged_files_count: number;
  last_commit_hash: string | null;
  last_commit_date: string | null;
  last_commit_message: string | null;
  ahead_count: number | null;
  behind_count: number | null;
  is_valid_repo: boolean;
  error_message: string | null;
}

export interface DashboardStats {
  total: number;
  active: number;
  blocked: number;
  paused: number;
  done: number;
  stale: number;
  dirty_repos: number;
}

export interface DiscoveredRepo {
  name: string;
  path: string;
  is_valid_git: boolean;
  current_branch: string | null;
  is_dirty: boolean;
  last_commit_date: string | null;
  last_commit_message: string | null;
  already_tracked: boolean;
}

export interface ProjectFormData {
  name: string;
  description: string;
  local_repo_path: string;
  status: Status;
  phase: Phase;
  priority: Priority;
  ai_tool: AiTool;
  current_task: string;
  next_task: string;
  blocker: string;
  notes: string;
  claude_startup_prompt: string;
  claude_prompt_mode: 'append' | 'replace';
  claude_priority_files: string;
  session_handoff_notes: string;
  startup_command: string;
  preferred_terminal: string;
}

// ── Display helpers ───────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<Status, string> = {
  active: 'Active',
  blocked: 'Blocked',
  paused: 'Paused',
  done: 'Done',
};

export const PHASE_LABELS: Record<Phase, string> = {
  idea: 'Idea',
  planning: 'Planning',
  scaffolding: 'Scaffolding',
  core_build: 'Core Build',
  debugging: 'Debugging',
  testing: 'Testing',
  polishing: 'Polishing',
  shipped: 'Shipped',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const AI_TOOL_LABELS: Record<AiTool, string> = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  both: 'Both',
  other: 'Other',
};

export const ALL_STATUSES: Status[] = ['active', 'blocked', 'paused', 'done'];
export const ALL_PHASES: Phase[] = [
  'idea', 'planning', 'scaffolding', 'core_build',
  'debugging', 'testing', 'polishing', 'shipped',
];
export const ALL_PRIORITIES: Priority[] = ['low', 'medium', 'high'];
export const ALL_AI_TOOLS: AiTool[] = ['claude', 'chatgpt', 'both', 'other'];
