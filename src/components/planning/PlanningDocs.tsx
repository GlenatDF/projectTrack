import { useEffect, useRef, useState } from 'react';
import { FileText, RefreshCw, Save } from 'lucide-react';
import {
  getProjectDocuments,
  updateProjectDocument,
  updateDocumentStatus,
  regenerateScaffold,
} from '../../lib/api';
import type { ProjectDocument, DocStatus } from '../../lib/types';
import { DOC_TYPE_LABELS } from '../../lib/types';

const PLAN_MANAGED_DOCS = new Set(['risks', 'scratchpad']);

const STATUS_STYLES: Record<DocStatus, string> = {
  draft:    'bg-gray-500/20 text-gray-400',
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
  // pendingDocType: the doc the user clicked while dirty — navigate there after discard/save
  const [pendingDocType, setPendingDocType] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    load();
  }, [projectId]);

  // Cmd+S / Ctrl+S save shortcut
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
      // If a navigation was pending, complete it now
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
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Loading documents…
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <FileText size={40} className="text-gray-600" />
        <p className="text-gray-400 text-sm">No documents yet.</p>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw size={14} className={regenerating ? 'animate-spin' : ''} />
          Generate Documents
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 border border-[#2a2d3a] rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 280px)', minHeight: '480px' }}>
      {/* Sidebar */}
      <div className="w-52 flex-shrink-0 border-r border-[#2a2d3a] overflow-y-auto">
        <div className="p-3 border-b border-[#2a2d3a] flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Docs</span>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            title="Regenerate draft documents"
            className="text-gray-500 hover:text-gray-300 disabled:opacity-40"
          >
            <RefreshCw size={13} className={regenerating ? 'animate-spin' : ''} />
          </button>
        </div>
        {docs.map(doc => (
          <button
            key={doc.doc_type}
            onClick={() => selectDoc(doc.doc_type)}
            className={`w-full text-left px-3 py-2.5 text-sm flex items-start justify-between gap-2 hover:bg-white/5 transition-colors ${
              selected === doc.doc_type ? 'bg-white/8 text-white' : 'text-gray-300'
            }`}
          >
            <span className="truncate leading-tight">
              {DOC_TYPE_LABELS[doc.doc_type] ?? doc.title}
            </span>
            <span
              onClick={e => { e.stopPropagation(); cycleStatus(doc.doc_type); }}
              className={`flex-shrink-0 mt-0.5 px-1 py-0.5 rounded text-xs cursor-pointer ${STATUS_STYLES[doc.status]}`}
              title="Click to advance status"
            >
              {doc.status}
            </span>
          </button>
        ))}
      </div>

      {/* Editor pane */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Unsaved changes banner — only shows when navigating away */}
        {showBanner && (
          <div className="flex items-center justify-between px-4 py-2 bg-amber-900/30 border-b border-amber-700/40 text-amber-300 text-sm flex-shrink-0">
            <span>Unsaved changes — save or discard before switching.</span>
            <div className="flex gap-3">
              <button
                onClick={handleDiscard}
                className="underline hover:text-amber-100 text-xs"
              >
                Discard
              </button>
              <button
                onClick={() => save()}
                className="underline hover:text-amber-100 text-xs font-medium"
              >
                Save &amp; continue
              </button>
            </div>
          </div>
        )}

        {/* Toolbar */}
        {selectedDoc && (
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2a2d3a] flex-shrink-0">
            <span className="text-sm font-medium text-gray-200">{selectedDoc.title}</span>
            <div className="flex items-center gap-3">
              {!dirty && saving && (
                <span className="text-xs text-green-400">Saved</span>
              )}
              {dirty && (
                <button
                  onClick={() => save()}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium disabled:opacity-50"
                >
                  <Save size={11} />
                  {saving ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Plan-managed stub */}
        {isPlanManaged ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center px-8">
            <p className="text-gray-400 text-sm">
              This document is best managed via the{' '}
              <button
                onClick={onNavigateToPlan}
                className="text-violet-400 underline hover:text-violet-300"
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
            className="flex-1 bg-transparent resize-none font-mono text-sm text-gray-200 p-4 outline-none placeholder-gray-600"
            placeholder="Start writing… (⌘S to save)"
          />
        )}
      </div>
    </div>
  );
}
