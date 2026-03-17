import type { TaskCategory } from '../../lib/types';
import { TASK_CATEGORY_COLORS } from '../../lib/types';

interface Props {
  category: TaskCategory;
}

export function CategoryBadge({ category }: Props) {
  const cls = TASK_CATEGORY_COLORS[category] ?? 'bg-gray-500/20 text-gray-300';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>
      {category}
    </span>
  );
}
