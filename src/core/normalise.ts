/* Bring any FMAREA file (v1 or v2, old or hand-edited) into a consistent v2 shape. */
import type { PlanState, Footprint } from './types';
import { bbox, rectPts } from './geometry';
import { DEF_H, DEF_MPU, DEF_W, exampleStypes, exampleTypes } from './example';
import { PAL } from './shapes';
import { uid } from './util';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

export function normalise(input: Loose): PlanState {
  let s: Loose = input || {};
  if (!s.v || s.v < 2) s = migrateV1(s);
  ['projects', 'types', 'stypes', 'areas', 'footprints', 'items', 'profiles'].forEach(k => (s[k] ||= []));
  s.set = Object.assign({ look: 14 }, s.set || {});
  s._meta ||= { rev: 0 };
  s.drawing = Object.assign({ id: 'd0', src: null, w: DEF_W, h: DEF_H, mpu: DEF_MPU, name: '', op: 0.9 }, s.drawing || {});
  s.areas.forEach((a: Loose, i: number) => { a.pts ||= []; if (a.ord == null) a.ord = i; a.color ||= PAL[i % PAL.length]; a.crane = +a.crane || 0; a.kind ||= 'Shed'; a.code ??= ''; });
  s.footprints.forEach((f: Loose) => { f.pts ||= []; f.kind ||= 'Build'; f.note ||= ''; f.code ??= ''; });
  s.profiles.forEach((p: Loose) => { p.op ??= 1; });
  s.types.forEach((t: Loose) => { t.std ||= []; t.shape ||= 'box'; });
  const ids = new Set(s.items.map((i: Loose) => i.id));
  s.items.forEach((i: Loose) => { i.parent = i.parent && ids.has(i.parent) && i.parent !== i.id ? i.parent : ''; });
  const pm = new Map(s.items.map((i: Loose) => [i.id, i]));
  s.items.forEach((i: Loose) => {
    let p = i.parent, n = 0;
    while (p && n++ < 60) { if (p === i.id) { i.parent = ''; break; } p = (pm.get(p) as Loose)?.parent; }
  });
  s.items.forEach((i: Loose) => { if (!Array.isArray(i.zone) || i.zone.length < 3) delete i.zone; });
  const fpById = new Map(s.footprints.map((f: Loose) => [f.id, f]));
  s.items.forEach((i: Loose) => {
    i.pred ||= []; i.stages ||= []; i.ori = +i.ori || 0; i.fp ||= ''; i.area ||= ''; i.shape ||= '';
    i.code ??= ''; i.name ??= ''; i.note ??= ''; i.start ||= ''; i.finish ||= '';
    i.l ??= null; i.w ??= null; i.wt ??= null;
    if (!i.finish && i.start) i.finish = i.start;
    if (i.fp && !fpById.has(i.fp)) i.fp = '';
    if (i.fp) i.area = (fpById.get(i.fp) as Loose).area;
  });
  return s as PlanState;
}

/** v1 had rectangular areas in metres and items placed by x/y inside them */
export function migrateV1(s: Loose): Loose {
  const k = 1 / DEF_MPU; const F: (Footprint & { _r?: number[] })[] = [];
  (s.areas || []).forEach((a: Loose) => {
    const ax = (+a.x || 0) * k + 100, ay = (+a.y || 0) * k + 100;
    a.pts = rectPts(ax, ay, (+a.w || 20) * k, (+a.h || 20) * k); a._o = [ax, ay];
    delete a.excl; delete a.stands; delete a.maxPct;
  });
  (s.items || []).forEach((it: Loose) => {
    const a = (s.areas || []).find((x: Loose) => x.id === it.area);
    it.stages = []; it.shape = ''; it.ori = it.rot ? 1 : 0;
    if (a && it.x != null && it.y != null) {
      const w = (it.rot ? it.w : it.l) * k, h = (it.rot ? it.l : it.w) * k, x = a._o[0] + it.x * k, y = a._o[1] + it.y * k;
      let f = F.find(f => f.area === a.id && Math.abs(f._r![0] - x) < 1 && Math.abs(f._r![1] - y) < 1 && Math.abs(f._r![2] - w) < 1 && Math.abs(f._r![3] - h) < 1);
      if (!f) {
        f = { id: uid('f'), code: `${a.code || 'FP'}-${String(F.filter(q => q.area === a.id).length + 1).padStart(2, '0')}`, area: a.id, kind: it.type === 'tlay' ? 'Laydown' : 'Build', note: '', pts: rectPts(x, y, w, h), _r: [x, y, w, h] };
        F.push(f);
      }
      it.fp = f.id;
    }
    delete it.x; delete it.y; delete it.rot;
  });
  (s.areas || []).forEach((a: Loose) => delete a._o);
  F.forEach(f => delete f._r);
  const types = exampleTypes();
  (s.types || []).forEach((t: Loose) => { const m = types.find(x => x.id === t.id); t.shape = m ? m.shape : 'box'; t.std = m ? m.std : []; });
  const ext = (fn: (b: { x: number; y: number; w: number; h: number }) => number) => (s.areas || []).map((a: Loose) => fn(bbox(a.pts)!));
  return Object.assign(s, {
    v: 2, footprints: F, stypes: exampleStypes(),
    drawing: { id: 'd0', src: null, w: Math.max(DEF_W, ...ext(b => b.x + b.w + 100)), h: Math.max(DEF_H, ...ext(b => b.y + b.h + 100)), mpu: DEF_MPU, name: '', op: 0.9 }
  });
}
