export type TaskType   = 'feature' | 'bug' | 'refactor' | 'test' | 'docs' | 'chore';
export type RiskLevel = 'low' | 'medium' | 'high';
export type TaskStatus = 'draft' | 'ready' | 'running' | 'review' | 'done' | 'failed';
export type RunStatus  = 'pending' | 'running' | 'done' | 'failed';

export interface TaskRun {
  id:               string;
  task_id:          string;
  project_id:       string;
  prompt:           string;        // snapshot at creation — never re-derived
  status:           RunStatus;
  created_at:       string;
  completed_at?:    string;
  notes?:           string;
  result_summary?:  string;        // outcome written when marking done/failed
  raw_output?:      string;        // full response pasted back from Claude
  changed_summary?: string;        // short prose — "Added X, updated Y"
  files_touched?:   string[];      // file paths affected by this run
}

export interface Task {
  id: string;
  project_id: string;
  raw_input: string;
  title: string;
  task_type: TaskType;
  goal: string;
  scope: string[];
  out_of_scope: string[];
  success_criteria: string[];
  risk_level: RiskLevel;
  needs_human_review: boolean;
  ambiguities: string[];
  status: TaskStatus;
  created_at: string;
}
