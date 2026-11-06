/* Filtering and the rows of the Plan (Gantt): grouped by area, footprint, build tree, project or type. */
import type { Area, Footprint, Item, Stage, ViewState } from './types';
import { Plan, onDay, s0 } from './plan';
import { byCodeCmp, dn, TODAY } from './util';

export const ONLY: Record<string, string> = { problems: 'Only with problems', unplaced: 'Only not in a footprint', now: 'Only on site today' };

export function itemMatch(P: Plan, f: ViewState['f'], it: Item) {
  if (!P.shown(it)) return false;
  if (f.type && it.type !== f.type) return false;
  if (f.area && it.area !== f.area) return false;
  if (f.q) { const q = f.q.toLowerCase(); if (!((it.code || '') + ' ' + (it.name || '')).toLowerCase().includes(q)) return false; }
  if (f.only === 'problems' && !P.probs(it.id).length) return false;
  if (f.only === 'unplaced' && P.placed(it)) return false;
  if (f.only === 'now' && !onDay(it, TODAY)) return false;
  return true;
}
export function filterChipList(P: Plan, f: ViewState['f']) {
  const c: [keyof ViewState['f'], string][] = [];
  if (f.type) c.push(['type', 'Type: ' + P.typ(f.type).name]);
  if (f.area) c.push(['area', 'Area: ' + (P.area(f.area)?.name || '?')]);
  if (f.q) c.push(['q', `“${f.q}”`]);
  if (f.only) c.push(['only', ONLY[f.only]]);
  return c;
}

export interface Row {
  key: string; lvl: number; y: number; h: number;
  grp?: boolean; label?: string; color?: string; n?: number; col?: boolean; area?: Area; fp?: Footprint; unp?: string; cont?: boolean;
  it?: Item; sg?: Stage; tree?: boolean; hasKids?: boolean;
}
export const RH = 30, SH = 23, HH = 44;

export function groupKeys(P: Plan, g: ViewState['gGroup']) {
  if (g === 'tree') return P.S.items.filter(i => P.kidsOf(i.id).length).map(i => 'n:' + i.id);
  if (g === 'area' || g === 'fp') return [...P.areasSorted().map(a => 'a:' + a.id), 'a:', ...(g === 'fp' ? P.S.footprints.map(f => 'f:' + f.id) : [])];
  if (g === 'proj') return P.S.projects.map(p => 'p:' + p.id);
  if (g === 'type') return P.S.types.map(t => 't:' + t.id);
  return [];
}

export function buildRows(P: Plan, V: Pick<ViewState, 'collapsed' | 'shut' | 'stages' | 'gGroup' | 'f' | 'hide'>, opts: { all?: boolean; stages?: boolean } = {}) {
  const coll = opts.all ? [] : V.collapsed, shut = opts.all ? [] : V.shut, withSt = opts.stages ?? V.stages;
  const L = P.S.items.filter(it => itemMatch(P, V.f, it)).sort((a, b) => (dn(a.start) ?? 1e9) - (dn(b.start) ?? 1e9) || (a.code || '').localeCompare(b.code || ''));
  const rows: Row[] = [], g = V.gGroup;
  const stagesOf = (it: Item) => [...it.stages].sort((a, b) => (dn(a.start) ?? 0) - (dn(b.start) ?? 0));
  const pushItem = (it: Item, key: string, lvl: number) => {
    rows.push({ it, key, lvl, y: 0, h: 0 });
    if (withSt && it.stages?.length && !shut.includes(it.id)) stagesOf(it).forEach(sg => rows.push({ sg, it, key, lvl, y: 0, h: 0 }));
  };
  const grp = (key: string, label: string, color: string, items: Item[], extra: Partial<Row>, lvl = 0, kids?: () => void) => {
    const col = coll.includes(key);
    rows.push({ grp: true, key, label, color, n: items.length, col, lvl, y: 0, h: 0, ...extra });
    if (col) return;
    if (kids) kids(); else items.forEach(it => pushItem(it, key, lvl + 1));
  };
  if (g === 'area' || g === 'fp') {
    P.areasSorted().forEach(a => {
      const its = L.filter(i => i.area === a.id);
      grp('a:' + a.id, a.name, a.color, its, { area: a }, 0, g === 'fp' ? () => {
        P.fpsIn(a.id).forEach(f => grp('f:' + f.id, f.code, a.color, its.filter(i => i.fp === f.id), { fp: f }, 1));
        const un = its.filter(i => !P.placed(i));
        if (un.length) grp('f:-' + a.id, 'Not in a footprint', '#9a97a1', un, { unp: a.id }, 1);
      } : undefined);
    });
    const un = L.filter(i => !P.area(i.area));
    if (un.length) grp('a:', 'No area', '#9a97a1', un, {});
  } else if (g === 'tree') {
    const inL = new Set(L.map(i => i.id));
    const walk = (it: Item, lvl: number) => {
      if (!inL.has(it.id)) { P.kidsOf(it.id).forEach(k => walk(k, lvl)); return; }
      const kid = P.kidsOf(it.id), col = coll.includes('n:' + it.id);
      rows.push({ it, key: 'n:' + (it.parent || ''), lvl, tree: true, hasKids: kid.length > 0, col, y: 0, h: 0 });
      if (withSt && it.stages?.length && !shut.includes(it.id)) stagesOf(it).forEach(sg => rows.push({ sg, it, key: '', lvl, y: 0, h: 0 }));
      if (!col) kid.forEach(k => walk(k, lvl + 1));
    };
    const tops = L.filter(i => !P.isUnderAny(i, inL));
    tops.sort((a, b) => P.proj(a.proj).name.localeCompare(P.proj(b.proj).name) || (P.kidsOf(b.id).length ? 1 : 0) - (P.kidsOf(a.id).length ? 1 : 0) || byCodeCmp(a, b)).forEach(t => walk(t, 0));
  } else if (g === 'proj') P.S.projects.filter(p => !V.hide.includes(p.id)).forEach(p => grp('p:' + p.id, p.name, p.color, L.filter(i => i.proj === p.id), {}));
  else if (g === 'type') P.S.types.forEach(t => { const it = L.filter(i => i.type === t.id); if (it.length) grp('t:' + t.id, t.name, t.color, it, {}); });
  else L.forEach(it => pushItem(it, '', 0));
  let y = 0;
  rows.forEach(r => { r.h = r.sg ? SH : RH; r.y = y; y += r.h; });
  return { rows, H: y };
}

/** an item's sort start, for lists */
export const startOr = (it: Item, dflt = 1e9) => (it.start ? s0(it) : dflt);
