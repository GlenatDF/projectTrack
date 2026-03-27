import { useEffect, useState } from 'react';
import { Download, Upload, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff } from 'lucide-react';
import { exportProjects, importProjects, getSettings, updateSetting, checkGhCli } from '../lib/api';
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

  // Integration settings
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [ghStatus, setGhStatus] = useState<boolean | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {});
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
      downloadJson(json, `project-tracker-export-${date}.json`);
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
              <Row label="App" value="Project Track" />
              <Row label="Version" value="0.1.0" />
              <Row label="Storage" value="~/Library/Application Support/com.glen.projecttracker/" />
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
