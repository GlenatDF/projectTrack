import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { assemblePlanningPrompt, getProjectPlan, importPlanResponse } from '../../lib/api';
import type { AssembledPrompt, ImportPlanResult } from '../../lib/types';

type Step =
  | 'assembling'
  | 'prompt'
  | 'confirm'
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
        // Check for existing plan
        const plan = await getProjectPlan(projectId);
        setHasExistingPlan(plan.phases.length > 0);

        // Assemble prompt and copy to clipboard
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e2130] border border-[#2a2d3a] rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2d3a]">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-violet-400" />
            <span className="font-semibold text-white">Generate Plan</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Assembling */}
          {step === 'assembling' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={24} className="text-violet-400 animate-spin" />
              <p className="text-gray-400 text-sm">Assembling prompt…</p>
            </div>
          )}

          {/* Prompt ready / confirm re-import */}
          {(step === 'prompt' || step === 'confirm') && assembled && (
            <>
              {assembled.warnings.length > 0 && (
                <div className="flex gap-2 p-3 bg-amber-900/20 border border-amber-700/30 rounded-lg">
                  <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-300 text-sm font-medium mb-1">Warnings</p>
                    {assembled.warnings.map((w, i) => (
                      <p key={i} className="text-amber-400/80 text-xs">{w}</p>
                    ))}
                  </div>
                </div>
              )}

              {step === 'confirm' && (
                <div className="flex gap-2 p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg">
                  <AlertTriangle size={15} className="text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-blue-300 text-sm font-medium mb-1">Existing plan detected</p>
                    <p className="text-blue-400/80 text-xs">
                      Importing a new plan will replace all AI-generated phases, tasks, risks, and
                      assumptions. Tasks you've marked as done will be preserved.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-gray-300 text-sm">
                  Your planning prompt has been{' '}
                  <span className="text-green-400 font-medium">copied to clipboard</span>. Paste it
                  into Claude (or your AI of choice), then paste the response below.
                </p>
                <button
                  onClick={() => navigator.clipboard.writeText(assembled.prompt)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <ClipboardCopy size={12} />
                  Copy prompt again
                </button>
              </div>

              <button
                onClick={() => setStep('pasting')}
                className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                I've got the AI response — paste it in
              </button>
            </>
          )}

          {/* Paste response */}
          {step === 'pasting' && (
            <div className="space-y-3">
              <p className="text-gray-300 text-sm">
                Paste the AI's full JSON response below:
              </p>
              <textarea
                ref={textareaRef}
                value={pastedResponse}
                onChange={e => setPastedResponse(e.target.value)}
                rows={14}
                spellCheck={false}
                className="w-full bg-[#161921] border border-[#2a2d3a] rounded-lg px-3 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-600 outline-none focus:border-violet-500/50 resize-none"
                placeholder='Paste AI response here (JSON or ```json...``` fenced)…'
              />
            </div>
          )}

          {/* Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={24} className="text-violet-400 animate-spin" />
              <p className="text-gray-400 text-sm">Importing plan…</p>
            </div>
          )}

          {/* Done */}
          {step === 'done' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-green-400" />
                <span className="text-white font-medium">Plan imported successfully</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Phases', result.phases_imported],
                  ['Tasks', result.tasks_imported],
                  ['Risks', result.risks_imported],
                  ['Assumptions', result.assumptions_imported],
                ].map(([label, count]) => (
                  <div key={label as string} className="bg-[#161921] rounded-lg px-4 py-3">
                    <div className="text-2xl font-bold text-white">{count}</div>
                    <div className="text-xs text-gray-400">{label}</div>
                  </div>
                ))}
              </div>
              {result.preserved_task_count > 0 && (
                <p className="text-amber-300 text-sm">
                  {result.preserved_task_count} task
                  {result.preserved_task_count !== 1 ? 's' : ''} you previously marked were
                  preserved.
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle size={16} />
                <span className="font-medium text-sm">Import failed</span>
              </div>
              <p className="text-gray-400 text-sm bg-[#161921] rounded p-3 font-mono break-all">
                {error}
              </p>
              {step === 'error' && assembled && (
                <button
                  onClick={() => { setStep('pasting'); setError(''); }}
                  className="text-sm text-violet-400 hover:text-violet-300 underline"
                >
                  Try again
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#2a2d3a] flex justify-end gap-2">
          {step === 'done' ? (
            <button
              onClick={handleDone}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium"
            >
              View Plan
            </button>
          ) : step === 'pasting' ? (
            <>
              <button
                onClick={() => setStep(assembled ? (hasExistingPlan ? 'confirm' : 'prompt') : 'assembling')}
                className="px-4 py-2 text-gray-400 hover:text-gray-200 text-sm"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={!pastedResponse.trim()}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium disabled:opacity-40"
              >
                Import Plan
              </button>
            </>
          ) : step !== 'assembling' && step !== 'importing' ? (
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-gray-200 text-sm"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
