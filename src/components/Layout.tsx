import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { X, Download } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { getProjects, scanProject, checkForUpdate, openFolder } from '../lib/api';
import type { UpdateInfo } from '../lib/types';

export type AutoScanState = 'idle' | 'scanning' | 'done';
const SESSION_KEY = 'pt:autoScanned';

export function Layout() {
  const navigate = useNavigate();
  const [autoScanState, setAutoScanState] = useState<AutoScanState>('idle');
  const [update, setUpdate]               = useState<UpdateInfo | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

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

  useEffect(() => {
    checkForUpdate().then(setUpdate).catch(() => {});
  }, []);

  const showBanner = !!update && !updateDismissed;

  return (
    <div className="flex h-screen bg-base overflow-hidden">
      <Sidebar autoScanState={autoScanState} />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {showBanner && update && (
          <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-violet-600/15 border-b border-violet-500/30 text-xs">
            <Download size={12} className="text-violet-400 shrink-0" />
            <span className="text-violet-200 font-medium">
              Version {update.version} is available
            </span>
            {update.released && (
              <span className="text-violet-400/70">· {update.released}</span>
            )}
            {update.notes && (
              <span className="text-violet-300/60 truncate">— {update.notes}</span>
            )}
            <div className="flex items-center gap-3 ml-auto shrink-0">
              <button
                onClick={() => openFolder(update.folder_path).catch(() => {})}
                className="text-violet-300 hover:text-violet-100 transition-colors cursor-default underline underline-offset-2"
              >
                Open folder
              </button>
              <button
                onClick={() => navigate('/settings')}
                className="text-violet-400 hover:text-violet-200 transition-colors cursor-default"
              >
                Settings
              </button>
              <button
                onClick={() => setUpdateDismissed(true)}
                className="text-violet-500 hover:text-violet-300 transition-colors cursor-default"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
