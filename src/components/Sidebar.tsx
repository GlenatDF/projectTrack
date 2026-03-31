import { NavLink } from 'react-router-dom';
import { Rocket, FolderKanban, FolderSearch, Settings, Loader2, BookOpen, MessageSquarePlus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import type { AutoScanState } from './Layout';
import { FeedbackModal } from './FeedbackModal';

const navItems = [
  { to: '/', label: 'Projects', icon: FolderKanban, end: true },
  { to: '/discover', label: 'Discover', icon: FolderSearch, end: true },
  { to: '/settings', label: 'Settings', icon: Settings, end: true },
  { to: '/manual', label: 'Manual', icon: BookOpen, end: true },
];

export function Sidebar({ autoScanState }: { autoScanState: AutoScanState }) {
  const [version, setVersion]           = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  useEffect(() => { getVersion().then(setVersion).catch(() => {}); }, []);

  return (
    <aside className="w-52 shrink-0 bg-surface border-r border-border flex flex-col h-full">
      {/* App identity */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/25 flex items-center justify-center shrink-0">
            <Rocket size={14} className="text-violet-400" />
          </div>
          <span className="text-xs font-semibold text-slate-200 tracking-tight">
            Launchpad
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 pl-2.5 pr-3 py-1.5 rounded text-xs transition-colors border-l-2 ${
                isActive
                  ? 'bg-violet-500/10 text-slate-100 font-medium border-violet-500'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-hover border-transparent'
              }`
            }
          >
            <Icon size={14} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex items-center justify-between">
        {autoScanState === 'scanning' ? (
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <Loader2 size={11} className="animate-spin" />
            Scanning…
          </span>
        ) : autoScanState === 'done' ? (
          <span className="text-xs text-green-500">✓ Scanned</span>
        ) : (
          <span className="text-[11px] text-slate-600">{version ? `v${version}` : ''}</span>
        )}
        <button
          onClick={() => setFeedbackOpen(true)}
          title="Send feedback"
          className="p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-hover transition-colors cursor-default"
        >
          <MessageSquarePlus size={13} />
        </button>
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </aside>
  );
}
