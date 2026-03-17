import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, FolderSearch, Settings, Loader2, BookOpen } from 'lucide-react';
import type { AutoScanState } from './Layout';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban, end: false },
  { to: '/discover', label: 'Discover', icon: FolderSearch, end: true },
  { to: '/settings', label: 'Settings', icon: Settings, end: true },
  { to: '/manual', label: 'Manual', icon: BookOpen, end: true },
];

export function Sidebar({ autoScanState }: { autoScanState: AutoScanState }) {
  return (
    <aside className="w-56 shrink-0 bg-surface border-r border-border flex flex-col h-full">
      {/* App identity */}
      <div className="px-4 py-5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <FolderKanban size={15} className="text-indigo-400" />
          </div>
          <span className="text-sm font-semibold text-slate-200 tracking-tight">
            Project Tracker
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-indigo-500/15 text-indigo-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-hover'
              }`
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        {autoScanState === 'scanning' ? (
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Loader2 size={11} className="animate-spin" />
            Scanning…
          </p>
        ) : autoScanState === 'done' ? (
          <p className="text-xs text-green-500">✓ Scan complete</p>
        ) : (
          <p className="text-xs text-slate-600">v0.1.0 · Local-only</p>
        )}
      </div>
    </aside>
  );
}
