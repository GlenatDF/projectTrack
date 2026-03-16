import { useState } from 'react';
import { Download, Upload, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { exportProjects, importProjects } from '../lib/api';
import { downloadJson, readJsonFile } from '../lib/utils';

export default function Settings() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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
    <div className="px-6 py-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">App configuration and data management</p>
      </div>

      {msg && (
        <div className={`mb-5 p-3 rounded-lg border text-sm flex items-start gap-2 ${
          msg.type === 'ok'
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {msg.type === 'ok' ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
          {msg.text}
        </div>
      )}

      {/* Export / Import */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Data Portability</h2>
        <p className="text-sm text-slate-400">
          Export your project metadata to a JSON file that you can back up or transfer to another Mac.
          Local repo paths are included but are machine-specific — use <strong className="text-slate-300">Relink Repo Path</strong> on each project after importing.
        </p>

        <div className="flex gap-3">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export JSON
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 bg-surface border border-border hover:bg-hover text-slate-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Import JSON
          </button>
        </div>
      </div>

      {/* App info */}
      <div className="bg-card border border-border rounded-xl p-5 mt-4 space-y-2">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">About</h2>
        <div className="space-y-1 text-sm">
          <Row label="App" value="Project Tracker" />
          <Row label="Version" value="0.1.0" />
          <Row label="Storage" value="~/Library/Application Support/com.glen.projecttracker/" />
          <Row label="Backend" value="Rust + SQLite (local-only)" />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 border-b border-border last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-400 text-right font-mono text-xs break-all">{value}</span>
    </div>
  );
}
