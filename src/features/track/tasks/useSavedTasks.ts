import { useState } from 'react';
import type { Task } from './types';

const STORAGE_KEY = 'launchpad:saved_tasks';

function normaliseTask(x: Task): Task {
  return {
    ...x,
    project_id: typeof x.project_id === 'string' ? x.project_id : '',
    status: typeof x.status === 'string' ? x.status : 'draft',
  };
}

function isValidTask(x: unknown): x is Task {
  if (typeof x !== 'object' || x === null) return false;
  const t = x as Record<string, unknown>;
  return (
    typeof t.id        === 'string' &&
    typeof t.title     === 'string' &&
    typeof t.task_type === 'string'
  );
}

function loadFromStorage(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidTask).map(normaliseTask);
  } catch {
    return [];
  }
}

function saveToStorage(tasks: Task[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (e) {
    console.warn('[useSavedTasks] Failed to write to localStorage:', e);
  }
}

export function useSavedTasks(projectId?: string) {
  const [tasks, setTasks] = useState<Task[]>(() => loadFromStorage());

  const filteredTasks = projectId
    ? tasks.filter((t) => t.project_id === projectId)
    : tasks;

  function addTask(task: Task): void {
    setTasks((prev) => {
      const next = [task, ...prev];
      saveToStorage(next);
      return next;
    });
  }

  function updateTask(id: string, patch: Partial<Task>): void {
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      saveToStorage(next);
      return next;
    });
  }

  return { tasks: filteredTasks, addTask, updateTask };
}
