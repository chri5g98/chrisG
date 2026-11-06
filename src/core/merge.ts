/* Three-way merge for the shared file: base = what we last read or wrote, mine = this browser, theirs = the file now. */
import type { PlanState } from './types';

const COLS = ['projects', 'types', 'stypes', 'areas', 'footprints', 'items', 'profiles'] as const;

export function mergeStates(base: PlanState | null, mine: PlanState, theirs: PlanState) {
  const out = JSON.parse(JSON.stringify(theirs)) as PlanState;
  let conflicts = 0;
  COLS.forEach(k => {
    const B = new Map(((base?.[k] || []) as { id: string }[]).map(x => [x.id, JSON.stringify(x)]));
    const M = new Map(((mine[k] || []) as { id: string }[]).map(x => [x.id, x]));
    const T = new Map(((theirs[k] || []) as { id: string }[]).map(x => [x.id, x]));
    const res: unknown[] = [];
    const order = [...((theirs[k] || []) as { id: string }[]).map(x => x.id), ...((mine[k] || []) as { id: string }[]).map(x => x.id)];
    const seen = new Set<string>();
    order.forEach(id => {
      if (seen.has(id)) return;
      seen.add(id);
      const b = B.get(id), m = M.get(id), t = T.get(id);
      const mj = m ? JSON.stringify(m) : undefined, tj = t ? JSON.stringify(t) : undefined;
      const mCh = mj !== b, tCh = tj !== b;
      let pick;
      if (mCh && !tCh) pick = m;
      else if (!mCh && tCh) pick = t;
      else if (mCh && tCh) { pick = m || t; if (mj !== tj) conflicts++; }
      else pick = t;
      if (pick) res.push(JSON.parse(JSON.stringify(pick)));
    });
    (out as unknown as Record<string, unknown[]>)[k] = res;
  });
  if (JSON.stringify(mine.set) !== JSON.stringify(base?.set)) out.set = mine.set;
  if (JSON.stringify(mine.drawing) !== JSON.stringify(base?.drawing)) out.drawing = mine.drawing;
  return { state: out, conflicts };
}
