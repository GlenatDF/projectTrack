import { useEffect, useState, useCallback } from 'react';
import { Search, CheckCircle2, Download, Loader2, AlertCircle, X } from 'lucide-react';
import type { Project, SkillEntry } from '../../../lib/types';
import {
  fetchSkillsIndex,
  fetchSkillContent,
  getInstalledSkills,
  installSkill,
} from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { SectionLabel } from '../../../components/ui/SectionLabel';

// ── Category display helpers ───────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  'business-growth':    'Business Growth',
  'c-level-advisor':    'C-Level Advisor',
  'engineering':        'Engineering',
  'engineering-team':   'Engineering Team',
  'finance':            'Finance',
  'marketing-skill':    'Marketing',
  'product-team':       'Product',
  'project-management': 'Project Mgmt',
};

const CATEGORY_COLORS: Record<string, string> = {
  'business-growth':    'bg-emerald-500/15 text-emerald-300',
  'c-level-advisor':    'bg-violet-500/15 text-violet-300',
  'engineering':        'bg-blue-500/15 text-blue-300',
  'engineering-team':   'bg-cyan-500/15 text-cyan-300',
  'finance':            'bg-yellow-500/15 text-yellow-300',
  'marketing-skill':    'bg-pink-500/15 text-pink-300',
  'product-team':       'bg-orange-500/15 text-orange-300',
  'project-management': 'bg-slate-500/15 text-slate-300',
};

// ── Frontmatter parser ─────────────────────────────────────────────────────────

function extractFrontmatterDescription(content: string): string {
  if (!content.startsWith('---')) return '';
  const end = content.indexOf('---', 3);
  if (end === -1) return '';
  const fm = content.slice(3, end);
  for (const line of fm.split('\n')) {
    const match = line.match(/^description:\s*(.+)/);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  project: Project;
}

export function SkillsView({ project }: Props) {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillEntry | null>(null);

  const [skillContent, setSkillContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [description, setDescription] = useState('');

  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [justInstalled, setJustInstalled] = useState<string | null>(null);

  const hasRepo = !!project.local_repo_path?.trim();

  // Load index + installed list on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchSkillsIndex(),
      getInstalledSkills(project.id),
    ])
      .then(([index, inst]) => {
        if (cancelled) return;
        setSkills(index);
        setInstalled(new Set(inst));
      })
      .catch((e) => {
        if (!cancelled) setFetchError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [project.id]);

  // Fetch content when a skill is selected
  const handleSelectSkill = useCallback(async (skill: SkillEntry) => {
    setSelectedSkill(skill);
    setSkillContent(null);
    setInstallError(null);
    setDescription('');
    setLoadingContent(true);
    try {
      const content = await fetchSkillContent(skill.path);
      setSkillContent(content);
      setDescription(extractFrontmatterDescription(content));
    } catch (e) {
      setSkillContent(null);
      setInstallError(String(e));
    } finally {
      setLoadingContent(false);
    }
  }, []);

  async function handleInstall() {
    if (!selectedSkill || !skillContent) return;
    setInstalling(true);
    setInstallError(null);
    try {
      await installSkill(
        project.id,
        selectedSkill.name,
        selectedSkill.category,
        skillContent,
        description,
      );
      setInstalled((prev) => new Set([...prev, selectedSkill.name]));
      setJustInstalled(selectedSkill.name);
      setTimeout(() => setJustInstalled(null), 2000);
    } catch (e) {
      setInstallError(String(e));
    } finally {
      setInstalling(false);
    }
  }

  // Derived list
  const categories = Array.from(new Set(skills.map((s) => s.category))).sort();
  const filtered = skills.filter((s) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
    const matchesCategory = !selectedCategory || s.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full -mx-5 -my-4 overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
      {/* Left panel */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col overflow-hidden">
        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills…"
              className="w-full bg-base border border-border rounded pl-7 pr-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50"
            />
          </div>
        </div>

        {/* Category filter */}
        {categories.length > 0 && (
          <div className="px-3 py-2 border-b border-border flex flex-wrap gap-1">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`text-[10px] px-2 py-0.5 rounded-full transition-colors cursor-default ${
                selectedCategory === null
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'bg-surface text-slate-500 hover:text-slate-300'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                className={`text-[10px] px-2 py-0.5 rounded-full transition-colors cursor-default ${
                  selectedCategory === cat
                    ? 'bg-violet-500/20 text-violet-300'
                    : 'bg-surface text-slate-500 hover:text-slate-300'
                }`}
              >
                {CATEGORY_LABELS[cat] ?? cat}
              </button>
            ))}
          </div>
        )}

        {/* Skill list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="animate-spin text-slate-500" />
            </div>
          ) : fetchError ? (
            <div className="p-3 text-xs text-red-400 flex items-start gap-2">
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              <span>{fetchError}</span>
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-3 text-xs text-slate-600 italic">No skills found.</p>
          ) : (
            filtered.map((skill) => {
              const isSelected = selectedSkill?.path === skill.path;
              const isInstalled = installed.has(skill.name);
              return (
                <button
                  key={skill.path}
                  onClick={() => handleSelectSkill(skill)}
                  className={`w-full text-left px-3 py-2 border-b border-border-subtle transition-colors cursor-default ${
                    isSelected
                      ? 'bg-violet-500/10 border-l-2 border-l-violet-500'
                      : 'hover:bg-hover border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-xs text-slate-200 leading-snug">{skill.name}</span>
                    {isInstalled && (
                      <CheckCircle2 size={11} className="text-green-400 shrink-0 mt-0.5" />
                    )}
                  </div>
                  <span className={`mt-0.5 inline-block text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_COLORS[skill.category] ?? 'bg-slate-500/15 text-slate-300'}`}>
                    {CATEGORY_LABELS[skill.category] ?? skill.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Count */}
        {!loading && !fetchError && (
          <div className="px-3 py-1.5 border-t border-border">
            <p className="text-[10px] text-slate-600">
              {filtered.length} skill{filtered.length !== 1 ? 's' : ''}
              {installed.size > 0 && ` · ${installed.size} installed`}
            </p>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedSkill ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-slate-600 italic">Select a skill to preview</p>
          </div>
        ) : (
          <>
            {/* Skill header */}
            <div className="shrink-0 px-5 py-3 border-b border-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">{selectedSkill.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_COLORS[selectedSkill.category] ?? 'bg-slate-500/15 text-slate-300'}`}>
                      {CATEGORY_LABELS[selectedSkill.category] ?? selectedSkill.category}
                    </span>
                    {installed.has(selectedSkill.name) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-300 flex items-center gap-1">
                        <CheckCircle2 size={9} /> Installed
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSkill(null)}
                  className="text-slate-600 hover:text-slate-400 cursor-default shrink-0 mt-0.5"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {loadingContent ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={16} className="animate-spin text-slate-500" />
                </div>
              ) : skillContent !== null ? (
                <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
                  {skillContent}
                </pre>
              ) : null}
            </div>

            {/* Install section */}
            <div className="shrink-0 px-5 py-3 border-t border-border space-y-2">
              {!hasRepo ? (
                <p className="text-xs text-slate-500 italic">
                  No repository path set — link a repo in Overview to install skills.
                </p>
              ) : (
                <>
                  <div>
                    <SectionLabel>CLAUDE.md entry</SectionLabel>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="When to use this skill…"
                      className="mt-1 w-full bg-base border border-border rounded px-2.5 py-1.5 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-violet-500/50"
                    />
                  </div>
                  {installError && (
                    <div className="flex items-start gap-1.5 text-xs text-red-400">
                      <AlertCircle size={11} className="shrink-0 mt-0.5" />
                      <span>{installError}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleInstall}
                      disabled={installing || loadingContent || !skillContent}
                    >
                      {installing ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Download size={11} />
                      )}
                      {installed.has(selectedSkill.name) ? 'Reinstall' : 'Install skill'}
                    </Button>
                    {justInstalled === selectedSkill.name && (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        <CheckCircle2 size={11} /> Installed ✓
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
