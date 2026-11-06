/* Everything worked out from the data: lookups, the build tree, problem checks and footprint capacity.
   A Plan is built once per data change (and per set of hidden projects) and then only read. */
import type { Area, ClashPair, Footprint, Item, ItemType, PlanState, Problem, Project, Stage, StageType } from './types';
import { frameOf } from './geometry';
import { byCodeCmp, clamp, dn, fd, monday, r1, TODAY } from './util';

const NO_PROJ: Project = { id: '', code: '–', name: 'No project', color: '#9a97a1' };
const NO_TYPE: ItemType = { id: '', name: 'Other', color: '#7a7884', shape: 'box', std: [] };
const NO_STYPE: StageType = { id: '', name: 'Stage', color: '#7a7884' };

export type ItemState = 'none' | 'wait' | 'build' | 'done';
export interface Occ { n: number; cap: number; unp: number; d?: number }
interface AreaOcc { n: Int32Array; unp: Int32Array; p: Record<string, Int32Array>; t: Record<string, Int32Array>; pu: Record<string, Int32Array>; tu: Record<string, Int32Array>; cap: number }

export const s0 = (it: Item) => dn(it.start)!;
export const s1 = (it: Item) => dn(it.finish)!;
export const onDay = (it: Item, d: number) => !!it.start && s0(it) <= d && d <= s1(it);
export const ratioCol = (n: number, cap: number) => (!n ? 'var(--none)' : n > cap ? 'var(--late)' : n === cap ? 'var(--risk)' : 'var(--ok)');
export function heatCol(n: number, cap: number) {
  if (!n) return 'var(--sunk)';
  if (!cap || n > cap) return '#b8321f';
  if (n === cap) return '#d99a2b';
  const t = n / cap, c0 = [218, 232, 242], c1 = [47, 95, 143];
  return `rgb(${c0.map((v, i) => Math.round(v + (c1[i] - v) * t))})`;
}

export class Plan {
  readonly S: PlanState;
  readonly hide: string[];
  private itemMap: Map<string, Item>;
  private kids = new Map<string, Item[]>();
  readonly by = new Map<string, Problem[]>();
  readonly pairs: ClashPair[] = [];
  readonly R: { d0: number; d1: number };
  readonly N: number;
  private occ: Record<string, AreaOcc> = {};

  constructor(S: PlanState, hide: string[] = []) {
    this.S = S; this.hide = hide;
    this.itemMap = new Map(S.items.map(i => [i.id, i]));
    S.items.forEach(i => { if (i.parent) { if (!this.kids.has(i.parent)) this.kids.set(i.parent, []); this.kids.get(i.parent)!.push(i); } });
    this.kids.forEach(L => L.sort(byCodeCmp));
    this.computeChecks();
    this.R = this.planRange(); this.N = this.R.d1 - this.R.d0 + 2;
    this.computeOcc();
  }

  /* ---------- lookups ---------- */
  item = (id: string | null | undefined) => (id ? this.itemMap.get(id) : undefined);
  proj = (id: string) => this.S.projects.find(x => x.id === id) || NO_PROJ;
  typ = (id: string) => this.S.types.find(x => x.id === id) || NO_TYPE;
  stype = (id: string) => this.S.stypes.find(x => x.id === id) || NO_STYPE;
  area = (id: string | null | undefined): Area | undefined => (id ? this.S.areas.find(x => x.id === id) : undefined);
  fpOf = (id: string | null | undefined): Footprint | undefined => (id ? this.S.footprints.find(x => x.id === id) : undefined);
  areasSorted = () => [...this.S.areas].sort((a, b) => a.ord - b.ord);
  fpsIn = (aid: string) => this.S.footprints.filter(f => f.area === aid).sort((a, b) => (a.code || '').localeCompare(b.code || '', 'en', { numeric: true }));
  capOf = (aid: string) => this.S.footprints.filter(f => f.area === aid).length;
  shown = (it: Item) => !this.hide.includes(it.proj);
  placed = (it: Item) => !!it.fp && !!this.fpOf(it.fp);
  shapeOf = (it: Item) => it.shape || this.typ(it.type).shape || 'box';
  stageOn = (it: Item, d: number): Stage | undefined => (it.stages || []).find(s => dn(s.start)! <= d && d <= dn(s.finish)!);
  mpu = () => this.S.drawing.mpu || null;
  fpSize = (f: Footprint): [number, number] | null => { const F = frameOf(f.pts), m = this.mpu(); return F && m ? [F.L * m, F.W * m] : null; };
  fmtSize = (f: Footprint) => { const z = this.fpSize(f); return z ? `${r1(Math.max(...z))} × ${r1(Math.min(...z))} m` : 'no scale set'; };
  colourOf = (it: Item, by: string) => (by === 'type' ? this.typ(it.type).color : by === 'area' ? this.area(it.area)?.color || '#7a7884' : this.proj(it.proj).color);
  shownProjects = () => this.S.projects.filter(p => !this.hide.includes(p.id));

  /* ---------- build tree ---------- */
  kidsOf = (id: string) => this.kids.get(id) || [];
  parentOf = (it: Item) => (it.parent ? this.item(it.parent) || null : null);
  isUnder(id: string, anc: string) {
    let p: string | undefined = this.item(id)?.parent, n = 0;
    while (p && n++ < 60) { if (p === anc) return true; p = this.item(p)?.parent; }
    return false;
  }
  isUnderAny(it: Item, set: Set<string>) {
    let p: string | undefined = it.parent, n = 0;
    while (p && n++ < 60) { if (set.has(p)) return true; p = this.item(p)?.parent; }
    return false;
  }
  rootOf(it: Item) { let r = it, n = 0; while (r.parent && n++ < 60) r = this.item(r.parent) || r; return r; }
  treeRoots = () => this.S.items.filter(i => !i.parent && this.kidsOf(i.id).length).sort(byCodeCmp);
  leafCount = (it: Item): number => { const k = this.kidsOf(it.id); return k.length ? k.reduce((s, c) => s + this.leafCount(c), 0) : 1; };
  treeDepth = (it: Item): number => { const k = this.kidsOf(it.id); return k.length ? 1 + Math.max(...k.map(this.treeDepth)) : 0; };
  descendants(root: Item) { const out: Item[] = []; const w = (it: Item) => this.kidsOf(it.id).forEach(k => { out.push(k); w(k); }); w(root); return out; }
  crumbs(it: Item) { const L: Item[] = []; let p = this.parentOf(it), n = 0; while (p && n++ < 20) { L.unshift(p); p = this.parentOf(p); } return L; }
  /** the day a part joins its parent: after it is finished and once the parent has started */
  joinDate(c: Item) { const p = this.parentOf(c); if (!p || !p.start || !c.finish) return null; return Math.max(s1(c) + 1, s0(p)); }
  stateOn = (it: Item, d: number): ItemState => (!it.start ? 'none' : d < s0(it) ? 'wait' : d > s1(it) ? 'done' : 'build');
  parentChoices = (it: Item) => this.S.items.filter(o => o.id !== it.id && o.proj === it.proj && !this.isUnder(o.id, it.id)).sort(byCodeCmp);
  partChoices = (it: Item) => this.S.items.filter(o => o.id !== it.id && o.proj === it.proj && !o.parent && !this.isUnder(it.id, o.id) && o.id !== this.rootOf(it).id).sort(byCodeCmp);

  /* ---------- checks ---------- */
  private computeChecks() {
    const add = (id: string, p: Problem) => { if (!this.by.has(id)) this.by.set(id, []); this.by.get(id)!.push(p); };
    const per: Record<string, Item[]> = {};
    this.S.items.forEach(it => {
      if (!this.shown(it)) return;
      const a = this.area(it.area), f = this.fpOf(it.fp);
      if (a && a.crane && it.wt && +it.wt > a.crane) add(it.id, { k: 'heavy', t: `${it.wt} t is over the ${a.crane} t crane in ${a.name}` });
      if (f && it.l && it.w) {
        const z = this.fpSize(f);
        if (z) {
          const L = Math.max(it.l, it.w), W = Math.min(it.l, it.w), FL = Math.max(...z), FW = Math.min(...z);
          if (L > FL + 1e-6 || W > FW + 1e-6) add(it.id, { k: 'size', t: `${r1(L)} × ${r1(W)} m is bigger than ${f.code} (${r1(FL)} × ${r1(FW)} m)` });
        }
      }
      if (it.start) (it.stages || []).forEach(sg => { if (dn(sg.start)! < s0(it) || dn(sg.finish)! > s1(it)) add(it.id, { k: 'stage', t: `${this.stype(sg.st).name} runs outside its dates in the area`, sg: sg.id }); });
      if (f && it.start) (per[f.id] ||= []).push(it);
    });
    for (const fid in per) {
      const L = per[fid].sort((p, q) => s0(p) - s0(q));
      const f = this.fpOf(fid)!;
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const p = L[i], q = L[j];
        if (s0(q) > s1(p)) break;
        const from = Math.max(s0(p), s0(q)), to = Math.min(s1(p), s1(q));
        this.pairs.push({ a: p.id, b: q.id, from, to, fp: fid });
        add(p.id, { k: 'clash', t: `Shares ${f.code} with ${q.code} (${fd(from)} – ${fd(to)})`, o: q.id });
        add(q.id, { k: 'clash', t: `Shares ${f.code} with ${p.code} (${fd(from)} – ${fd(to)})`, o: p.id });
      }
    }
    this.S.items.forEach(it => { const p = this.parentOf(it); if (p && p.start && it.start && s1(it) >= s1(p)) add(it.id, { k: 'join', t: `Not finished until after ${p.code} is complete (${fd(s1(p))})` }); });
    this.S.items.forEach(it => (it.pred || []).forEach(pid => { const p = this.item(pid); if (p && p.finish && it.start && s0(it) <= s1(p)) add(it.id, { k: 'seq', t: `Starts before ${p.code} finishes` }); }));
  }
  probs = (id: string) => this.by.get(id) || [];
  hasK = (id: string, k: Problem['k']) => this.probs(id).some(p => p.k === k);

  /* ---------- capacity: items needing each area, per day, against its footprints ---------- */
  private planRange() {
    let a = Infinity, b = -Infinity;
    this.S.items.forEach(it => { if (!it.start) return; a = Math.min(a, s0(it)); b = Math.max(b, s1(it)); });
    if (!isFinite(a)) { a = TODAY - 30; b = TODAY + 180; }
    a = Math.min(a, TODAY - 14); b = Math.max(b, TODAY + 60);
    return { d0: monday(a) - 7, d1: monday(b) + 13 };
  }
  private computeOcc() {
    const R = this.R, N = this.N, by: Record<string, AreaOcc> = {};
    this.S.areas.forEach(a => (by[a.id] = { n: new Int32Array(N), unp: new Int32Array(N), p: {}, t: {}, pu: {}, tu: {}, cap: this.capOf(a.id) }));
    const bump = (arr: Int32Array, i0: number, i1: number) => { arr[i0]++; arr[i1]--; };
    this.S.items.forEach(it => {
      if (!this.shown(it) || !it.start || !by[it.area]) return;
      const o = by[it.area];
      const i0 = clamp(s0(it) - R.d0, 0, N - 1), i1 = clamp(s1(it) - R.d0 + 1, 0, N - 1);
      bump(o.n, i0, i1);
      if (!this.placed(it)) { bump(o.unp, i0, i1); bump((o.pu[it.proj] ||= new Int32Array(N)), i0, i1); bump((o.tu[it.type] ||= new Int32Array(N)), i0, i1); }
      bump((o.p[it.proj] ||= new Int32Array(N)), i0, i1); bump((o.t[it.type] ||= new Int32Array(N)), i0, i1);
    });
    const cum = (a: Int32Array) => { for (let i = 1; i < N; i++) a[i] += a[i - 1]; };
    for (const k in by) { const o = by[k]; cum(o.n); cum(o.unp); [o.p, o.t, o.pu, o.tu].forEach(m => Object.values(m).forEach(cum)); }
    this.occ = by;
  }
  occAt(aid: string, d: number): Occ {
    const o = this.occ[aid];
    if (!o) return { n: 0, cap: 0, unp: 0 };
    const i = d - this.R.d0;
    if (i < 0 || i >= this.N) return { n: 0, cap: o.cap, unp: 0 };
    return { n: o.n[i], cap: o.cap, unp: o.unp[i] };
  }
  /** the busiest day of the week starting wk */
  occWeek(aid: string, wk: number): Occ {
    let best: Occ = { n: 0, cap: this.occ[aid]?.cap || 0, unp: 0, d: wk };
    for (let d = wk; d < wk + 7; d++) { const x = this.occAt(aid, d); if (x.n > best.n) best = { ...x, d }; }
    return best;
  }
  breakdown(aid: string, d: number, by: string) {
    const o = this.occ[aid], i = d - this.R.d0, out: Record<string, { n: number; unp: number }> = {};
    if (!o || i < 0 || i >= this.N) return out;
    const src = by === 'type' ? o.t : o.p, un = by === 'type' ? o.tu : o.pu;
    for (const k in src) if (src[k][i]) out[k] = { n: src[k][i], unp: un[k] ? un[k][i] : 0 };
    return out;
  }

  /** what is in each footprint on a day, and what comes next to the free ones */
  fpUse(d: number) {
    const now: Record<string, Item[]> = {}, next: Record<string, Item> = {};
    this.S.items.forEach(it => {
      if (!this.shown(it) || !this.placed(it) || !it.start) return;
      if (onDay(it, d)) (now[it.fp] ||= []).push(it);
      else if (s0(it) > d && (!next[it.fp] || s0(it) < s0(next[it.fp]))) next[it.fp] = it;
    });
    return { now, next };
  }
  /** other items in footprint f overlapping it's dates */
  takenBy(it: Item, fid: string, onlyShown = false) {
    if (!it.start) return [];
    return this.S.items.filter(o => o.id !== it.id && o.fp === fid && (!onlyShown || this.shown(o)) && o.start && s0(o) <= s1(it) && s0(it) <= s1(o));
  }
  freeFp(it: Item) {
    if (!it.area || !it.start) return null;
    return this.fpsIn(it.area).find(f => !this.takenBy(it, f.id).length) || null;
  }
  nextFpCode(a: { code?: string } | undefined) {
    const pre = (a?.code || 'FP') + '-'; let n = 1;
    const have = new Set(this.S.footprints.map(f => f.code));
    while (have.has(pre + String(n).padStart(2, '0'))) n++;
    return pre + String(n).padStart(2, '0');
  }
}
