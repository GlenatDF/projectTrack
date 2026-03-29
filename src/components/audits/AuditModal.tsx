import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCopy,
  Loader2,
} from 'lucide-react';
import {
  assembleAuditPrompt,
  runAuditWithClaudeCli,
  storeAuditResult,
} from '../../lib/api';
import type { AssembledPrompt, AuditDepth, AuditKind, AuditStoredResult } from '../../lib/types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

type Step =
  | 'assembling'
  | 'prompt'
  | 'running'
  | 'pasting'
  | 'storing'
  | 'done'
  | 'error';

const AUDIT_KIND_LABELS: Record<AuditKind, string> = {
  full_codebase: 'codebase audit',
  security:      'security audit',
  performance:   'performance audit',
  reliability:   'reliability audit',
};

const AUDIT_DEPTH_LABELS: Record<AuditDepth, string> = {
  quick: 'Quick',
  full:  'Full',
};

interface Props {
  projectId: number;
  auditKind: AuditKind;
  auditDepth: AuditDepth;
  onClose: () => void;
  onStored: (auditId: number) => void;
}

export function AuditModal({ projectId, auditKind, auditDepth, onClose, onStored }: Props) {
  const [step, setStep]                   = useState<Step>('assembling');
  const [assembled, setAssembled]         = useState<AssembledPrompt | null>(null);
  const [pastedResponse, setPastedResponse] = useState('');
  const [result, setResult]               = useState<AuditStoredResult | null>(null);
  const [error, setError]                 = useState('');
  const textareaRef                        = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const a = await assembleAuditPrompt(projectId, auditKind, auditDepth);
        setAssembled(a);
        setStep('prompt');
      } catch (e) {
        setError(String(e));
        setStep('error');
      }
    })();
  }, [projectId, auditKind, auditDepth]);

  useEffect(() => {
    if (step === 'pasting') {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [step]);

  async function handleRunWithCli() {
    setStep('running');
    try {
      const raw = await runAuditWithClaudeCli(projectId, auditKind, auditDepth);
      setStep('storing');
      const r = await storeAuditResult(projectId, auditKind, auditDepth, raw);
      setResult(r);
      setStep('done');
    } catch (e) {
      setError(String(e));
      setStep('error');
    }
  }

  async function handleStore() {
    if (!pastedResponse.trim()) return;
    setStep('storing');
    try {
      const r = await storeAuditResult(projectId, auditKind, auditDepth, pastedResponse.trim());
      setResult(r);
      setStep('done');
    } catch (e) {
      setError(String(e));
      setStep('error');
    }
  }

  function handleDone() {
    if (result) onStored(result.audit_id);
    onClose();
  }

  const footer = (
    <>
      {step === 'done' && (
        <Button variant="primary" size="sm" onClick={handleDone}>
          View Audit
        </Button>
      )}
      {step === 'pasting' && (
        <>
          <Button variant="ghost" size="sm" onClick={() => setStep('prompt')}>
            Back
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleStore}
            disabled={!pastedResponse.trim()}
          >
            Import Audit
          </Button>
        </>
      )}
      {step !== 'assembling' &&
        step !== 'storing' &&
        step !== 'running' &&
        step !== 'done' &&
        step !== 'pasting' && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        )}
    </>
  );

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`${AUDIT_DEPTH_LABELS[auditDepth]} ${AUDIT_KIND_LABELS[auditKind]}`}
      size="lg"
      footer={footer}
    >
      <div className="space-y-4">
        {/* Assembling */}
        {step === 'assembling' && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 size={20} className="text-violet-400 animate-spin" />
            <p className="text-slate-500 text-xs">Assembling audit prompt…</p>
          </div>
        )}

        {/* Prompt ready */}
        {step === 'prompt' && assembled && (
          <>
            {assembled.warnings.length > 0 && (
              <div className="flex gap-2 p-3 bg-amber-900/15 border border-amber-700/30 rounded-lg">
                <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-300 text-xs font-medium mb-1">Warnings</p>
                  {assembled.warnings.map((w, i) => (
                    <p key={i} className="text-amber-500 text-xs">{w}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-slate-300 text-xs">
                Your audit prompt has been{' '}
                <span className="text-green-400 font-medium">copied to clipboard</span>. Paste it
                into Claude (or your AI of choice), then paste the response below.
              </p>
              <button
                onClick={() => navigator.clipboard.writeText(assembled.prompt)}
                className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors cursor-default"
              >
                <ClipboardCopy size={11} />
                Copy prompt again
              </button>
            </div>

            {/* Copy to clipboard on prompt step mount */}
            <CopyOnMount text={assembled.prompt} />

            <div className="flex flex-col gap-2">
              <Button
                variant="primary"
                onClick={handleRunWithCli}
                className="w-full justify-center py-2.5"
              >
                <Bot size={13} />
                Run with Claude CLI
              </Button>
              <Button
                variant="secondary"
                onClick={() => setStep('pasting')}
                className="w-full justify-center py-2.5"
              >
                I'll paste the response manually
              </Button>
            </div>
          </>
        )}

        {/* Paste response */}
        {step === 'pasting' && (
          <div className="space-y-2">
            <p className="text-slate-400 text-xs">
              Paste the AI's full audit response below (JSON or ```json fenced):
            </p>
            <textarea
              ref={textareaRef}
              value={pastedResponse}
              onChange={e => setPastedResponse(e.target.value)}
              rows={14}
              spellCheck={false}
              className="w-full bg-base border border-border rounded px-3 py-2 text-xs font-mono text-slate-300 placeholder-slate-700 outline-none focus:border-violet-500/50 resize-none"
              placeholder='Paste Claude response here (JSON or ```json...``` fenced)…'
            />
          </div>
        )}

        {/* Running via CLI */}
        {step === 'running' && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 size={20} className="text-violet-400 animate-spin" />
            <p className="text-slate-400 text-xs">
              {auditDepth === 'quick' ? 'Running quick scan…' : 'Running full audit…'}
            </p>
            <p className="text-slate-600 text-xs">
              {auditDepth === 'quick'
                ? 'Claude is scanning key entry points'
                : 'This can take a few minutes while Claude reads the codebase'}
            </p>
          </div>
        )}

        {/* Storing */}
        {step === 'storing' && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 size={20} className="text-violet-400 animate-spin" />
            <p className="text-slate-400 text-xs">Saving audit results…</p>
          </div>
        )}

        {/* Done */}
        {step === 'done' && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-400" />
              <span className="text-slate-100 text-sm font-medium">
                Audit saved successfully
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-surface border border-border rounded px-3 py-2.5">
                <div className="text-xl font-bold text-slate-100">
                  {result.findings_count}
                </div>
                <div className="text-[11px] text-slate-500">Findings</div>
              </div>
            </div>
            <p className="text-slate-500 text-xs">
              Click "View Audit" to see the full results and triage each finding.
            </p>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle size={14} />
              <span className="text-xs font-medium">Audit failed</span>
            </div>
            <p className="text-slate-500 text-xs bg-base rounded p-3 font-mono break-all">
              {error}
            </p>
            {assembled && (
              <button
                onClick={() => { setStep('pasting'); setError(''); }}
                className="text-xs text-violet-400 hover:text-violet-300 underline cursor-default"
              >
                Try pasting the response manually
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Silently copies text to clipboard when first rendered. */
function CopyOnMount({ text }: { text: string }) {
  useEffect(() => {
    navigator.clipboard.writeText(text).catch(() => {/* clipboard may be unavailable */});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
