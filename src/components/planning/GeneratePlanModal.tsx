import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCopy,
  Loader2,
} from 'lucide-react';
import { assemblePlanningPrompt, getProjectPlan, importPlanResponse, runPlanWithClaudeCli } from '../../lib/api';
import type { AssembledPrompt, ImportPlanResult } from '../../lib/types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

type Step =
  | 'assembling'
  | 'prompt'
  | 'confirm'
  | 'running'
  | 'pasting'
  | 'importing'
  | 'done'
  | 'error';

interface Props {
  projectId: number;
  onClose: () => void;
  onImported: () => void;
}

export function GeneratePlanModal({ projectId, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('assembling');
  const [assembled, setAssembled] = useState<AssembledPrompt | null>(null);
  const [pastedResponse, setPastedResponse] = useState('');
  const [result, setResult] = useState<ImportPlanResult | null>(null);
  const [error, setError] = useState('');
  const [hasExistingPlan, setHasExistingPlan] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const plan = await getProjectPlan(projectId);
        setHasExistingPlan(plan.phases.length > 0);
        const a = await assemblePlanningPrompt(projectId);
        setAssembled(a);
        setStep(plan.phases.length > 0 ? 'confirm' : 'prompt');
      } catch (e) {
        setError(String(e));
        setStep('error');
      }
    })();
  }, [projectId]);

  useEffect(() => {
    if (step === 'pasting') {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [step]);

  async function handleRunWithCli() {
    setStep('running');
    try {
      const response = await runPlanWithClaudeCli(projectId);
      const r = await importPlanResponse(projectId, assembled!.prompt, response);
      setResult(r);
      setStep('done');
    } catch (e) {
      setError(String(e));
      setStep('error');
    }
  }

  async function handleImport() {
    if (!assembled || !pastedResponse.trim()) return;
    setStep('importing');
    try {
      const r = await importPlanResponse(projectId, assembled.prompt, pastedResponse.trim());
      setResult(r);
      setStep('done');
    } catch (e) {
      setError(String(e));
      setStep('error');
    }
  }

  function handleDone() {
    onImported();
    onClose();
  }

  const footer = (
    <>
      {step === 'done' && (
        <Button variant="primary" size="sm" onClick={handleDone}>
          View Plan
        </Button>
      )}
      {step === 'pasting' && (
        <>
          <Button variant="ghost" size="sm"
            onClick={() => setStep(assembled ? (hasExistingPlan ? 'confirm' : 'prompt') : 'assembling')}>
            Back
          </Button>
          <Button variant="primary" size="sm" onClick={handleImport} disabled={!pastedResponse.trim()}>
            Import Plan
          </Button>
        </>
      )}
      {step !== 'assembling' && step !== 'importing' && step !== 'running' && step !== 'done' && step !== 'pasting' && (
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
      title="Generate Plan"
      size="lg"
      footer={footer}
    >
      <div className="space-y-4">
        {/* Assembling */}
        {step === 'assembling' && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 size={20} className="text-violet-400 animate-spin" />
            <p className="text-slate-500 text-xs">Assembling prompt…</p>
          </div>
        )}

        {/* Prompt ready / confirm re-import */}
        {(step === 'prompt' || step === 'confirm') && assembled && (
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

            {step === 'confirm' && (
              <div className="flex gap-2 p-3 bg-blue-900/15 border border-blue-700/30 rounded-lg">
                <AlertTriangle size={13} className="text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-blue-300 text-xs font-medium mb-1">Existing plan detected</p>
                  <p className="text-blue-400 text-xs">
                    Importing a new plan will replace all AI-generated phases, tasks, risks, and
                    assumptions. Tasks you've marked as done will be preserved.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-slate-300 text-xs">
                Your planning prompt has been{' '}
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

            <div className="flex flex-col gap-2">
              <Button variant="primary" onClick={handleRunWithCli}
                className="w-full justify-center py-2.5">
                <Bot size={13} />
                Run with Claude CLI
              </Button>
              <Button variant="secondary" onClick={() => setStep('pasting')}
                className="w-full justify-center py-2.5">
                I'll paste the response manually
              </Button>
            </div>
          </>
        )}

        {/* Paste response */}
        {step === 'pasting' && (
          <div className="space-y-2">
            <p className="text-slate-400 text-xs">Paste the AI's full JSON response below:</p>
            <textarea
              ref={textareaRef}
              value={pastedResponse}
              onChange={e => setPastedResponse(e.target.value)}
              rows={14}
              spellCheck={false}
              className="w-full bg-base border border-border rounded px-3 py-2 text-xs font-mono text-slate-300 placeholder-slate-700 outline-none focus:border-violet-500/50 resize-none"
              placeholder='Paste AI response here (JSON or ```json...``` fenced)…'
            />
          </div>
        )}

        {/* Running via CLI */}
        {step === 'running' && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 size={20} className="text-violet-400 animate-spin" />
            <p className="text-slate-400 text-xs">Running Claude CLI…</p>
            <p className="text-slate-600 text-xs">This usually takes 15–30 seconds</p>
          </div>
        )}

        {/* Importing */}
        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 size={20} className="text-violet-400 animate-spin" />
            <p className="text-slate-400 text-xs">Importing plan…</p>
          </div>
        )}

        {/* Done */}
        {step === 'done' && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-400" />
              <span className="text-slate-100 text-sm font-medium">Plan imported successfully</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Phases', result.phases_imported],
                ['Tasks', result.tasks_imported],
                ['Risks', result.risks_imported],
                ['Assumptions', result.assumptions_imported],
              ].map(([label, count]) => (
                <div key={label as string} className="bg-surface border border-border rounded px-3 py-2.5">
                  <div className="text-xl font-bold text-slate-100">{count}</div>
                  <div className="text-[11px] text-slate-500">{label}</div>
                </div>
              ))}
            </div>
            {result.preserved_task_count > 0 && (
              <p className="text-amber-400 text-xs">
                {result.preserved_task_count} task
                {result.preserved_task_count !== 1 ? 's' : ''} you previously marked were preserved.
              </p>
            )}
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle size={14} />
              <span className="text-xs font-medium">Import failed</span>
            </div>
            <p className="text-slate-500 text-xs bg-base rounded p-3 font-mono break-all">{error}</p>
            {assembled && (
              <button
                onClick={() => { setStep('pasting'); setError(''); }}
                className="text-xs text-violet-400 hover:text-violet-300 underline cursor-default"
              >
                Try again
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
