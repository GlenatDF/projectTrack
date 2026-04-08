import { invoke } from '@tauri-apps/api/core';
import type {
  AiPlanRun,
  AssembledPrompt,
  AuditRecord,
  AuditStoredResult,
  AuditWithFindings,
  ImportPlanResult,
  InProgressTask,
  MethodologyBlock,
  OpenerPrompt,
  ProjectDocument,
  ProjectPhase,
  ProjectPlan,
  ProjectTask,
  SessionTurn,
  SkillEntry,
} from '../types';

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
