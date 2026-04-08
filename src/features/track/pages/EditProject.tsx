import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { ProjectFormData } from '../../../lib/types';
import { getProject, updateProject, validateRepoPath } from '../../../lib/api';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { ProjectFormFields } from '../../../components/ProjectFormFields';

const EMPTY_FORM: ProjectFormData = {
  name: '',
  description: '',
  local_repo_path: '',
  status: 'active',
  phase: 'idea',
  priority: 'medium',
  ai_tool: 'claude',
  current_task: '',
  next_task: '',
  blocker: '',
  notes: '',
  claude_startup_prompt: '',
  claude_prompt_mode: 'append',
  claude_priority_files: '',
  session_handoff_notes: '',
  startup_command: 'claude',
  preferred_terminal: '',
};

export function EditProject() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);

  const [form, setForm] = useState<ProjectFormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pathValidating, setPathValidating] = useState(false);
  const [pathValid, setPathValid] = useState<boolean | null>(null);

  useEffect(() => {
    getProject(projectId)
      .then((p) => {
        setForm({
          name: p.name,
          description: p.description,
          local_repo_path: p.local_repo_path,
          status: p.status,
          phase: p.phase,
          priority: p.priority,
          ai_tool: p.ai_tool,
          current_task: p.current_task,
          next_task: p.next_task,
          blocker: p.blocker,
          notes: p.notes,
          claude_startup_prompt: p.claude_startup_prompt,
          claude_prompt_mode: p.claude_prompt_mode === 'replace' ? 'replace' : 'append',
          claude_priority_files: p.claude_priority_files,
          session_handoff_notes: p.session_handoff_notes,
          startup_command: p.startup_command,
          preferred_terminal: p.preferred_terminal,
        });
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectId]);

  function set<K extends keyof ProjectFormData>(key: K, value: ProjectFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handlePathChange(value: string) {
    set('local_repo_path', value);
    setPathValid(null);
    if (!value.trim()) return;
    setPathValidating(true);
    const ok = await validateRepoPath(value).catch(() => false);
    setPathValid(ok);
    setPathValidating(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Project name is required.'); return; }
    try {
      setSaving(true);
      setError(null);
      await updateProject(projectId, form);
      navigate(`/projects/${projectId}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const backTo = `/projects/${projectId}`;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const headerActions = (
    <>
      <Button variant="ghost" size="sm" onClick={() => navigate(backTo)}>
        Cancel
      </Button>
      <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>
        {saving && <Loader2 size={11} className="animate-spin" />}
        Save changes
      </Button>
    </>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader
        title="Edit Project"
        onBack={() => navigate(backTo)}
        actions={headerActions}
      />
      <div className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="px-5 py-4 max-w-2xl mx-auto space-y-4">
          <ProjectFormFields
            form={form}
            saving={saving}
            error={error}
            pathValidating={pathValidating}
            pathValid={pathValid}
            set={set}
            onPathChange={handlePathChange}
            onCancel={() => navigate(backTo)}
            submitLabel="Save changes"
          />
        </form>
      </div>
    </div>
  );
}
