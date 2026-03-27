import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Send,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import {
  getInProgressTasks,
  getOpenerPrompt,
  resetClaudeSession,
  sendSessionMessage,
  startClaudeSession,
  updateTaskProgressNote,
  updateTaskStatus,
} from '../lib/api';
import type { InProgressTask } from '../lib/types';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';

// ── Types ───────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface LogEntry {
  time: Date;
  text: string;
}

type SessionStatus = 'idle' | 'starting' | 'sending' | 'error';

interface SuggestedAction {
  rawTitle: string;
  newStatus: 'done' | 'paused';
  matches: InProgressTask[];
}

const STATUS_TEXT: Record<SessionStatus, string> = {
  idle: 'Session active',
  starting: 'Starting session…',
  sending: 'Waiting for Claude…',
  error: 'Error',
};

const QUICK_REPLIES = ['Yes', 'No', 'Continue', 'Pause here'] as const;

interface Props {
  projectId: number;
  projectName: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function parseAndClean(
  text: string,
  tasks: InProgressTask[],
): { cleanText: string; suggestions: SuggestedAction[] } {
  const hintRegex = /\[task:\s*"([^"]+)"\s*->\s*(done|paused)\]/gi;
  const hints: Array<{ rawTitle: string; newStatus: 'done' | 'paused' }> = [];
  let m: RegExpExecArray | null;
  while ((m = hintRegex.exec(text)) !== null) {
    hints.push({ rawTitle: m[1], newStatus: m[2].toLowerCase() as 'done' | 'paused' });
  }

  // Strip hint patterns (and any trailing newline) from displayed text
  const cleanText = text
    .replace(/\[task:\s*"[^"]+"\s*->\s*(?:done|paused)\]\n?/gi, '')
    .trim();

  const suggestions: SuggestedAction[] = hints.map(({ rawTitle, newStatus }) => {
    const needle = rawTitle.toLowerCase();
    const matches = tasks.filter(t => t.title.toLowerCase().includes(needle));
    return { rawTitle, newStatus, matches };
  });

  return { cleanText, suggestions };
}

// ── Main component ──────────────────────────────────────────────────────────────

export function ClaudeSessionView({ projectId, projectName }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [openerExpanded, setOpenerExpanded] = useState(false);
  const [openerPreview, setOpenerPreview] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<LogEntry[]>([]);
  const [logExpanded, setLogExpanded] = useState(false);
  const [activeTasks, setActiveTasks] = useState<InProgressTask[]>([]);
  const [noteTaskId, setNoteTaskId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestedAction[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasSession = sessionId !== null;
  const isBusy = status === 'starting' || status === 'sending';
  const lastMessage = messages[messages.length - 1];
  const showQuickReplies = lastMessage?.role === 'assistant' && !isBusy && suggestions.length === 0;

  function addLog(text: string) {
    setActivityLog(prev => [...prev.slice(-7), { time: new Date(), text }]);
  }

  const fetchActiveTasks = useCallback(async () => {
    try {
      const all = await getInProgressTasks();
      setActiveTasks(all.filter(t => t.project_id === projectId));
    } catch {
      // non-critical — silently ignore
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setCheckingSession(true);
    getOpenerPrompt(projectId)
      .then(data => {
        if (cancelled) return;
        setOpenerPreview(data.prompt);
        if (data.session_id) {
          setSessionId(data.session_id);
          setSessionRestored(true);
          addLog('Session restored from DB');
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setCheckingSession(false);
          fetchActiveTasks();
        }
      });
    return () => { cancelled = true; };
  }, [projectId, fetchActiveTasks]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBusy, suggestions]);

  // Core send function — used by the input box and quick-reply chips
  async function handleSendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    setInput('');
    setSuggestions([]);
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setStatus('sending');
    setError(null);
    addLog('Message sent');
    try {
      const turn = await sendSessionMessage(projectId, trimmed);
      // Capture current tasks for matching before refreshing
      const currentTasks = activeTasks;
      const { cleanText, suggestions: newSuggestions } = parseAndClean(turn.response, currentTasks);
      setMessages(prev => [...prev, { role: 'assistant', content: cleanText }]);
      setSuggestions(newSuggestions);
      setStatus('idle');
      addLog(
        newSuggestions.length > 0
          ? `Response received · ${newSuggestions.length} task hint${newSuggestions.length > 1 ? 's' : ''}`
          : 'Response received',
      );
      fetchActiveTasks();
    } catch (e) {
      const msg = String(e);
      setError(msg);
      setStatus('error');
      addLog(`Error: ${msg.slice(0, 60)}${msg.length > 60 ? '…' : ''}`);
    }
  }

  async function handleStart() {
    setStatus('starting');
    setError(null);
    setSuggestions([]);
    addLog('Starting session…');
    try {
      const turn = await startClaudeSession(projectId);
      setSessionId(turn.session_id);
      setSessionRestored(false);
      const currentTasks = activeTasks;
      const { cleanText, suggestions: newSuggestions } = parseAndClean(turn.response, currentTasks);
      setMessages([{ role: 'assistant', content: cleanText }]);
      setSuggestions(newSuggestions);
      setStatus('idle');
      addLog('Session started · response received');
      fetchActiveTasks();
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) {
      const msg = String(e);
      setError(msg);
      setStatus('error');
      addLog(`Error: ${msg.slice(0, 60)}${msg.length > 60 ? '…' : ''}`);
    }
  }

  async function handleNewSession() {
    if (isBusy) return;
    try {
      await resetClaudeSession(projectId);
      setMessages([]);
      setSessionId(null);
      setSessionRestored(false);
      setOpenerPreview(null);
      setError(null);
      setStatus('idle');
      setActivityLog([]);
      setSuggestions([]);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleTaskComplete(taskId: number) {
    try {
      await updateTaskStatus(taskId, 'done');
      addLog('Task marked complete');
      if (noteTaskId === taskId) { setNoteTaskId(null); setNoteText(''); }
      fetchActiveTasks();
    } catch (e) {
      addLog(`Error updating task: ${String(e).slice(0, 40)}`);
    }
  }

  async function handleTaskPause(taskId: number) {
    try {
      await updateTaskStatus(taskId, 'paused');
      addLog('Task paused');
      fetchActiveTasks();
    } catch (e) {
      addLog(`Error updating task: ${String(e).slice(0, 40)}`);
    }
  }

  async function handleTaskResume(taskId: number) {
    try {
      await updateTaskStatus(taskId, 'in_progress');
      addLog('Task resumed');
      fetchActiveTasks();
    } catch (e) {
      addLog(`Error updating task: ${String(e).slice(0, 40)}`);
    }
  }

  async function handleSaveNote(taskId: number) {
    const note = noteText.trim();
    if (!note) return;
    try {
      await updateTaskProgressNote(taskId, note);
      addLog('Progress note saved');
      setNoteTaskId(null);
      setNoteText('');
      fetchActiveTasks();
    } catch (e) {
      addLog(`Error saving note: ${String(e).slice(0, 40)}`);
    }
  }

  async function handleConfirmSuggestion(
    taskId: number,
    newStatus: 'done' | 'paused',
    index: number,
  ) {
    try {
      await updateTaskStatus(taskId, newStatus);
      addLog(`Task marked ${newStatus} via Claude hint`);
      setSuggestions(prev => prev.filter((_, i) => i !== index));
      if (noteTaskId === taskId) { setNoteTaskId(null); setNoteText(''); }
      fetchActiveTasks();
    } catch (e) {
      addLog(`Error updating task: ${String(e).slice(0, 40)}`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText(input);
    }
  }

  const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
  const lastActivityTime = activityLog.length > 0 ? activityLog[activityLog.length - 1].time : null;

  if (checkingSession) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={16} className="text-slate-600 animate-spin" />
      </div>
    );
  }

  if (!hasSession && !isBusy) {
    return (
      <EmptyState
        icon={<Bot size={20} />}
        title="No active session"
        description={`Start a Claude session for ${projectName}. The project opener will be assembled from your docs and sent automatically.`}
        action={
          <Button variant="primary" size="sm" onClick={handleStart}>
            <Sparkles size={12} />
            Start Session
          </Button>
        }
      />
    );
  }

  return (
    <div
      className="flex flex-col bg-base border border-border rounded-lg overflow-hidden"
      style={{ height: 'calc(100vh - 260px)', minHeight: '460px' }}
    >
      {/* Header bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border bg-panel">
        <div className="flex items-center gap-2">
          {isBusy ? (
            <Loader2 size={12} className="text-violet-400 animate-spin shrink-0" />
          ) : (
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                status === 'error' ? 'bg-red-400' : 'bg-green-400'
              }`}
            />
          )}
          <span className="text-xs text-slate-400">{STATUS_TEXT[status]}</span>
          {lastActivityTime && (
            <span className="text-[10px] text-slate-600">· {formatTime(lastActivityTime)}</span>
          )}
          {sessionId && (
            <span className="text-[10px] text-slate-700 font-mono hidden sm:inline">
              · {sessionId.slice(0, 8)}…
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {lastAssistantMessage && (
            <CopyButton text={lastAssistantMessage.content} label="Copy latest" />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewSession}
            disabled={isBusy}
            title="Discard this session and start a fresh one"
          >
            <RefreshCw size={11} />
            New Session
          </Button>
        </div>
      </div>

      {/* Activity log — collapsible, defaults closed */}
      {activityLog.length > 0 && (
        <div className="shrink-0 border-b border-border">
          <button
            onClick={() => setLogExpanded(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors cursor-default"
          >
            {logExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span>Activity</span>
            <span className="text-[10px] text-slate-700">({activityLog.length})</span>
          </button>
          {logExpanded && (
            <div className="px-4 pb-2 space-y-0.5">
              {activityLog.map((entry, i) => (
                <div key={i} className="flex items-baseline gap-2 text-[10px]">
                  <span className="text-slate-700 font-mono shrink-0">{formatTime(entry.time)}</span>
                  <span className="text-slate-500">{entry.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Opener prompt — collapsible */}
      {openerPreview && (
        <div className="shrink-0 border-b border-border">
          <button
            onClick={() => setOpenerExpanded(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors cursor-default"
          >
            {openerExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span>Opener prompt</span>
          </button>
          {openerExpanded && (
            <pre className="px-4 pb-3 text-xs font-mono text-slate-500 whitespace-pre-wrap break-all leading-relaxed max-h-48 overflow-y-auto bg-base">
              {openerPreview}
            </pre>
          )}
        </div>
      )}

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto bg-base px-4 py-4 space-y-4">
        {sessionRestored && messages.length === 0 && !isBusy && (
          <div className="flex items-center justify-center pt-4">
            <span className="text-xs text-slate-600 border border-border rounded-full px-3 py-1">
              Session resumed · previous messages not shown
            </span>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {/* Task hints — shown after last assistant message, before quick replies */}
        {suggestions.map((s, i) => (
          <SuggestionCard
            key={i}
            suggestion={s}
            projectTasks={activeTasks}
            onConfirm={(taskId, newStatus) => handleConfirmSuggestion(taskId, newStatus, i)}
            onDismiss={() => setSuggestions(prev => prev.filter((_, j) => j !== i))}
          />
        ))}

        {/* Quick replies — after last assistant message when idle and no pending hints */}
        {showQuickReplies && (
          <div className="flex flex-wrap gap-1.5 pl-8">
            {QUICK_REPLIES.map(reply => (
              <button
                key={reply}
                onClick={() => handleSendText(reply)}
                className="px-2.5 py-1 text-[11px] text-slate-600 border border-border rounded-full hover:text-slate-300 hover:border-slate-500 transition-colors cursor-default"
              >
                {reply}
              </button>
            ))}
          </div>
        )}

        {isBusy && <ThinkingBubble status={status} />}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
            <AlertCircle size={12} className="shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap break-all flex-1">{error}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Active tasks strip — hidden when no active tasks */}
      {activeTasks.length > 0 && (
        <div className="shrink-0 border-t border-border bg-panel px-4 py-2 space-y-1.5">
          <p className="text-[10px] text-slate-700 uppercase tracking-widest font-semibold">Active tasks</p>
          {activeTasks.map(task => (
            <div key={task.id}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex-1 text-xs text-slate-400 truncate" title={task.title}>
                  {task.title}
                </span>
                <button
                  onClick={() => handleTaskComplete(task.id)}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-green-400 hover:bg-green-500/10 rounded transition-colors cursor-default shrink-0"
                >
                  <CheckCircle2 size={10} />
                  Complete
                </button>
                {task.status === 'in_progress' ? (
                  <button
                    onClick={() => handleTaskPause(task.id)}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-yellow-400 hover:bg-yellow-500/10 rounded transition-colors cursor-default shrink-0"
                  >
                    <PauseCircle size={10} />
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={() => handleTaskResume(task.id)}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-violet-400 hover:bg-violet-500/10 rounded transition-colors cursor-default shrink-0"
                  >
                    <PlayCircle size={10} />
                    {task.status === 'blocked' ? 'Unblock' : 'Resume'}
                  </button>
                )}
                <button
                  onClick={() => {
                    setNoteTaskId(noteTaskId === task.id ? null : task.id);
                    setNoteText('');
                  }}
                  className="px-2 py-0.5 text-[10px] text-slate-500 hover:text-slate-300 hover:bg-hover rounded transition-colors cursor-default shrink-0"
                >
                  Note
                </button>
              </div>
              {noteTaskId === task.id && (
                <div className="mt-1 flex gap-1.5 items-center">
                  <input
                    type="text"
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveNote(task.id);
                      if (e.key === 'Escape') { setNoteTaskId(null); setNoteText(''); }
                    }}
                    placeholder="Progress note…"
                    autoFocus
                    className="flex-1 bg-base border border-border rounded px-2 py-1 text-[11px] text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50"
                  />
                  <button
                    onClick={() => handleSaveNote(task.id)}
                    disabled={!noteText.trim()}
                    className="px-2 py-1 text-[10px] text-violet-400 hover:bg-violet-500/10 rounded transition-colors cursor-default disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setNoteTaskId(null); setNoteText(''); }}
                    className="px-2 py-1 text-[10px] text-slate-600 hover:text-slate-400 rounded transition-colors cursor-default"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 px-4 py-3 border-t border-border bg-panel">
        {isBusy && (
          <div className="flex items-center gap-1.5 mb-2 text-[10px] text-slate-600">
            <Loader2 size={10} className="animate-spin shrink-0" />
            <span>
              {status === 'starting'
                ? 'Starting Claude session — this may take a moment…'
                : 'Waiting for Claude to respond…'}
            </span>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={isBusy}
            placeholder={
              isBusy
                ? 'Waiting for Claude…'
                : 'Message Claude… (Enter to send, Shift+Enter for newline)'
            }
            className="flex-1 bg-base border border-border rounded px-3 py-2 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50 resize-none disabled:opacity-40"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleSendText(input)}
            disabled={isBusy || !input.trim()}
            className="self-end shrink-0"
          >
            <Send size={11} />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-slate-600 hover:text-slate-400 rounded transition-colors"
    >
      {copied ? (
        <Check size={10} className="text-green-400 shrink-0" />
      ) : (
        <Copy size={10} className="shrink-0" />
      )}
      {label && (
        <span className={copied ? 'text-green-400' : ''}>{copied ? 'Copied' : label}</span>
      )}
    </button>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5 ${
          isUser ? 'bg-slate-600/30 text-slate-400' : 'bg-violet-500/20 text-violet-400'
        }`}
      >
        {isUser ? <User size={11} /> : <Bot size={11} />}
      </div>
      <div className="max-w-[85%]">
        <div
          className={`rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap select-text break-words ${
            isUser
              ? 'bg-violet-600/15 text-slate-200 border border-violet-600/25'
              : 'bg-card text-slate-200 border border-border'
          }`}
        >
          {message.content}
        </div>
        {!isUser && (
          <div className="mt-1 flex justify-end">
            <CopyButton text={message.content} label="Copy" />
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingBubble({ status }: { status: SessionStatus }) {
  return (
    <div className="flex gap-2.5">
      <div className="shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5 bg-violet-500/20 text-violet-400">
        <Bot size={11} />
      </div>
      <div className="bg-card border border-border rounded-lg px-3 py-2 flex items-center gap-2">
        <Loader2 size={11} className="text-violet-400 animate-spin" />
        <span className="text-xs text-slate-500">
          {status === 'starting' ? 'Starting session…' : 'Thinking…'}
        </span>
      </div>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  projectTasks,
  onConfirm,
  onDismiss,
}: {
  suggestion: SuggestedAction;
  projectTasks: InProgressTask[];
  onConfirm: (taskId: number, newStatus: 'done' | 'paused') => void;
  onDismiss: () => void;
}) {
  const [pickedId, setPickedId] = useState<number | null>(
    suggestion.matches.length === 1 ? suggestion.matches[0].id : null,
  );

  const statusLabel = suggestion.newStatus === 'done' ? 'complete' : 'paused';
  const confirmClass =
    suggestion.newStatus === 'done'
      ? 'text-green-400 hover:bg-green-500/10'
      : 'text-yellow-400 hover:bg-yellow-500/10';

  const needsPicker = suggestion.matches.length !== 1;
  const pickerList = suggestion.matches.length > 1 ? suggestion.matches : projectTasks;

  return (
    <div className="mx-8 p-3 bg-panel border border-violet-500/20 rounded-lg space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          <span className="text-violet-400 font-medium">Claude suggests</span>
          {' '}marking a task as{' '}
          <span className={suggestion.newStatus === 'done' ? 'text-green-400' : 'text-yellow-400'}>
            {statusLabel}
          </span>
          {suggestion.matches.length === 1 && (
            <>
              {': '}
              <span className="text-slate-300 font-medium">{suggestion.matches[0].title}</span>
            </>
          )}
        </p>
        <button
          onClick={onDismiss}
          className="text-slate-600 hover:text-slate-400 shrink-0 transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {needsPicker && (
        <>
          <p className="text-[11px] text-slate-500">
            {suggestion.matches.length === 0
              ? <>No match for <span className="font-mono text-slate-400">"{suggestion.rawTitle}"</span> — pick task:</>
              : <>Multiple matches for <span className="font-mono text-slate-400">"{suggestion.rawTitle}"</span> — choose one:</>
            }
          </p>
          <select
            value={pickedId ?? ''}
            onChange={e => setPickedId(Number(e.target.value) || null)}
            className="w-full bg-base border border-border rounded px-2 py-1 text-xs text-slate-300 outline-none focus:border-violet-500/50"
          >
            <option value="">— select task —</option>
            {pickerList.map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </>
      )}

      <div className="flex gap-1.5 justify-end">
        <button
          onClick={onDismiss}
          className="px-2 py-0.5 text-[10px] text-slate-600 hover:text-slate-400 rounded transition-colors cursor-default"
        >
          Dismiss
        </button>
        <button
          onClick={() => pickedId !== null && onConfirm(pickedId, suggestion.newStatus)}
          disabled={pickedId === null}
          className={`px-2 py-0.5 text-[10px] rounded transition-colors cursor-default disabled:opacity-40 ${confirmClass}`}
        >
          Mark {statusLabel}
        </button>
      </div>
    </div>
  );
}
