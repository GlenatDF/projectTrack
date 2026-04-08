import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { ProjectFormData, Status, Phase, Priority, AiTool } from '../lib/types';
import {
  ALL_STATUSES, ALL_PHASES, ALL_PRIORITIES, ALL_AI_TOOLS,
  STATUS_LABELS, PHASE_LABELS, PRIORITY_LABELS, AI_TOOL_LABELS,
} from '../lib/types';
import { Button } from './ui/Button';
import { SectionLabel } from './ui/SectionLabel';

interface Props {
  form: ProjectFormData;
  saving: boolean;
  error: string | null;
  pathValidating: boolean;
  pathValid: boolean | null;
  set: <K extends keyof ProjectFormData>(key: K, value: ProjectFormData[K]) => void;
  onPathChange: (value: string) => void;
  onCancel: () => void;
  submitLabel: string;
  scaffoldSlot?: React.ReactNode;
}

export function ProjectFormFields({
  form,
  saving,
  error,
  pathValidating,
  pathValid,
  set,
  onPathChange,
  onCancel,
  submitLabel,
  scaffoldSlot,
}: Props) {
  return (
    <>
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Basic info */}
      <FormSection title="Basic Info">
        <Field label="Project name">
          <TextInput
            value={form.name}
            onChange={(v) => set('name', v)}
            placeholder="My awesome project"
            autoFocus
          />
        </Field>
        <Field label="Description">
          <TextArea
            value={form.description}
            onChange={(v) => set('description', v)}
            placeholder="What is this project about?"
            rows={2}
          />
        </Field>
        <Field
          label="Local repo path"
          hint={
            pathValidating
              ? 'Checking…'
              : pathValid === true
              ? '✓ Valid git repository'
              : pathValid === false
              ? '⚠ Not a git repository (you can still save)'
              : undefined
          }
          hintClass={pathValid === false ? 'text-yellow-400' : 'text-green-400'}
        >
          <div className="relative">
            <TextInput
              value={form.local_repo_path}
              onChange={onPathChange}
              placeholder="/Users/you/projects/my-repo"
              mono
            />
            <div className="absolute right-3 top-2">
              {pathValidating && <Loader2 size={12} className="text-slate-500 animate-spin" />}
              {!pathValidating && pathValid === true && <CheckCircle2 size={12} className="text-green-400" />}
              {!pathValidating && pathValid === false && <AlertCircle size={12} className="text-yellow-400" />}
            </div>
          </div>
        </Field>
      </FormSection>

      {/* Scaffold mode slot (new projects only) */}
      {scaffoldSlot}

      {/* Status & Phase */}
      <FormSection title="Status & Phase">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <SelectInput
              value={form.status}
              onChange={(v) => set('status', v as Status)}
              options={ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
            />
          </Field>
          <Field label="Phase">
            <SelectInput
              value={form.phase}
              onChange={(v) => set('phase', v as Phase)}
              options={ALL_PHASES.map((p) => ({ value: p, label: PHASE_LABELS[p] }))}
            />
          </Field>
          <Field label="Priority">
            <SelectInput
              value={form.priority}
              onChange={(v) => set('priority', v as Priority)}
              options={ALL_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
            />
          </Field>
          <Field label="AI tool">
            <SelectInput
              value={form.ai_tool}
              onChange={(v) => set('ai_tool', v as AiTool)}
              options={ALL_AI_TOOLS.map((t) => ({ value: t, label: AI_TOOL_LABELS[t] }))}
            />
          </Field>
        </div>
      </FormSection>

      {/* Tasks */}
      <FormSection title="Tasks">
        <Field label="Current task">
          <TextInput
            value={form.current_task}
            onChange={(v) => set('current_task', v)}
            placeholder="What are you working on right now?"
          />
        </Field>
        <Field label="Next task">
          <TextInput
            value={form.next_task}
            onChange={(v) => set('next_task', v)}
            placeholder="What's coming up next?"
          />
        </Field>
        <Field label="Blocker">
          <TextInput
            value={form.blocker}
            onChange={(v) => set('blocker', v)}
            placeholder="What's blocking progress? (leave blank if none)"
          />
        </Field>
      </FormSection>

      {/* Notes */}
      <FormSection title="Notes">
        <TextArea
          value={form.notes}
          onChange={(v) => set('notes', v)}
          placeholder="Freeform notes, links, ideas…"
          rows={5}
        />
      </FormSection>

      {/* Bottom actions */}
      <div className="flex items-center gap-2 pb-2">
        <Button type="submit" variant="primary" size="sm" disabled={saving}>
          {saving && <Loader2 size={11} className="animate-spin" />}
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </>
  );
}

// ── Form primitives ───────────────────────────────────────────────────────────

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  hintClass = 'text-slate-500',
  children,
}: {
  label: string;
  hint?: string;
  hintClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {children}
      {hint && <p className={`text-xs mt-1 ${hintClass}`}>{hint}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={`w-full bg-base border border-border rounded-md px-3 py-2 text-sm text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50 transition-colors ${mono ? 'font-mono' : ''}`}
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-base border border-border rounded-md px-3 py-2 text-sm text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50 transition-colors resize-none"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-base border border-border rounded-md px-3 py-2 text-sm text-slate-300 outline-none focus:border-violet-500/50 transition-colors cursor-default"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
