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

// ── Planning types ─────────────────────────────────────────────────────────────

export type DocStatus = 'draft' | 'reviewed' | 'final';
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'skipped';
export type PhaseStatus = 'pending' | 'in_progress' | 'done' | 'skipped';
export type RiskLevel = 'low' | 'medium' | 'high';
export type TaskCategory =
  | 'build' | 'design' | 'test' | 'infra' | 'docs' | 'review' | 'deploy' | 'other';

export interface MethodologyBlock {
  id: number;
  slug: string;
  title: string;
  category: string;
  content: string;
  is_active: boolean;
  sort_order: number;
}

export interface ProjectDocument {
  id: number;
  project_id: number;
  doc_type: string;
  title: string;
  content: string;
  status: DocStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectPhase {
  id: number;
  project_id: number;
  phase_number: number;
  name: string;
  description: string;
  goals: string; // JSON array string
  estimated_duration: string;
  depends_on_phase: number | null;
  status: PhaseStatus;
  ai_generated: boolean;
  user_modified: boolean;
  created_at: string;
}

export interface ProjectTask {
  id: number;
  project_id: number;
  phase_id: number | null;
  title: string;
  description: string;
  category: TaskCategory;
  effort_estimate: string;
  status: TaskStatus;
  sort_order: number;
  ai_generated: boolean;
  user_modified: boolean;
  created_at: string;
}

export interface ProjectRisk {
  id: number;
  project_id: number;
  title: string;
  description: string;
  likelihood: RiskLevel;
  impact: RiskLevel;
  mitigation: string;
  status: string;
  ai_generated: boolean;
  created_at: string;
}

export interface ProjectAssumption {
  id: number;
  project_id: number;
  title: string;
  description: string;
  category: string;
  status: string;
  ai_generated: boolean;
  created_at: string;
}

export interface AiPlanRun {
  id: number;
  project_id: number;
  template_slug: string;
  parsed_ok: boolean;
  error_message: string | null;
  phases_count: number;
  tasks_count: number;
  risks_count: number;
  created_at: string;
}

export interface ImportPlanResult {
  phases_imported: number;
  tasks_imported: number;
  risks_imported: number;
  assumptions_imported: number;
  preserved_task_count: number;
}

export interface AssembledPrompt {
  prompt: string;
  warnings: string[];
}

export interface ProjectPlan {
  phases: ProjectPhase[];
  tasks: ProjectTask[];
  risks: ProjectRisk[];
  assumptions: ProjectAssumption[];
}

// ── Planning display helpers ───────────────────────────────────────────────────

export const DOC_TYPE_LABELS: Record<string, string> = {
  brief:           'Project Brief',
  prd:             'Product Requirements',
  tech_spec:       'Technical Specification',
  ai_instructions: 'AI Instructions',
  risks:           'Risk Register',
  decisions:       'Decision Log',
  handoff:         'Session Handoff',
  scratchpad:      'Scratchpad',
};

export const TASK_CATEGORY_COLORS: Record<TaskCategory, string> = {
  build:  'bg-blue-500/20 text-blue-300',
  design: 'bg-purple-500/20 text-purple-300',
  test:   'bg-green-500/20 text-green-300',
  infra:  'bg-orange-500/20 text-orange-300',
  docs:   'bg-yellow-500/20 text-yellow-300',
  review: 'bg-cyan-500/20 text-cyan-300',
  deploy: 'bg-rose-500/20 text-rose-300',
  other:  'bg-gray-500/20 text-gray-300',
};

export const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
  low:    'bg-green-500/20 text-green-300',
  medium: 'bg-yellow-500/20 text-yellow-300',
  high:   'bg-red-500/20 text-red-300',
};
