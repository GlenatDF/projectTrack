import { NavLink } from 'react-router-dom';
import { FolderKanban, FolderSearch, Settings, Loader2, BookOpen } from 'lucide-react';
import type { AutoScanState } from './Layout';

const navItems = [
  { to: '/', label: 'Projects', icon: FolderKanban, end: true },
  { to: '/discover', label: 'Discover', icon: FolderSearch, end: true },
  { to: '/settings', label: 'Settings', icon: Settings, end: true },
  { to: '/manual', label: 'Manual', icon: BookOpen, end: true },
];

export function Sidebar({ autoScanState }: { autoScanState: AutoScanState }) {
  return (
    <aside className="w-52 shrink-0 bg-surface border-r border-border flex flex-col h-full">
      {/* App identity */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-violet-500/20 flex items-center justify-center shrink-0">
            <FolderKanban size={13} className="text-violet-400" />
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
          <span className="text-[11px] text-slate-600">v0.1.0</span>
        )}
        <span className="text-[11px] text-slate-700">local</span>
      </div>
    </aside>
  );
}
