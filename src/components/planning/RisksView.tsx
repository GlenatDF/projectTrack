import { useEffect, useState } from 'react';
import { getProjectPlan } from '../../lib/api';
import type { ProjectPlan } from '../../lib/types';
import { RiskLevelBadge } from './RiskLevelBadge';

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
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        Loading…
      </div>
    );
  }

  const risks = plan?.risks ?? [];
  const assumptions = plan?.assumptions ?? [];
  const empty = risks.length === 0 && assumptions.length === 0;

  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-gray-500 text-sm">
          No risks or assumptions yet. Generate a plan to populate this view.
        </p>
      </div>
    );
  }

  // Group assumptions by category
  const assumptionsByCategory = assumptions.reduce<Record<string, typeof assumptions>>(
    (acc, a) => {
      const cat = a.category || 'other';
      acc[cat] = [...(acc[cat] ?? []), a];
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-6">
      {/* Risks table */}
      {risks.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">
            Risks ({risks.length})
          </h3>
          <div className="border border-[#2a2d3a] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2d3a] text-xs text-gray-500 uppercase">
                  <th className="text-left px-4 py-2.5 font-medium">Risk</th>
                  <th className="text-left px-3 py-2.5 font-medium w-24">Likelihood</th>
                  <th className="text-left px-3 py-2.5 font-medium w-24">Impact</th>
                  <th className="text-left px-3 py-2.5 font-medium">Mitigation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2d3a]/50">
                {risks.map(risk => (
                  <tr key={risk.id} className="hover:bg-white/2">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-200">{risk.title}</div>
                      {risk.description && (
                        <div className="text-xs text-gray-500 mt-0.5">{risk.description}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <RiskLevelBadge level={risk.likelihood} />
                    </td>
                    <td className="px-3 py-3">
                      <RiskLevelBadge level={risk.impact} />
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-400">{risk.mitigation || '—'}</td>
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
          <h3 className="text-sm font-semibold text-gray-300 mb-3">
            Assumptions ({assumptions.length})
          </h3>
          <div className="space-y-3">
            {Object.entries(assumptionsByCategory).map(([category, items]) => (
              <div key={category} className="border border-[#2a2d3a] rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-white/2 border-b border-[#2a2d3a]">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                    {category}
                  </span>
                </div>
                <ul className="divide-y divide-[#2a2d3a]/50">
                  {items.map(assumption => (
                    <li key={assumption.id} className="px-4 py-3">
                      <div className="text-sm text-gray-200">{assumption.title}</div>
                      {assumption.description && (
                        <div className="text-xs text-gray-500 mt-0.5">{assumption.description}</div>
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
