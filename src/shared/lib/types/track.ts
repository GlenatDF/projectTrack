// ── Planning types ─────────────────────────────────────────────────────────────

export type DocStatus = 'draft' | 'reviewed' | 'final';
export type TaskStatus = 'pending' | 'in_progress' | 'paused' | 'blocked' | 'done' | 'skipped';
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
  progress_note: string;
  started_at: string | null;
  completed_at: string | null;
  last_worked_at: string | null;
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

/** A planning task currently marked in_progress, with project context. */
export interface InProgressTask {
  id: number;
  project_id: number;
  project_name: string;
  title: string;
  category: string;
  status: TaskStatus;
}

export interface ImportPlanResult {
  phases_imported: number;
  tasks_imported: number;
  risks_imported: number;
  assumptions_imported: number;
  preserved_task_count: number;
  warnings: string[];
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

// ── Claude session types ───────────────────────────────────────────────────────

export interface OpenerPrompt {
  prompt: string;
  session_id: string;
}

export interface SessionTurn {
  response: string;
  session_id: string;
}

// ── Audits ────────────────────────────────────────────────────────────────────

export type AuditKind = 'full_codebase' | 'security' | 'performance' | 'reliability';
export type AuditDepth = 'quick' | 'full';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';
export type FindingClassification = 'confirmed' | 'likely' | 'needs_verification';
export type FindingStatus = 'open' | 'resolved' | 'wont_fix' | 'task_created';
export type FixSize = 'small' | 'medium' | 'large';

export interface AuditRecord {
  id: number;
  project_id: number;
  audit_kind: AuditKind;
  audit_depth: AuditDepth;
  score: number | null;
  score_label: string;
  summary: string;
  /** JSON-encoded string array */
  strengths: string;
  /** JSON-encoded string array */
  recommendations: string;
  /** JSON-encoded string array */
  files_reviewed: string;
  raw_output: string;
  raw_json: string | null;
  created_at: string;
}

export interface AuditFinding {
  id: number;
  audit_id: number;
  project_id: number;
  severity: FindingSeverity;
  category: string;
  title: string;
  description: string;
  file_ref: string;
  impact: string;
  fix_size: FixSize | null;
  classification: FindingClassification;
  status: FindingStatus;
  task_id: number | null;
  created_at: string;
}

export interface AuditWithFindings {
  audit: AuditRecord;
  findings: AuditFinding[];
}

export interface AuditStoredResult {
  audit_id: number;
  findings_count: number;
}

// ── Skills library ─────────────────────────────────────────────────────────────

export interface SkillEntry {
  category: string;
  name: string;
  path: string;
}

// ── Planning display helpers ───────────────────────────────────────────────────

export const DOC_TYPE_LABELS: Record<string, string> = {
  brief:              'Project Brief',
  prd:                'Product Requirements',
  tech_spec:          'Technical Specification',
  ai_instructions:    'AI Instructions',
  risks:              'Risks / Assumptions / Dependencies',
  decisions:          'Decision Log',
  handoff:            'Session Handoff',
  scratchpad:         'Scratchpad',
  operating_standard: 'Operating Standard',
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
