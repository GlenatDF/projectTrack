import { useEffect, useState } from 'react';
import {
  ClipboardCopy,
  Loader2,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import {
  getOpenerPrompt,
  resetClaudeSession,
  runClaudeHere,
  updateSessionNotes,
} from '../lib/api';
import type { Project } from '../lib/types';
import { Button } from './ui/Button';

interface Props {
  project: Project;
}

export function ClaudeSessionView({ project }: Props) {
  const [opener, setOpener]           = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [copied, setCopied]           = useState(false);
  const [notes, setNotes]             = useState(project.session_handoff_notes ?? '');
  const [notesSaved, setNotesSaved]   = useState(false);
  const [launching, setLaunching]     = useState(false);
  const [launchError, setLaunchError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const result = await getOpenerPrompt(project.id);
        setOpener(result.prompt);
        if (result.prompt) {
          await navigator.clipboard.writeText(result.prompt).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 3000);
        }
      } catch {
        setOpener(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [project.id]);

  async function handleCopy() {
    if (!opener) return;
    await navigator.clipboard.writeText(opener).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleOpenTerminal() {
    if (!project.local_repo_path) return;
    setLaunching(true);
    setLaunchError('');
    try {
      await runClaudeHere(project.local_repo_path);
    } catch (e) {
      setLaunchError(String(e));
    } finally {
      setLaunching(false);
    }
  }

  async function handleSaveNotes() {
    try {
      await updateSessionNotes(project.id, notes);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch {
      // silent — non-critical
    }
  }

  async function handleReset() {
    await resetClaudeSession(project.id).catch(() => {});
  }

  const hasRepo = !!project.local_repo_path?.trim();

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Start a session</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Opener assembled from your project context — copy it, then open Claude in your terminal.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleReset} title="Clear stored session ID">
          <RefreshCw size={12} />
          Reset
        </Button>
      </div>

      {/* Opener prompt */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">
            Opener prompt
          </span>
          {copied && (
            <span className="text-[11px] text-green-400">Copied to clipboard ✓</span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center">
            <Loader2 size={14} className="text-violet-400 animate-spin" />
            <span className="text-xs text-slate-500">Assembling opener…</span>
          </div>
        ) : opener ? (
          <pre className="bg-base border border-border rounded-lg px-4 py-3 text-xs text-slate-400 font-mono whitespace-pre-wrap overflow-y-auto max-h-64 leading-relaxed">
            {opener}
          </pre>
        ) : (
          <div className="py-6 text-center text-xs text-slate-600">
            No opener prompt available — add a project description to generate one.
          </div>
        )}

        {opener && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors cursor-default"
          >
            <ClipboardCopy size={11} />
            {copied ? 'Copied!' : 'Copy prompt'}
          </button>
        )}
      </div>

      {/* Terminal launch */}
      <div className="space-y-2">
        <span className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold block">
          Open in terminal
        </span>
        {!hasRepo ? (
          <p className="text-xs text-slate-600">
            No repository path set — add one in the Overview tab to enable terminal launch.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenTerminal}
              disabled={launching}
              className="gap-2"
            >
              {launching
                ? <Loader2 size={12} className="animate-spin" />
                : <Terminal size={12} />
              }
              Open Claude in terminal
            </Button>
            <p className="text-xs text-slate-600">
              Opens in iTerm or Terminal · paste the opener to start
            </p>
          </div>
        )}
        {launchError && (
          <p className="text-xs text-red-400 font-mono">{launchError}</p>
        )}
      </div>

      {/* Session notes */}
      <div className="space-y-2 border-t border-border pt-5">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold block">
              Session notes
            </span>
            <p className="text-xs text-slate-600 mt-0.5">
              Included in every opener prompt as context for the next session.
            </p>
          </div>
          {notesSaved && (
            <span className="text-[11px] text-green-400">Saved ✓</span>
          )}
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={5}
          placeholder="What happened last session? Decisions made, things to continue, context Claude needs next time…"
          className="w-full bg-base border border-border rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-700 outline-none focus:border-violet-500/50 resize-none"
        />
        <Button variant="secondary" size="sm" onClick={handleSaveNotes}>
          Save notes
        </Button>
      </div>

    </div>
  );
}
