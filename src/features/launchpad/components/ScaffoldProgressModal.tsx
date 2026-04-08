import { CheckCircle2, XCircle, MinusCircle, Loader2, ExternalLink, Copy } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import type { ScaffoldResult } from '../../../lib/types';

interface Props {
  open: boolean;
  running: boolean;
  result: ScaffoldResult | null;
  error: string | null;
  onContinue: (projectPath: string) => void;
  onClose: () => void;
}

export default function ScaffoldProgressModal({
  open, running, result, error, onContinue, onClose,
}: Props) {
  const success = !!result && !result.steps.some((s) => s.status === 'error');
  const hasError = !!error || result?.steps.some((s) => s.status === 'error');

  return (
    <Modal
      open={open}
      onClose={running ? undefined : onClose}
      title="Scaffolding project"
      subtitle={running ? 'Please wait…' : success ? 'Done!' : hasError ? 'Completed with issues' : undefined}
      size="lg"
      footer={
        !running && (
          <>
            {!success && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
            {result && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onContinue(result.project_path)}
              >
                Continue to project
              </Button>
            )}
          </>
        )
      }
    >
      {running && (
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 size={18} className="animate-spin text-violet-400 shrink-0" />
          <span className="text-sm">Running scaffold — this may take a moment…</span>
        </div>
      )}

      {error && !result && (
        <div className="flex items-start gap-2 text-red-400 text-sm">
          <XCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Steps */}
          <div className="space-y-2">
            {result.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <StepIcon status={step.status} />
                <div>
                  <span className="text-sm text-slate-200">{step.label}</span>
                  {step.detail && (
                    <span className="text-xs text-slate-500 ml-1.5">{step.detail}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Summary links */}
          <div className="border-t border-border pt-3 space-y-1.5">
            <InfoRow label="Local path" value={result.project_path} mono copyable />
            {result.github_url && (
              <InfoRow label="GitHub" value={result.github_url} link />
            )}
            {result.vercel_project_url && (
              <InfoRow label="Vercel" value={result.vercel_project_url} link />
            )}
            {result.supabase_project_id && (
              <InfoRow
                label="Supabase ref"
                value={result.supabase_project_id}
                mono
                copyable
              />
            )}
            {result.supabase_db_password && (
              <InfoRow
                label="DB password"
                value={result.supabase_db_password}
                mono
                copyable
                warn="Save this — you can't retrieve it later"
              />
            )}
          </div>

          {/* Next steps */}
          <NextSteps result={result} />
        </div>
      )}
    </Modal>
  );
}

function StepIcon({ status }: { status: string }) {
  if (status === 'ok')
    return <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />;
  if (status === 'error')
    return <XCircle size={14} className="text-red-400 mt-0.5 shrink-0" />;
  return <MinusCircle size={14} className="text-slate-600 mt-0.5 shrink-0" />;
}

function InfoRow({
  label, value, mono, link, copyable, warn,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: boolean;
  copyable?: boolean;
  warn?: string;
}) {
  function copy() {
    navigator.clipboard.writeText(value).catch(() => {});
  }

  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-slate-500 shrink-0 w-24">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        {link ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300 flex items-center gap-1 truncate"
          >
            {value}
            <ExternalLink size={10} className="shrink-0" />
          </a>
        ) : (
          <span className={`text-slate-300 truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
        )}
        {copyable && (
          <button onClick={copy} className="text-slate-600 hover:text-slate-400 shrink-0">
            <Copy size={10} />
          </button>
        )}
      </div>
      {warn && <span className="text-yellow-500 text-xs shrink-0">{warn}</span>}
    </div>
  );
}

function NextSteps({ result }: { result: ScaffoldResult }) {
  const steps: string[] = [];

  steps.push(`cd ${result.project_path}`);
  steps.push('npm install');

  if (!result.supabase_project_id) {
    steps.push('# Create a Supabase project at supabase.com');
  }
  steps.push('# Add Supabase URL + anon key to .env.local');

  if (!result.vercel_project_url) {
    steps.push('vercel   # first deploy');
  }

  if (!result.github_url) {
    steps.push('# Create GitHub repo and push: gh repo create');
  }

  return (
    <div className="bg-panel rounded-lg p-3">
      <p className="text-xs text-slate-500 font-medium mb-2">Next steps</p>
      <div className="space-y-1">
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-2">
            {s.startsWith('#') ? (
              <span className="text-xs text-slate-500">{s}</span>
            ) : (
              <>
                <span className="text-slate-600 text-xs select-none">$</span>
                <code className="text-xs text-slate-300 font-mono">{s}</code>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
