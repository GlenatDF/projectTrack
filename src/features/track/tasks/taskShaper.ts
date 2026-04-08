import type { Task, TaskType, RiskLevel } from './types';

// ── Configuration ──────────────────────────────────────────────────────────────
//
// To enable AI shaping, create a .env.local file at the project root with:
//
//   VITE_OPENAI_API_KEY=sk-...
//
// Any OpenAI-compatible API endpoint will work (OpenAI, Together, etc.).
// Without the key set, shapeTaskAI throws — use the explicit mock button in the UI.

const SHAPING_PROMPT = `You are a task shaping system for software engineering work.

Your job is to convert a raw, vague engineering request into a structured, bounded, and executable task.

CRITICAL RULES:
- Return JSON only. No explanation.
- Do NOT write implementation code.
- Do NOT assume missing details silently — instead list ambiguities.
- Keep scope narrow and realistic.
- Prefer smaller, safer tasks over large ones.
- Explicitly define what is NOT included (out_of_scope).
- If the task is too vague, still attempt to shape it but flag uncertainty.

INPUT:
{{RAW_TASK}}

OUTPUT FORMAT:

{
  "task_type": "feature | bug | refactor | test | docs | chore",
  "title": "Clear, concise task title",
  "goal": "What outcome this task is trying to achieve",
  "scope": [
    "Specific area of code or functionality"
  ],
  "out_of_scope": [
    "Explicitly excluded areas"
  ],
  "success_criteria": [
    "Observable, testable outcomes"
  ],
  "risk_level": "low | medium | high",
  "needs_human_review": true,
  "ambiguities": []
}

VALIDATION RULES:
- scope must not be empty
- success_criteria must be concrete and testable
- out_of_scope must not be empty
- title must not be vague
- goal must describe an outcome, not an action

Return only valid JSON.`;

// ── AI response validation ─────────────────────────────────────────────────────

const VALID_TASK_TYPES = new Set<string>(['feature', 'bug', 'refactor', 'test', 'docs', 'chore']);
const VALID_RISK_LEVELS = new Set<string>(['low', 'medium', 'high']);

function requireNonEmptyStringArray(val: unknown, field: string): string[] {
  if (!Array.isArray(val) || val.length === 0)
    throw new Error(`AI response: '${field}' must be a non-empty array`);
  const strings = val.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  if (strings.length === 0)
    throw new Error(`AI response: '${field}' must contain at least one non-empty string`);
  return strings;
}

interface ValidatedAIFields {
  title: string;
  task_type: TaskType;
  goal: string;
  scope: string[];
  out_of_scope: string[];
  success_criteria: string[];
  risk_level: RiskLevel;
  ambiguities: string[];
}

function validateAIResponse(parsed: unknown): ValidatedAIFields {
  if (typeof parsed !== 'object' || parsed === null)
    throw new Error('AI response is not a JSON object');

  const p = parsed as Record<string, unknown>;

  if (typeof p.title !== 'string' || !p.title.trim())
    throw new Error("AI response: 'title' must be a non-empty string");

  if (!VALID_TASK_TYPES.has(p.task_type as string))
    throw new Error(`AI response: 'task_type' must be one of: ${[...VALID_TASK_TYPES].join(', ')} (got: ${JSON.stringify(p.task_type)})`);

  if (typeof p.goal !== 'string' || !p.goal.trim())
    throw new Error("AI response: 'goal' must be a non-empty string");

  if (!VALID_RISK_LEVELS.has(p.risk_level as string))
    throw new Error(`AI response: 'risk_level' must be one of: ${[...VALID_RISK_LEVELS].join(', ')} (got: ${JSON.stringify(p.risk_level)})`);

  const scope            = requireNonEmptyStringArray(p.scope,            'scope');
  const out_of_scope     = requireNonEmptyStringArray(p.out_of_scope,     'out_of_scope');
  const success_criteria = requireNonEmptyStringArray(p.success_criteria, 'success_criteria');

  // ambiguities may be empty, but must be an array of strings if present
  const ambiguities = Array.isArray(p.ambiguities)
    ? p.ambiguities.filter((x): x is string => typeof x === 'string')
    : [];

  return {
    title:            p.title.trim(),
    task_type:        p.task_type as TaskType,
    goal:             p.goal.trim(),
    scope,
    out_of_scope,
    success_criteria,
    risk_level:       p.risk_level as RiskLevel,
    ambiguities,
  };
}

// ── AI shaping ─────────────────────────────────────────────────────────────────

/** Calls the OpenAI API to shape a task. Throws on any failure — no silent fallback. */
export async function shapeTaskAI(rawInput: string): Promise<Task> {
  const apiKey = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim();
  if (!apiKey) throw new Error('VITE_OPENAI_API_KEY not configured');

  const prompt = SHAPING_PROMPT.replace('{{RAW_TASK}}', rawInput);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const content: string | undefined = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from API');

  const parsed = JSON.parse(content);
  const validated = validateAIResponse(parsed);

  return {
    id:               `task-${Date.now()}`,
    project_id:       '',
    status:           'draft' as const,
    raw_input:        rawInput,
    needs_human_review: true,
    created_at:       new Date().toISOString(),
    ...validated,
  };
}

// ── Mock shaping (keyword heuristics) ─────────────────────────────────────────

const TYPE_KEYWORDS: Array<[TaskType, string[]]> = [
  ['bug',      ['fix', 'bug', 'error', 'broken', 'crash', 'regression', 'issue', 'failing']],
  ['refactor', ['refactor', 'clean', 'reorganise', 'reorganize', 'restructure', 'simplify', 'dedup', 'extract']],
  ['test',     ['test', 'spec', 'coverage', 'unit test', 'integration test', 'e2e']],
  ['docs',     ['doc', 'readme', 'comment', 'jsdoc', 'document', 'write up', 'explain']],
  ['feature',  ['add', 'build', 'create', 'implement', 'new', 'feature', 'introduce', 'support']],
  ['chore',    ['update', 'upgrade', 'bump', 'migrate', 'rename', 'move', 'remove', 'delete', 'chore']],
];

function classifyType(input: string): TaskType {
  const lower = input.toLowerCase();
  for (const [type, keywords] of TYPE_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return type;
  }
  return 'feature';
}

const HIGH_RISK_WORDS = ['auth', 'payment', 'security', 'delete', 'migration', 'database', 'production', 'deploy'];
const LOW_RISK_WORDS  = ['typo', 'colour', 'color', 'label', 'copy', 'readme', 'comment', 'rename'];

function classifyRisk(input: string): RiskLevel {
  const lower = input.toLowerCase();
  if (HIGH_RISK_WORDS.some((w) => lower.includes(w))) return 'high';
  if (LOW_RISK_WORDS.some((w) => lower.includes(w)))  return 'low';
  return 'medium';
}

function extractTitle(input: string): string {
  const firstSentence = input.split(/[.\n]/)[0].trim();
  return firstSentence.length <= 80 ? firstSentence : firstSentence.slice(0, 77) + '…';
}

function extractScope(input: string, taskType: TaskType): string[] {
  const parts = input
    .split(/,|;| and | also /)
    .map((s) => s.replace(/[.\n]/g, '').trim())
    .filter((s) => s.length > 3 && s.length < 200);
  if (parts.length > 1) return parts.slice(0, 5);
  const fallbacks: Record<TaskType, string> = {
    feature:  'Implement the described functionality',
    bug:      'Identify and fix the reported issue',
    refactor: 'Restructure the relevant code without changing behaviour',
    test:     'Write tests for the described area',
    docs:     'Write or update the relevant documentation',
    chore:    'Complete the described maintenance task',
  };
  return [fallbacks[taskType]];
}

const SUCCESS_BY_TYPE: Record<string, string[]> = {
  feature:  ['Feature behaves as described in the raw input', 'No regressions in related areas', 'Build passes'],
  bug:      ['The reported problem no longer occurs', 'Existing tests still pass', 'Build passes'],
  refactor: ['Behaviour is unchanged before and after', 'Code is simpler or better structured', 'Build passes'],
  test:     ['New tests pass', 'Coverage improves for the described area', 'Build passes'],
  docs:     ['Documentation is accurate and readable', 'No broken links or code examples'],
  chore:    ['Task is complete with no unintended side effects', 'Build passes'],
};

function detectAmbiguities(input: string): string[] {
  const found: string[] = [];
  if (input.includes('?')) found.push('Input contains an open question — clarify before starting');
  if (input.toLowerCase().includes('maybe') || input.toLowerCase().includes('perhaps'))
    found.push('Input uses uncertain language — confirm exact requirement');
  if (input.split(' ').length < 5)
    found.push('Input is very short — may lack sufficient context');
  if (!found.length)
    found.push('No obvious ambiguities detected — review before execution');
  return found;
}

export function shapeTaskMock(rawInput: string): Task {
  const input = rawInput.trim();
  const taskType = classifyType(input);
  return {
    id:               `task-${Date.now()}`,
    project_id:       '',
    status:           'draft',
    raw_input:        input,
    title:            extractTitle(input),
    task_type:        taskType,
    goal:             input,
    scope:            extractScope(input, taskType),
    out_of_scope:     [],
    success_criteria: SUCCESS_BY_TYPE[taskType] ?? SUCCESS_BY_TYPE['feature'],
    risk_level:       classifyRisk(input),
    needs_human_review: true,
    ambiguities:      detectAmbiguities(input),
    created_at:       new Date().toISOString(),
  };
}

// ── Public types ───────────────────────────────────────────────────────────────

export type ShapeSource = 'ai' | 'mock';
