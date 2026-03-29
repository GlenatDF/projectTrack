import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ClipboardList, Loader2, Plus } from 'lucide-react';
import { getProjectAudits } from '../../lib/api';
import type { AuditDepth, AuditKind, AuditRecord } from '../../lib/types';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { AuditModal } from './AuditModal';
import { AuditDetail } from './AuditDetail';

const KIND_LABELS: Record<AuditKind, string> = {
  full_codebase: 'Full codebase',
  security:      'Security',
  performance:   'Performance',
  reliability:   'Reliability',
};

const DEPTH_LABELS: Record<AuditDepth, string> = {
  quick: 'Quick',
  full:  'Full',
};

interface Props {
  projectId: number;
}

type View = { type: 'list' } | { type: 'detail'; auditId: number };

export function AuditsView({ projectId }: Props) {
  const [audits, setAudits]             = useState<AuditRecord[]>([]);
  const [loading, setLoading]           = useState(true);
  const [view, setView]                 = useState<View>({ type: 'list' });
  const [showDropdown, setShowDropdown] = useState(false);
  const [modalKind, setModalKind]       = useState<AuditKind | null>(null);
  const [modalDepth, setModalDepth]     = useState<AuditDepth>('full');
  const dropdownRef                     = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAudits();
  }, [projectId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  async function loadAudits() {
    setLoading(true);
    try {
      const list = await getProjectAudits(projectId);
      setAudits(list);
    } finally {
      setLoading(false);
    }
  }

  function openModal(kind: AuditKind, depth: AuditDepth) {
    setModalKind(kind);
    setModalDepth(depth);
    setShowDropdown(false);
  }

  function handleStored(auditId: number) {
    loadAudits();
    setView({ type: 'detail', auditId });
  }

  if (view.type === 'detail') {
    return (
      <div className="py-4 px-1">
        <AuditDetail
          auditId={view.auditId}
          projectId={projectId}
          onBack={() => setView({ type: 'list' })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Audits</h2>

        {/* Run Audit dropdown */}
        <div className="relative" ref={dropdownRef}>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowDropdown(v => !v)}
            className="gap-1.5"
          >
            <Plus size={12} />
            Run Audit
            <ChevronDown size={11} className={`transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
          </Button>

          {showDropdown && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-panel border border-border rounded-lg shadow-xl min-w-[200px] py-1">
              {(['quick', 'full'] as AuditDepth[]).map(depth => (
                <div key={depth}>
                  <div className="px-3 py-1.5 text-[11px] text-slate-500 uppercase tracking-widest font-semibold">
                    {DEPTH_LABELS[depth]}
                  </div>
                  {(['full_codebase', 'security', 'performance', 'reliability'] as AuditKind[]).map(kind => (
                    <button
                      key={kind}
                      onClick={() => openModal(kind, depth)}
                      className="w-full text-left px-4 py-1.5 text-xs text-slate-300 hover:bg-hover transition-colors cursor-default"
                    >
                      {KIND_LABELS[kind]}
                    </button>
                  ))}
                  {depth === 'quick' && <div className="my-1 border-t border-border-subtle" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="text-violet-400 animate-spin" />
        </div>
      ) : audits.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={28} />}
          title="No audits yet"
          description="Run an audit to get a structured review of your codebase."
        />
      ) : (
        <div className="space-y-2">
          {audits.map(audit => (
            <AuditCard
              key={audit.id}
              audit={audit}
              onView={() => setView({ type: 'detail', auditId: audit.id })}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalKind && (
        <AuditModal
          projectId={projectId}
          auditKind={modalKind}
          auditDepth={modalDepth}
          onClose={() => setModalKind(null)}
          onStored={handleStored}
        />
      )}
    </div>
  );
}

// ── Audit card ────────────────────────────────────────────────────────────────

function AuditCard({ audit, onView }: { audit: AuditRecord; onView: () => void }) {
  const kind  = audit.audit_kind  as AuditKind;
  const depth = audit.audit_depth as AuditDepth;

  const date = new Date(audit.created_at).toLocaleDateString('en-NZ', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <div
      onClick={onView}
      className="bg-panel border border-border-subtle rounded-lg px-4 py-3 hover:border-border hover:bg-card transition-colors cursor-default"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-200">
            {KIND_LABELS[kind]}
          </span>
          <span className="text-[11px] text-slate-500">·</span>
          <span className="text-[11px] text-slate-500">{DEPTH_LABELS[depth]}</span>
          {audit.score != null && (
            <>
              <span className="text-[11px] text-slate-500">·</span>
              <span className="text-[11px] font-semibold text-violet-300">
                {audit.score.toFixed(1)}/10
              </span>
            </>
          )}
        </div>
        <span className="text-[11px] text-slate-600 shrink-0">{date}</span>
      </div>

      {audit.summary && (
        <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-1">{audit.summary}</p>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3 text-[11px] text-slate-600">
          <span>{JSON.parse(audit.strengths || '[]').length > 0 ? '✓ has strengths' : ''}</span>
        </div>
        <span className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors">
          View →
        </span>
      </div>
    </div>
  );
}
