import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Loader2,
  XCircle,
  ListTodo,
} from 'lucide-react';
import { createTaskFromFinding, getAuditDetail, updateFindingStatus } from '../../lib/api';
import type {
  AuditDepth,
  AuditFinding,
  AuditKind,
  AuditWithFindings,
  FindingSeverity,
  FindingStatus,
} from '../../lib/types';


const KIND_LABELS: Record<AuditKind, string> = {
  full_codebase: 'Full codebase',
  security:      'Security',
  performance:   'Performance',
  reliability:   'Reliability',
};

const DEPTH_LABELS: Record<AuditDepth, string> = {
  quick: 'Quick scan',
  full:  'Full audit',
};

const SEVERITY_STYLES: Record<FindingSeverity, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
  high:     'bg-orange-500/20 text-orange-300 border-orange-500/30',
  medium:   'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  low:      'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const SEVERITY_DOT: Record<FindingSeverity, string> = {
  critical: 'bg-red-400',
  high:     'bg-orange-400',
  medium:   'bg-yellow-400',
  low:      'bg-slate-500',
};

interface Props {
  auditId: number;
  projectId: number;
  onBack: () => void;
  onTaskCreated?: (findingId: number, taskId: number) => void;
}

export function AuditDetail({ auditId, projectId, onBack, onTaskCreated }: Props) {
  const [data, setData]       = useState<AuditWithFindings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    setLoading(true);
    getAuditDetail(auditId)
      .then(d => { setData(d ?? null); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [auditId]);

  function handleStatusChange(findingId: number, status: FindingStatus) {
    updateFindingStatus(findingId, projectId, status).catch((e) => console.error('update_finding_status:', e));
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        findings: prev.findings.map(f =>
          f.id === findingId ? { ...f, status } : f
        ),
      };
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={18} className="text-violet-400 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-8 text-center text-xs text-red-400">
        {error || 'Audit not found.'}
      </div>
    );
  }

  const { audit, findings } = data;
  const auditKind  = audit.audit_kind as AuditKind;
  const auditDepth = audit.audit_depth as AuditDepth;

  const strengths       = tryParseArray(audit.strengths);
  const recommendations = tryParseArray(audit.recommendations);
  const filesReviewed   = tryParseArray(audit.files_reviewed);

  const openCount     = findings.filter(f => f.status === 'open').length;
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount     = findings.filter(f => f.severity === 'high').length;
  const mediumCount   = findings.filter(f => f.severity === 'medium').length;
  const lowCount      = findings.filter(f => f.severity === 'low').length;

  return (
    <div className="space-y-5 max-w-3xl mx-auto">

      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-default"
      >
        <ArrowLeft size={12} />
        Back to audits
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            {KIND_LABELS[auditKind]} · {DEPTH_LABELS[auditDepth]}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {new Date(audit.created_at).toLocaleDateString('en-NZ', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </p>
        </div>
        {audit.score != null && (
          <div className="text-right">
            <div className="text-2xl font-bold text-slate-100">{audit.score.toFixed(1)}</div>
            <div className="text-[11px] text-slate-500">/10</div>
          </div>
        )}
      </div>

      {/* Score label + summary */}
      {audit.score_label && (
        <p className="text-xs text-violet-300 font-medium">{audit.score_label}</p>
      )}
      {audit.summary && (
        <p className="text-xs text-slate-400 leading-relaxed">{audit.summary}</p>
      )}

      {/* Strengths + Recommendations */}
      {(strengths.length > 0 || recommendations.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {strengths.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-lg p-3 space-y-1.5">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">Strengths</p>
              <ul className="space-y-1">
                {strengths.map((s, i) => (
                  <li key={i} className="text-xs text-slate-400 flex gap-1.5">
                    <span className="text-green-500 shrink-0">✓</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {recommendations.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-lg p-3 space-y-1.5">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">Recommendations</p>
              <ol className="space-y-1 list-none">
                {recommendations.map((r, i) => (
                  <li key={i} className="text-xs text-slate-400 flex gap-1.5">
                    <span className="text-slate-600 shrink-0">{i + 1}.</span>
                    {r}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Files reviewed */}
      {filesReviewed.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-1.5 text-[11px] text-slate-600 hover:text-slate-400 cursor-default select-none list-none">
            <ChevronDown size={11} className="group-open:rotate-180 transition-transform" />
            Files reviewed ({filesReviewed.length})
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {filesReviewed.map((f, i) => (
              <span key={i} className="text-[11px] font-mono text-slate-500 bg-base border border-border rounded px-1.5 py-0.5">
                {f}
              </span>
            ))}
          </div>
        </details>
      )}

      {/* Findings header */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-xs font-semibold text-slate-300">
            Findings ({findings.length})
            {openCount > 0 && (
              <span className="ml-1.5 text-slate-500">· {openCount} open</span>
            )}
          </h3>
          <div className="flex items-center gap-2 text-[11px]">
            {criticalCount > 0 && <SeverityPill severity="critical" count={criticalCount} />}
            {highCount     > 0 && <SeverityPill severity="high"     count={highCount} />}
            {mediumCount   > 0 && <SeverityPill severity="medium"   count={mediumCount} />}
            {lowCount      > 0 && <SeverityPill severity="low"      count={lowCount} />}
          </div>
        </div>
      </div>

      {/* Findings list */}
      {findings.length === 0 ? (
        <p className="text-xs text-slate-600 py-4">No findings — codebase is clean.</p>
      ) : (
        <div className="space-y-2">
          {findings.map(f => (
            <FindingCard
              key={f.id}
              finding={f}
              projectId={projectId}
              onStatusChange={handleStatusChange}
              onTaskCreated={onTaskCreated}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Finding card ──────────────────────────────────────────────────────────────

interface FindingCardProps {
  finding: AuditFinding;
  projectId: number;
  onStatusChange: (id: number, status: FindingStatus) => void;
  onTaskCreated?: (findingId: number, taskId: number) => void;
}

function FindingCard({ finding, projectId, onStatusChange, onTaskCreated }: FindingCardProps) {
  const [creatingTask, setCreatingTask] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreateTask() {
    setCreatingTask(true);
    setCreateError(null);
    try {
      const taskId = await createTaskFromFinding(finding.id, projectId);
      onStatusChange(finding.id, 'task_created');
      onTaskCreated?.(finding.id, taskId);
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setCreatingTask(false);
    }
  }
  const sev = finding.severity as FindingSeverity;
  const isDone = finding.status === 'resolved' || finding.status === 'wont_fix' || finding.status === 'task_created';

  return (
    <div className={`border rounded-lg p-3 space-y-2 transition-opacity ${isDone ? 'opacity-50' : ''} bg-panel border-border-subtle`}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded border ${SEVERITY_STYLES[sev]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[sev]}`} />
            {sev.toUpperCase()}
          </span>
          <span className="text-[11px] text-slate-500">{finding.category}</span>
          {finding.classification && finding.classification !== 'likely' && (
            <span className="text-[11px] text-slate-600">{finding.classification.replace('_', ' ')}</span>
          )}
        </div>
        {finding.fix_size && (
          <span className="text-[11px] text-slate-600 shrink-0">{finding.fix_size} fix</span>
        )}
      </div>

      {/* Title */}
      <p className="text-xs font-medium text-slate-200">{finding.title}</p>

      {/* File ref */}
      {finding.file_ref && (
        <p className="text-[11px] font-mono text-slate-500">{finding.file_ref}</p>
      )}

      {/* Description */}
      {finding.description && (
        <p className="text-xs text-slate-400 leading-relaxed">{finding.description}</p>
      )}

      {/* Impact */}
      {finding.impact && (
        <p className="text-[11px] text-slate-500">
          <span className="text-slate-600 font-medium">Impact: </span>
          {finding.impact}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 flex-wrap">
        {finding.status === 'open' ? (
          <>
            <button
              onClick={() => onStatusChange(finding.id, 'resolved')}
              className="flex items-center gap-1 text-[11px] text-green-400 hover:text-green-300 cursor-default transition-colors"
            >
              <CheckCircle2 size={11} /> Resolved
            </button>
            <button
              onClick={() => onStatusChange(finding.id, 'wont_fix')}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 cursor-default transition-colors"
            >
              <XCircle size={11} /> Won't fix
            </button>
            <button
              onClick={handleCreateTask}
              disabled={creatingTask}
              className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 cursor-default transition-colors disabled:opacity-50"
            >
              {creatingTask
                ? <Loader2 size={11} className="animate-spin" />
                : <ListTodo size={11} />
              }
              Create task
            </button>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <StatusChip status={finding.status as FindingStatus} />
            <button
              onClick={() => onStatusChange(finding.id, 'open')}
              className="text-[11px] text-slate-600 hover:text-slate-400 cursor-default transition-colors underline"
            >
              reopen
            </button>
          </div>
        )}
      </div>
      {createError && (
        <p className="text-[11px] text-red-400">{createError}</p>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: FindingStatus }) {
  const styles: Record<FindingStatus, string> = {
    open:         'text-slate-400',
    resolved:     'text-green-400',
    wont_fix:     'text-slate-500',
    task_created: 'text-violet-400',
  };
  const labels: Record<FindingStatus, string> = {
    open:         'Open',
    resolved:     'Resolved ✓',
    wont_fix:     "Won't fix",
    task_created: 'Task created ✓',
  };
  return <span className={`text-[11px] font-medium ${styles[status]}`}>{labels[status]}</span>;
}

function SeverityPill({ severity, count }: { severity: FindingSeverity; count: number }) {
  return (
    <span className={`px-1.5 py-0.5 rounded border text-[11px] font-medium ${SEVERITY_STYLES[severity]}`}>
      {count} {severity}
    </span>
  );
}

function tryParseArray(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
