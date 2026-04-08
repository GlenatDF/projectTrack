import { useEffect, useState } from 'react';
import { getProjectPlan } from '../../../../lib/api';
import type { ProjectPlan } from '../../../../lib/types';
import { RiskLevelBadge } from './RiskLevelBadge';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { SectionLabel } from '../../../../components/ui/SectionLabel';

interface Props {
  projectId: number;
  planVersion: number;
}

export function RisksView({ projectId, planVersion }: Props) {
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setPlan(await getProjectPlan(projectId));
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, planVersion]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-xs">
        Loading…
      </div>
    );
  }

  const risks = plan?.risks ?? [];
  const assumptions = plan?.assumptions ?? [];

  if (risks.length === 0 && assumptions.length === 0) {
    return (
      <EmptyState
        title="No risks or assumptions"
        description="Generate a plan to populate this view"
      />
    );
  }

  const assumptionsByCategory = assumptions.reduce<Record<string, typeof assumptions>>(
    (acc, a) => {
      const cat = a.category || 'other';
      acc[cat] = [...(acc[cat] ?? []), a];
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-5">
      {/* Risks table */}
      {risks.length > 0 && (
        <section>
          <SectionLabel className="mb-3">Risks ({risks.length})</SectionLabel>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-panel border-b border-border">
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Risk</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-widest w-24">Likelihood</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-widest w-24">Impact</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Mitigation</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((risk, i) => (
                  <tr key={risk.id} className={`hover:bg-hover transition-colors ${i < risks.length - 1 ? 'border-b border-border-subtle' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-slate-200">{risk.title}</div>
                      {risk.description && (
                        <div className="text-[11px] text-slate-500 mt-0.5">{risk.description}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <RiskLevelBadge level={risk.likelihood} />
                    </td>
                    <td className="px-3 py-3">
                      <RiskLevelBadge level={risk.impact} />
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{risk.mitigation || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Assumptions grouped by category */}
      {assumptions.length > 0 && (
        <section>
          <SectionLabel className="mb-3">Assumptions ({assumptions.length})</SectionLabel>
          <div className="space-y-2">
            {Object.entries(assumptionsByCategory).map(([category, items]) => (
              <div key={category} className="border border-border rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-panel border-b border-border">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
                    {category}
                  </span>
                </div>
                <ul>
                  {items.map((assumption, i) => (
                    <li key={assumption.id} className={`px-4 py-2.5 ${i < items.length - 1 ? 'border-b border-border-subtle' : ''}`}>
                      <div className="text-xs text-slate-300">{assumption.title}</div>
                      {assumption.description && (
                        <div className="text-[11px] text-slate-500 mt-0.5">{assumption.description}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
