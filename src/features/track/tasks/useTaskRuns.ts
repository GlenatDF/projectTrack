import { useState } from 'react';
import type { TaskRun } from './types';

const STORAGE_KEY = 'launchpad:task_runs';

function isValidRun(x: unknown): x is TaskRun {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.id         === 'string' &&
    typeof r.task_id    === 'string' &&
    typeof r.project_id === 'string' &&
    typeof r.prompt     === 'string' &&
    typeof r.status     === 'string'
  );
}

function loadFromStorage(): TaskRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidRun);
  } catch {
    return [];
  }
}

function saveToStorage(runs: TaskRun[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch (e) {
    console.warn('[useTaskRuns] Failed to write to localStorage:', e);
  }
}

export function useTaskRuns(taskId: string) {
  const [allRuns, setAllRuns] = useState<TaskRun[]>(() => loadFromStorage());

  const runs = allRuns.filter((r) => r.task_id === taskId);

  function addRun(run: TaskRun): void {
    setAllRuns((prev) => {
      const next = [run, ...prev];
      saveToStorage(next);
      return next;
    });
  }

  function updateRun(id: string, patch: Partial<TaskRun>): void {
    setAllRuns((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      saveToStorage(next);
      return next;
    });
  }

  return { runs, addRun, updateRun };
}
