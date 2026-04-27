import { PANEL_CRITERIA, PANEL_SCORING_GROUPS, type PanelRating } from '@/lib/applications/panel-scoring';

export type CriterionVoteCounts = { S: number; R: number; W: number; I: number };

export type CriterionAggregate = {
  criterion_key: string;
  label: string;
  category: string;
  scores: CriterionVoteCounts;
  consensus: PanelRating;
};

const emptyCounts = (): CriterionVoteCounts => ({ S: 0, R: 0, W: 0, I: 0 });

function isPanelRating(s: string | null | undefined): s is PanelRating {
  return s === 'S' || s === 'R' || s === 'W' || s === 'I';
}

export function consensusFromCounts(c: CriterionVoteCounts): PanelRating {
  const order: PanelRating[] = ['S', 'R', 'W', 'I'];
  let best: PanelRating = 'I';
  let max = -1;
  for (const t of order) {
    if (c[t] > max) {
      max = c[t];
      best = t;
    }
  }
  return best;
}

export function ratingToNum(r: PanelRating): number {
  if (r === 'S') return 4;
  if (r === 'R') return 3;
  if (r === 'W') return 2;
  return 1;
}

/**
 * Aggregate all panel evaluation score rows for an application into
 * per-criterion vote counts, category numeric averages, and overall average.
 */
export function aggregatePanelScoreRows(
  scoreRows: Array<{ criterion_key: string; rating: string | null }>,
): {
  criteria: CriterionAggregate[];
  category_averages: Record<string, number>;
  overall_average: number;
} {
  const countsByKey = new Map<string, CriterionVoteCounts>();
  for (const c of PANEL_CRITERIA) {
    countsByKey.set(c.key, emptyCounts());
  }

  for (const row of scoreRows) {
    const key = String(row.criterion_key ?? '');
    if (!isPanelRating(row.rating)) continue;
    const bucket = countsByKey.get(key);
    if (!bucket) continue;
    bucket[row.rating] += 1;
  }

  const criteria: CriterionAggregate[] = PANEL_CRITERIA.map((c) => {
    const scores = countsByKey.get(c.key) ?? emptyCounts();
    return {
      criterion_key: c.key,
      label: c.label,
      category: c.category,
      scores,
      consensus: consensusFromCounts(scores),
    };
  });

  const categoryTotals = new Map<string, { sum: number; n: number }>();
  for (const g of PANEL_SCORING_GROUPS) {
    categoryTotals.set(g.category, { sum: 0, n: 0 });
  }

  for (const row of scoreRows) {
    if (!isPanelRating(row.rating)) continue;
    const crit = PANEL_CRITERIA.find((c) => c.key === row.criterion_key);
    if (!crit) continue;
    const agg = categoryTotals.get(crit.category);
    if (!agg) continue;
    agg.sum += ratingToNum(row.rating);
    agg.n += 1;
  }

  const category_averages: Record<string, number> = {};
  for (const g of PANEL_SCORING_GROUPS) {
    const { sum, n } = categoryTotals.get(g.category) ?? { sum: 0, n: 0 };
    category_averages[g.category] = n > 0 ? Math.round((sum / n) * 100) / 100 : 0;
  }

  let overallSum = 0;
  let overallN = 0;
  for (const row of scoreRows) {
    if (!isPanelRating(row.rating)) continue;
    if (!PANEL_CRITERIA.some((c) => c.key === row.criterion_key)) continue;
    overallSum += ratingToNum(row.rating);
    overallN += 1;
  }
  const overall_average = overallN > 0 ? Math.round((overallSum / overallN) * 100) / 100 : 0;

  return { criteria, category_averages, overall_average };
}
