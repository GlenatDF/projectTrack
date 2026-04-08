import { useEffect, useRef, useState } from 'react';
import { FileText, RefreshCw, Save } from 'lucide-react';
import {
  getProjectDocuments,
  updateProjectDocument,
  updateDocumentStatus,
  regenerateScaffold,
} from '../../../../lib/api';
import type { ProjectDocument, DocStatus } from '../../../../lib/types';
import { DOC_TYPE_LABELS } from '../../../../lib/types';
import { Button } from '../../../../components/ui/Button';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { SectionLabel } from '../../../../components/ui/SectionLabel';

const PLAN_MANAGED_DOCS = new Set(['risks', 'scratchpad']);

const STATUS_STYLES: Record<DocStatus, string> = {
  draft:    'bg-slate-500/20 text-slate-400',
  reviewed: 'bg-blue-500/20 text-blue-300',
  final:    'bg-green-500/20 text-green-300',
};

interface Props {
  projectId: number;
  onNavigateToPlan: () => void;
}

export function PlanningDocs({ projectId, onNavigateToPlan }: Props) {
  const [docs, setDocs] = useState<ProjectDocument[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [pendingDocType, setPendingDocType] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { load(); }, [projectId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (dirty) save();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dirty, selected, draft]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    try {
      const data = await getProjectDocuments(projectId);
      setDocs(data);
      if (!selected && data.length > 0) {
        setSelected(data[0].doc_type);
        setDraft(data[0].content);
      } else if (selected) {
        const cur = data.find(d => d.doc_type === selected);
        if (cur) setDraft(cur.content);
      }
    } finally {
      setLoading(false);
    }
  }

  function selectDoc(docType: string) {
    if (docType === selected) return;
    if (dirty) {
      setPendingDocType(docType);
      return;
    }
    navigateTo(docType);
  }

  function navigateTo(docType: string) {
    const doc = docs.find(d => d.doc_type === docType);
    if (!doc) return;
    setSelected(docType);
    setDraft(doc.content);
    setDirty(false);
    setPendingDocType(null);
  }

  function handleEdit(value: string) {
    setDraft(value);
    setDirty(true);
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await updateProjectDocument(projectId, selected, draft);
      setDocs(prev => prev.map(d => d.doc_type === selected ? updated : d));
      setDirty(false);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaving(false), 800);
      if (pendingDocType) navigateTo(pendingDocType);
    } catch {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setDirty(false);
    if (pendingDocType) {
      navigateTo(pendingDocType);
    } else {
      setPendingDocType(null);
    }
  }

  async function cycleStatus(docType: string) {
    const doc = docs.find(d => d.doc_type === docType);
    if (!doc) return;
    const next: Record<DocStatus, DocStatus> = {
      draft: 'reviewed',
      reviewed: 'final',
      final: 'draft',
    };
    try {
      const updated = await updateDocumentStatus(projectId, docType, next[doc.status]);
      setDocs(prev => prev.map(d => d.doc_type === docType ? updated : d));
    } catch {}
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const updated = await regenerateScaffold(projectId);
      setDocs(updated);
      if (selected) {
        const cur = updated.find(d => d.doc_type === selected);
        if (cur && !dirty) setDraft(cur.content);
      }
    } finally {
      setRegenerating(false);
    }
  }

  const selectedDoc = docs.find(d => d.doc_type === selected);
  const isPlanManaged = selected ? PLAN_MANAGED_DOCS.has(selected) : false;
  const showBanner = dirty && !!pendingDocType;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-xs">
        Loading documents…
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <EmptyState
        icon={<FileText size={20} />}
        title="No documents yet"
        action={
          <Button variant="primary" size="sm" onClick={handleRegenerate} disabled={regenerating}>
            <RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} />
            Generate Documents
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex border border-border rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 260px)', minHeight: '460px' }}>
      {/* Sidebar */}
      <div className="w-48 shrink-0 border-r border-border overflow-y-auto flex flex-col">
        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
          <SectionLabel>Docs</SectionLabel>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            title="Regenerate draft documents"
            className="text-slate-600 hover:text-slate-400 disabled:opacity-40 cursor-default transition-colors"
          >
            <RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} />
          </button>
        </div>
        {docs.map(doc => (
          <button
            key={doc.doc_type}
            onClick={() => selectDoc(doc.doc_type)}
            className={`w-full text-left px-3 py-2 text-xs flex items-start justify-between gap-2 hover:bg-hover transition-colors cursor-default border-l-2 ${
              selected === doc.doc_type
                ? 'bg-hover text-slate-100 border-violet-500'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <span className="truncate leading-tight">
              {DOC_TYPE_LABELS[doc.doc_type] ?? doc.title}
            </span>
            <span
              onClick={e => { e.stopPropagation(); cycleStatus(doc.doc_type); }}
              className={`shrink-0 mt-0.5 px-1 py-0.5 rounded text-[10px] cursor-default ${STATUS_STYLES[doc.status]}`}
              title="Click to advance status"
            >
              {doc.status}
            </span>
          </button>
        ))}
      </div>

      {/* Editor pane */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Unsaved changes banner */}
        {showBanner && (
          <div className="flex items-center justify-between px-4 py-2 bg-amber-900/20 border-b border-amber-700/30 text-amber-400 text-xs shrink-0">
            <span>Unsaved changes</span>
            <div className="flex gap-3">
              <button onClick={handleDiscard} className="underline hover:text-amber-200 cursor-default">
                Discard
              </button>
              <button onClick={() => save()} className="underline hover:text-amber-200 font-medium cursor-default">
                Save &amp; continue
              </button>
            </div>
          </div>
        )}

        {/* Toolbar */}
        {selectedDoc && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
            <span className="text-xs font-medium text-slate-300">{selectedDoc.title}</span>
            <div className="flex items-center gap-2">
              {!dirty && saving && (
                <span className="text-[11px] text-green-400">Saved</span>
              )}
              {dirty && (
                <Button variant="primary" size="sm" onClick={() => save()} disabled={saving}>
                  <Save size={11} />
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Plan-managed stub */}
        {isPlanManaged ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center px-8">
            <p className="text-slate-500 text-xs">
              This document is managed via the{' '}
              <button
                onClick={onNavigateToPlan}
                className="text-violet-400 underline hover:text-violet-300 cursor-default"
              >
                Tasks tab
              </button>
              .
            </p>
          </div>
        ) : (
          <textarea
            value={draft}
            onChange={e => handleEdit(e.target.value)}
            spellCheck={false}
            className="flex-1 bg-transparent resize-none font-mono text-xs text-slate-300 p-4 outline-none placeholder-slate-700"
            placeholder="Start writing… (⌘S to save)"
          />
        )}
      </div>
    </div>
  );
}
