import type { Task } from './types';

function list(items: string[]): string {
  return items.map((s) => `- ${s}`).join('\n');
}

/** Builds a clean, Claude-ready execution prompt from a Task. Synchronous, no side-effects. */
export function buildRunPrompt(task: Task): string {
  const lines: string[] = [];

  lines.push(`Task: ${task.title}`);
  lines.push(`Type: ${task.task_type}  |  Risk: ${task.risk_level}`);
  lines.push('');
  lines.push('Goal:');
  lines.push(task.goal);
  lines.push('');
  lines.push('Scope:');
  lines.push(list(task.scope));
  lines.push('');
  lines.push('Out of scope:');
  lines.push(list(task.out_of_scope.length ? task.out_of_scope : ['(none specified)']));
  lines.push('');
  lines.push('Success criteria:');
  lines.push(list(task.success_criteria));

  if (task.ambiguities.length > 0) {
    lines.push('');
    lines.push('Ambiguities to resolve before starting:');
    lines.push(list(task.ambiguities));
  }

  lines.push('');
  lines.push('---');
  lines.push('Human review required before execution.');

  return lines.join('\n');
}
