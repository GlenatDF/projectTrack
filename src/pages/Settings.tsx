import { useEffect, useState } from 'react';
import { Download, Upload, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import { exportProjects, importProjects, getSettings, updateSetting, checkGhCli, publishCurrentVersion, openFolder } from '../lib/api';
import { downloadJson, readJsonFile } from '../lib/utils';
import { useTheme, ZOOM_LEVELS, type Theme, type ZoomLevel } from '../lib/ThemeContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { SectionLabel } from '../components/ui/SectionLabel';
import type { AppSettings } from '../lib/types';

export default function Settings() {
  const { theme, setTheme, zoom, setZoom } = useTheme();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [appVersion, setAppVersion] = useState('');
  useEffect(() => { getVersion().then(setAppVersion).catch(() => {}); }, []);

  // Integration settings
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [ghStatus, setGhStatus] = useState<boolean | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getSettings().then(setSettings).catch((e) =>
      setMsg({ type: 'err', text: `Failed to load settings: ${e}` })
    );
    checkGhCli().then(setGhStatus).catch(() => setGhStatus(false));
  }, []);

  async function saveSetting(key: keyof AppSettings, value: string) {
    setSavingKey(key);
    try {
      await updateSetting(key, value);
      setSettings((prev) => ({ ...prev, [key]: value }));
    } catch (e) {
      setMsg({ type: 'err', text: String(e) });
    } finally {
      setSavingKey(null);
    }
  }

  async function handleExport() {
    try {
      setExporting(true);
      setMsg(null);
      const json = await exportProjects();
      const date = new Date().toISOString().slice(0, 10);
      downloadJson(json, `launchpad-export-${date}.json`);
      setMsg({ type: 'ok', text: 'Export downloaded.' });
    } catch (e) {
      setMsg({ type: 'err', text: String(e) });
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    try {
      setImporting(true);
      setMsg(null);
      const json = await readJsonFile();
      const count = await importProjects(json);
      setMsg({ type: 'ok', text: `Imported ${count} project${count === 1 ? '' : 's'}.` });
    } catch (e) {
      if (String(e) !== 'No file selected') {
        setMsg({ type: 'err', text: String(e) });
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="Settings" subtitle="App configuration and data management" />

      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-4 max-w-2xl mx-auto space-y-4">

          {/* Appearance */}
          <div className="bg-card border border-border rounded-lg p-4 space-y-4">
            <SectionLabel>Appearance</SectionLabel>

            <div className="flex items-center gap-6">
              <span className="text-xs text-slate-500 w-12 shrink-0">Theme</span>
              <div className="flex gap-1.5">
                {(['dark', 'light'] as Theme[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      theme === t
                        ? 'bg-violet-600 text-white'
                        : 'bg-panel text-slate-400 hover:text-slate-300 hover:bg-hover border border-border'
                    }`}
                  >
                    {t === 'dark' ? 'Dark' : 'Light'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-6">
              <span className="text-xs text-slate-500 w-12 shrink-0">Zoom</span>
              <div className="flex gap-1.5">
                {ZOOM_LEVELS.map(z => (
                  <button
                    key={z}
                    onClick={() => setZoom(z as ZoomLevel)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      zoom === z
                        ? 'bg-violet-600 text-white'
                        : 'bg-panel text-slate-400 hover:text-slate-300 hover:bg-hover border border-border'
                    }`}
                  >
                    {z}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Integrations */}
          <div className="bg-card border border-border rounded-lg p-4 space-y-4">
            <SectionLabel>Integrations &amp; Scaffold</SectionLabel>

            <SettingField
              label="Default projects directory"
              hint="Where new scaffolded projects are created"
              value={settings.projects_dir ?? ''}
              placeholder="~/Projects"
              onSave={(v) => saveSetting('projects_dir', v)}
              saving={savingKey === 'projects_dir'}
            />

            {/* GitHub */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-400">GitHub (gh CLI)</span>
                {ghStatus === null
                  ? <span className="text-xs text-slate-500">checking…</span>
                  : ghStatus
                  ? <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 size={10} /> authenticated</span>
                  : <span className="text-xs text-yellow-400 flex items-center gap-1"><AlertCircle size={10} /> not found or not logged in</span>
                }
              </div>
              <p className="text-xs text-slate-600">
                Install with <code className="text-slate-400">brew install gh</code> and run{' '}
                <code className="text-slate-400">gh auth login</code>.
              </p>
            </div>

            <TokenField
              label="Vercel access token"
              hint="From vercel.com/account/tokens"
              value={settings.vercel_token ?? ''}
              visible={showTokens.vercel ?? false}
              onToggleVisible={() => setShowTokens((p) => ({ ...p, vercel: !p.vercel }))}
              onSave={(v) => saveSetting('vercel_token', v)}
              saving={savingKey === 'vercel_token'}
            />

            <TokenField
              label="Supabase access token"
              hint="From supabase.com/dashboard/account/tokens"
              value={settings.supabase_access_token ?? ''}
              visible={showTokens.supabase ?? false}
              onToggleVisible={() => setShowTokens((p) => ({ ...p, supabase: !p.supabase }))}
              onSave={(v) => saveSetting('supabase_access_token', v)}
              saving={savingKey === 'supabase_access_token'}
            />

            <SettingField
              label="Supabase organization ID"
              hint="From supabase.com/dashboard/org — looks like org_xxxxxxxx"
              value={settings.supabase_org_id ?? ''}
              placeholder="org_xxxxxxxx"
              onSave={(v) => saveSetting('supabase_org_id', v)}
              saving={savingKey === 'supabase_org_id'}
            />
          </div>

          {/* Updates */}
          <UpdatesCard
            folderPath={settings.update_folder_path ?? ''}
            onSavePath={(v) => saveSetting('update_folder_path', v)}
            savingPath={savingKey === 'update_folder_path'}
          />

          {/* Prompt Templates */}
          <div className="bg-card border border-border rounded-lg p-4 space-y-4">
            <div>
              <SectionLabel>Prompt Templates</SectionLabel>
              <p className="text-xs text-slate-600 mt-1">
                Shown as copyable cards in the Session tab on every project.
              </p>
            </div>

            <PromptField
              label="Initial kickoff prompt"
              hint="For the very first session on a new or unfamiliar project."
              value={settings.prompt_initial ?? ''}
              onSave={(v) => saveSetting('prompt_initial', v)}
              saving={savingKey === 'prompt_initial'}
            />

            <PromptField
              label="New session / continuing prompt"
              hint="Orientation pass — orient, review recent work, propose next steps."
              value={settings.prompt_continuing ?? ''}
              onSave={(v) => saveSetting('prompt_continuing', v)}
              saving={savingKey === 'prompt_continuing'}
            />
          </div>

          {/* CLAUDE.md Template */}
          <div className="bg-card border border-border rounded-lg p-4 space-y-4">
            <div>
              <SectionLabel>CLAUDE.md Template</SectionLabel>
              <p className="text-xs text-slate-600 mt-1">
                Written as <code className="text-slate-400">CLAUDE.md</code> when scaffolding a new project.
                Leave empty to use the auto-generated version.
                Use <code className="text-slate-400">{'{{project_name}}'}</code> and{' '}
                <code className="text-slate-400">{'{{project_description}}'}</code> as placeholders.
              </p>
            </div>

            <PromptField
              label="Template content"
              hint=""
              value={settings.claude_md_template ?? ''}
              onSave={(v) => saveSetting('claude_md_template', v)}
              saving={savingKey === 'claude_md_template'}
              rows={16}
            />
          </div>

          {msg && (
            <div className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
              msg.type === 'ok'
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              {msg.type === 'ok'
                ? <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
                : <AlertCircle size={12} className="mt-0.5 shrink-0" />}
              {msg.text}
            </div>
          )}

          {/* Export / Import */}
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <SectionLabel>Data Portability</SectionLabel>
            <p className="text-xs text-slate-500 leading-relaxed">
              Export your project metadata to a JSON file that you can back up or transfer to another Mac.
              Local repo paths are included but are machine-specific — use{' '}
              <strong className="text-slate-400">Relink Repo Path</strong> on each project after importing.
            </p>
            <div className="flex gap-2 pt-1">
              <Button variant="primary" size="sm" onClick={handleExport} disabled={exporting}>
                {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Export JSON
              </Button>
              <Button variant="secondary" size="sm" onClick={handleImport} disabled={importing}>
                {importing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                Import JSON
              </Button>
            </div>
          </div>

          {/* About */}
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <SectionLabel>About</SectionLabel>
            <div className="space-y-0">
              <Row label="App" value="Launchpad" />
              <Row label="Version" value={appVersion || '…'} />
              <Row label="Storage" value="~/Library/Application Support/com.glen.launchpad/" />
              <Row label="Backend" value="Rust + SQLite (local-only)" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-border-subtle last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-400 text-right font-mono text-xs break-all">{value}</span>
    </div>
  );
}

function SettingField({
  label, hint, value, placeholder, onSave, saving,
}: {
  label: string; hint?: string; value: string; placeholder?: string;
  onSave: (v: string) => void; saving: boolean;
}) {
  const [local, setLocal] = useState(value);
  const dirty = local !== value;

  // Keep in sync when value loads from DB
  useEffect(() => { setLocal(value); }, [value]);

  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {hint && <p className="text-xs text-slate-600 mb-1">{hint}</p>}
      <div className="flex gap-2">
        <input
          type="text"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-base border border-border rounded-md px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50 font-mono"
        />
        <Button
          variant="secondary" size="sm"
          onClick={() => onSave(local)}
          disabled={!dirty || saving}
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function UpdatesCard({
  folderPath, onSavePath, savingPath,
}: {
  folderPath: string;
  onSavePath: (v: string) => void;
  savingPath: boolean;
}) {
  const [appVersion, setAppVersion]     = useState('');
  const [publishNotes, setPublishNotes] = useState('');
  const [publishing, setPublishing]     = useState(false);
  const [publishMsg, setPublishMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { getVersion().then(setAppVersion).catch(() => {}); }, []);

  async function handlePublish() {
    setPublishing(true);
    setPublishMsg(null);
    try {
      const path = await publishCurrentVersion(publishNotes);
      setPublishMsg({ ok: true, text: `Written to ${path}` });
      setPublishNotes('');
    } catch (e) {
      setPublishMsg({ ok: false, text: String(e) });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div>
        <SectionLabel>Updates</SectionLabel>
        <p className="text-xs text-slate-600 mt-1">
          Point to a shared folder (e.g. Dropbox). Drop the DMG there and publish a{' '}
          <code className="text-slate-400">version.json</code> — the app checks on launch
          and shows a banner when a newer version is available.
        </p>
      </div>

      <SettingField
        label="Shared folder path"
        hint="The folder where you drop the DMG and version.json"
        value={folderPath}
        placeholder="~/Dropbox/Team/Launchpad"
        onSave={onSavePath}
        saving={savingPath}
      />

      {folderPath && (
        <div className="space-y-2 pt-1 border-t border-border-subtle">
          <label className="block text-xs text-slate-400">
            Publish current version{appVersion ? ` (${appVersion})` : ''}
          </label>
          <p className="text-xs text-slate-600">
            Writes <code className="text-slate-400">version.json</code> to the folder above,
            telling others a new build is available. Do this after dropping in a new DMG.
          </p>
          <textarea
            value={publishNotes}
            onChange={(e) => setPublishNotes(e.target.value)}
            rows={2}
            placeholder="Release notes (optional) — e.g. Added prompt templates, fixed scaffold bug"
            className="w-full bg-base border border-border rounded-md px-3 py-2 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50 resize-none"
          />
          <div className="flex items-center gap-3">
            <Button variant="primary" size="sm" onClick={handlePublish} disabled={publishing || !folderPath}>
              {publishing ? <Loader2 size={11} className="animate-spin" /> : null}
              Publish version {appVersion}
            </Button>
            {folderPath && (
              <button
                onClick={() => openFolder(folderPath).catch(() => {})}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-default"
              >
                Open folder
              </button>
            )}
          </div>
          {publishMsg && (
            <div className={`flex items-start gap-1.5 text-xs ${publishMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
              {publishMsg.ok
                ? <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
                : <AlertCircle  size={12} className="mt-0.5 shrink-0" />}
              {publishMsg.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PromptField({
  label, hint, value, onSave, saving, rows = 8,
}: {
  label: string; hint?: string; value: string;
  onSave: (v: string) => void; saving: boolean; rows?: number;
}) {
  const [local, setLocal] = useState(value);
  const dirty = local !== value;

  useEffect(() => { setLocal(value); }, [value]);

  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {hint && <p className="text-xs text-slate-600 mb-1">{hint}</p>}
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        rows={rows}
        className="w-full bg-base border border-border rounded-md px-3 py-2 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50 resize-y font-mono leading-relaxed"
        spellCheck={false}
      />
      <div className="mt-1.5">
        <Button
          variant="secondary" size="sm"
          onClick={() => onSave(local)}
          disabled={!dirty || saving}
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function TokenField({
  label, hint, value, visible, onToggleVisible, onSave, saving,
}: {
  label: string; hint?: string; value: string; visible: boolean;
  onToggleVisible: () => void; onSave: (v: string) => void; saving: boolean;
}) {
  const [local, setLocal] = useState(value);
  const dirty = local !== value;

  useEffect(() => { setLocal(value); }, [value]);

  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {hint && <p className="text-xs text-slate-600 mb-1">{hint}</p>}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? 'text' : 'password'}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            placeholder={visible ? 'paste token here' : '••••••••••••••••'}
            className="w-full bg-base border border-border rounded-md px-3 py-1.5 pr-8 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50 font-mono"
          />
          <button
            type="button"
            onClick={onToggleVisible}
            className="absolute right-2 top-1.5 text-slate-500 hover:text-slate-300"
          >
            {visible ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
        <Button
          variant="secondary" size="sm"
          onClick={() => onSave(local)}
          disabled={!dirty || saving}
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : 'Save'}
        </Button>
      </div>
    </div>
  );
}
