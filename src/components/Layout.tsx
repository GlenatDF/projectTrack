import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { getProjects, scanProject } from '../lib/api';

export type AutoScanState = 'idle' | 'scanning' | 'done';
const SESSION_KEY = 'pt:autoScanned';

export function Layout() {
  const [autoScanState, setAutoScanState] = useState<AutoScanState>('idle');

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    const t = setTimeout(async () => {
      setAutoScanState('scanning');
      const projects = await getProjects().catch(() => []);
      const scannable = projects.filter((p) => p.local_repo_path.trim());
      await Promise.allSettled(scannable.map((p) => scanProject(p.id)));
      sessionStorage.setItem(SESSION_KEY, '1');
      setAutoScanState('done');
      setTimeout(() => setAutoScanState('idle'), 3000);
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex h-screen bg-base text-slate-200 overflow-hidden">
      <Sidebar autoScanState={autoScanState} />
      <main className="flex-1 overflow-y-auto"><Outlet /></main>
    </div>
  );
}
