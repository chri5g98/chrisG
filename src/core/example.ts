/* The example yard, a blank plan, and the "New vessel" builder. */
import type { Item, ItemType, PlanState, Project, StageType, Area, Footprint, Pt } from './types';
import { rectPts } from './geometry';
import { PAL } from './shapes';
import { dn, ds, monday, TODAY, uid } from './util';

export const DEF_W = 2400, DEF_H = 1500, DEF_MPU = 0.1; // blank site: 240 × 150 m

export const blankItem = (o: Partial<Item> = {}): Item => ({
  id: uid('i'), code: '', name: '', proj: '', type: '', shape: '', area: '', fp: '', ori: 0,
  l: null, w: null, wt: null, start: '', finish: '', pred: [], note: '', stages: [], parent: '', ...o
});

/** the type's standard stages, spread across the item's time in its area */
export function fillStages(it: Item, st: Pick<PlanState, 'types'>): boolean {
  const t = (st.types || []).find(x => x.id === it.type);
  if (!t || !t.std?.length || !it.start) { it.stages = it.stages || []; return false; }
  const s = dn(it.start)!, n = dn(it.finish)! - s + 1;
  const tot = t.std.reduce((a, x) => a + (+x.pct || 0), 0) || 1;
  let acc = 0, d0 = s;
  it.stages = [];
  t.std.forEach((x, i) => {
    acc += +x.pct || 0;
    const end = i === t.std.length - 1 ? s + n - 1 : Math.max(d0, s + Math.round((n * acc) / tot) - 1);
    it.stages.push({ id: uid('s'), st: x.st, start: ds(d0), finish: ds(end) });
    d0 = end + 1;
  });
  return true;
}

/** put items in footprints in date order; the overflow stays "not in a footprint" */
export function autoFill(st: PlanState) {
  const busy: Record<string, [number, number][]> = {};
  [...st.items].sort((a, b) => dn(a.start)! - dn(b.start)!).forEach(it => {
    if (it.fp || !it.area) return;
    const s = dn(it.start)!, f = dn(it.finish)!;
    const free = st.footprints.find(fp => fp.area === it.area && !(busy[fp.id] || []).some(([a, b]) => a <= f && s <= b));
    if (free) { it.fp = free.id; (busy[free.id] ||= []).push([s, f]); }
  });
}

export interface VesselOpts {
  proj: string; code: string; name?: string;
  units: number[]; start: number; gap: number; unitDays: number; blockDays: number; hullDays: number;
  wheelhouse?: boolean; keepCodes?: boolean;
  types: { hull: string; block: string; unit: string };
  areas: { hull: string; block: string; unit: string };
}
/** New vessel: hull made of blocks made of units. Units are staggered, each block starts the day after its last unit,
 *  the hull starts when its first block is ready and the other blocks join it as they finish. */
export function buildVessel(o: VesselOpts, st: Pick<PlanState, 'types'>): Item[] {
  const out: Item[] = [], P = o.proj;
  const mk = (x: Partial<Item>) => { const it = blankItem(x); out.push(it); return it; };
  const nb = o.units.length;
  const hull = mk({ code: `${o.code}-HULL`, name: o.name || `Hull ${o.code}`, proj: P, type: o.types.hull, shape: 'hull', area: o.areas.hull });
  let k = 0; const blocks: Item[] = [];
  o.units.forEach((nu, b) => {
    const bc = `${o.code}-B${b + 1}`;
    const blk = mk({ code: bc, name: `Block ${b + 1}`, proj: P, type: o.types.block, shape: b === 0 ? 'stern' : b === nb - 1 ? 'bow' : 'side', area: o.areas.block, parent: hull.id, _pc: hull.code });
    let last = -Infinity;
    for (let u = 0; u < nu; u++) {
      const s = o.start + k * o.gap; k++;
      mk({ code: `${bc}-U${u + 1}`, name: `Unit ${b + 1}.${u + 1}`, proj: P, type: o.types.unit, shape: u === 0 ? 'dbottom' : 'panel', area: o.areas.unit, parent: blk.id, _pc: bc, start: ds(s), finish: ds(s + o.unitDays - 1) });
      last = Math.max(last, s + o.unitDays - 1);
    }
    if (!isFinite(last)) last = o.start + b * o.gap - 1;
    blk.start = ds(last + 1); blk.finish = ds(last + o.blockDays); blocks.push(blk);
  });
  const fins = blocks.map(b => dn(b.finish)!);
  const hs = blocks.length ? Math.min(...fins) + 1 : o.start;
  const he = Math.max(hs + o.hullDays - 1, blocks.length ? Math.max(...fins) + 7 : hs);
  hull.start = ds(hs); hull.finish = ds(he);
  if (o.wheelhouse) {
    const wf = hs + Math.round((he - hs) * 0.5);
    mk({ code: `${o.code}-WH`, name: 'Wheelhouse', proj: P, type: o.types.block, shape: 'deckhouse', area: o.areas.block, parent: hull.id, _pc: hull.code, start: ds(wf - o.blockDays + 1), finish: ds(wf) });
  }
  out.forEach(it => fillStages(it, st));
  if (!o.keepCodes) out.forEach(it => delete it._pc);
  return out;
}

/* ---------- example yard drawing (a made-up site plan, drawn as SVG) ---------- */
export function exampleDrawing() {
  const W = DEF_W, H = DEF_H;
  const T = (x: number, y: number, t: string, s = 26, a = 'start', w = 600) => `<text x="${x}" y="${y}" font-size="${s}" font-weight="${w}" text-anchor="${a}" letter-spacing="2">${t}</text>`;
  const shed = (x: number, y: number, w: number, h: number, bay: number) => {
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f7f6f3" stroke="#222" stroke-width="5"/>`;
    for (let c = x + bay; c < x + w - 5; c += bay) s += `<rect x="${c - 4}" y="${y - 4}" width="8" height="8" fill="#222"/><rect x="${c - 4}" y="${y + h - 4}" width="8" height="8" fill="#222"/>`;
    s += `<line x1="${x}" y1="${y + 22}" x2="${x + w}" y2="${y + 22}" stroke="#999" stroke-width="2" stroke-dasharray="18 10"/><line x1="${x}" y1="${y + h - 22}" x2="${x + w}" y2="${y + h - 22}" stroke="#999" stroke-width="2" stroke-dasharray="18 10"/>`;
    return s;
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif" fill="#222">
  <defs><pattern id="w" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="24" height="24" fill="#e3edf5"/><path d="M0 12h24" stroke="#9fbcd4" stroke-width="2"/></pattern>
  <pattern id="g" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#eceae4"/><circle cx="4" cy="4" r="1.6" fill="#c9c5bb"/><circle cx="12" cy="12" r="1.6" fill="#c9c5bb"/></pattern></defs>
  <rect width="${W}" height="${H}" fill="#fbfaf7"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 300}" fill="none" stroke="#bbb" stroke-width="3" stroke-dasharray="30 12"/>
  <rect x="40" y="560" width="${W - 80}" height="60" fill="#e6e4de"/><rect x="1020" y="40" width="70" height="960" fill="#e6e4de"/><rect x="40" y="960" width="${W - 80}" height="70" fill="#e6e4de"/>
  <path d="M60 590h${W - 120}M1055 60v930M60 995h${W - 120}" stroke="#fff" stroke-width="3" stroke-dasharray="24 18"/>
  ${shed(100, 120, 900, 400, 100)}${shed(100, 640, 900, 180, 100)}${shed(1100, 120, 1000, 440, 125)}${shed(1100, 640, 400, 220, 100)}
  <path d="M1580 640H2300V940H1800L1580 820Z" fill="url(#g)" stroke="#555" stroke-width="4" stroke-dasharray="20 10"/>
  <rect x="2160" y="120" width="180" height="200" fill="#f7f6f3" stroke="#222" stroke-width="4"/>${T(2250, 230, 'STORES', 22, 'middle')}
  <rect x="250" y="1040" width="2000" height="260" fill="#efede8" stroke="#222" stroke-width="4"/>
  <path d="M250 1170H2250" stroke="#999" stroke-width="2" stroke-dasharray="40 12 6 12"/>
  <rect x="40" y="1300" width="${W - 80}" height="${H - 1340}" fill="url(#w)"/><path d="M40 1300H${W - 40}" stroke="#222" stroke-width="7"/>
  ${[300, 700, 1100, 1500, 1900].map(x => `<circle cx="${x}" cy="1312" r="7" fill="#222"/>`).join('')}
  ${T(1200, 1420, 'RIVER', 34, 'middle', 400)}${T(300, 905, 'PEDESTRIAN ROUTE', 16, 'start', 400)}
  ${T(1240, 590, 'YARD ROAD', 18, 'middle', 400)}
  <g transform="translate(2230 1130)"><circle r="46" fill="none" stroke="#222" stroke-width="3"/><path d="M0 -40 14 18 0 8 -14 18Z" fill="#222"/>${T(0, -54, 'N', 26, 'middle', 700)}</g>
  <g transform="translate(1820 1210)"><rect width="400" height="70" fill="#fff" stroke="#222" stroke-width="3"/>${T(16, 30, 'YARD LAYOUT – EXAMPLE', 20, 'start', 700)}${T(16, 56, 'Replace with your own drawing', 16, 'start', 400)}</g>
  <g transform="translate(100 1250)"><rect width="200" height="12" fill="#222"/><rect x="200" width="200" height="12" fill="#fff" stroke="#222" stroke-width="2"/>${T(0, -10, '0', 18)}${T(200, -10, '20', 18, 'middle')}${T(400, -10, '40 m', 18, 'middle')}</g>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

export function exampleStypes(): StageType[] {
  return [
    { id: 'sprep', name: 'Prep', color: '#8a8f98' }, { id: 'sfab', name: 'Fabricate sub-assemblies', color: '#1baf7a' }, { id: 'sdeck', name: 'Erect deck panels', color: '#2a78d6' },
    { id: 'sweld', name: 'Weld out', color: '#6250d6' }, { id: 'spipe', name: 'Install pipes / outfit', color: '#008300' }, { id: 'sjoin', name: 'Join blocks', color: '#eda100' }, { id: 'spaint', name: 'Blast & paint', color: '#eb6834' }
  ];
}
export function exampleTypes(): ItemType[] {
  const T: { id: string; name: string; color: string; shape: string; std: [string, number][] }[] = [
    { id: 'tblk', name: 'Block', color: '#5a6170', shape: 'dbottom', std: [['sprep', 10], ['sfab', 35], ['sdeck', 30], ['spipe', 25]] },
    { id: 'tgb', name: 'Grand block', color: '#3d4452', shape: 'side', std: [['sjoin', 30], ['sweld', 20], ['spipe', 35], ['spaint', 15]] },
    { id: 'tpan', name: 'Panel / sub-assembly', color: '#2a7f86', shape: 'panel', std: [['sprep', 30], ['sfab', 70]] },
    { id: 'tout', name: 'Outfit unit / module', color: '#2b6846', shape: 'unit', std: [['sprep', 20], ['spipe', 80]] },
    { id: 'tlay', name: 'Laydown / storage', color: '#b05a2b', shape: 'laydown', std: [] },
    { id: 'thull', name: 'Hull on berth', color: '#0f2f4c', shape: 'hull', std: [['sjoin', 40], ['spipe', 60]] },
    { id: 'tunit', name: 'Unit', color: '#2a7f86', shape: 'dbottom', std: [['sprep', 15], ['sfab', 60], ['spipe', 25]] }
  ];
  return T.map(t => ({ ...t, std: t.std.map(([st, pct]) => ({ st, pct })) }));
}

export function exampleState(): PlanState {
  const t0 = monday(TODAY) - 70;
  const P: Project[] = [{ id: 'p802', code: '802', name: 'Hull 802', color: '#2a78d6' }, { id: 'p803', code: '803', name: 'Hull 803', color: '#eb6834' }, { id: 'pref', code: 'R01', name: 'Refit R01', color: '#6250d6' }];
  const ST = exampleStypes(), T = exampleTypes();
  const A: Area[] = ([
    { id: 'afab', code: 'FAB', name: 'Fab shed', kind: 'Shed', color: '#2a78d6', crane: 40, pts: rectPts(100, 120, 900, 400) },
    { id: 'apan', code: 'PNL', name: 'Panel line', kind: 'Shed', color: '#1baf7a', crane: 20, pts: rectPts(100, 640, 900, 180) },
    { id: 'ablk', code: 'BLK', name: 'Block hall', kind: 'Hall', color: '#6250d6', crane: 120, pts: rectPts(1100, 120, 1000, 440) },
    { id: 'aout', code: 'OUT', name: 'Outfit shop', kind: 'Shed', color: '#008300', crane: 10, pts: rectPts(1100, 640, 400, 220) },
    { id: 'alay', code: 'LAY', name: 'Laydown A', kind: 'Outdoor', color: '#eb6834', crane: 0, pts: [[1580, 640], [2300, 640], [2300, 940], [1800, 940], [1580, 820]] as Pt[] },
    { id: 'aber', code: 'BER', name: 'Building berth', kind: 'Quay', color: '#e87ba4', crane: 0, pts: rectPts(250, 1040, 2000, 260) }
  ] as Omit<Area, 'ord'>[]).map((a, i) => ({ ...a, ord: i }));
  const F: Footprint[] = [];
  const fp = (area: string, code: string, pts: Pt[], kind = 'Build') => { const f = { id: 'f' + code.replace(/\W/g, ''), code, area, kind, note: '', pts }; F.push(f); return f; };
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) fp('afab', `FAB-${String(r * 4 + c + 1).padStart(2, '0')}`, rectPts(130 + c * 215, r ? 360 : 150, 190, 130));
  for (let c = 0; c < 4; c++) fp('apan', `PNL-${String(c + 1).padStart(2, '0')}`, rectPts(125 + c * 220, 660, 200, 140));
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) fp('ablk', `BLK-${String(r * 3 + c + 1).padStart(2, '0')}`, rectPts(1135 + c * 320, r ? 375 : 150, 300, 165));
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) fp('aout', `OUT-${String(r * 3 + c + 1).padStart(2, '0')}`, rectPts(1125 + c * 125, r ? 765 : 665, 105, 82));
  fp('alay', 'LAY-01', rectPts(1610, 665, 240, 120), 'Laydown'); fp('alay', 'LAY-02', rectPts(1880, 665, 250, 120), 'Laydown');
  fp('alay', 'LAY-03', [[2160, 665], [2280, 665], [2280, 920], [1830, 920], [1830, 810], [2160, 810]], 'Laydown');
  fp('aber', 'BERTH-1', [[380, 1092], [1330, 1086], [1450, 1110], [1530, 1170], [1450, 1230], [1330, 1254], [380, 1248]]);
  const I: Item[] = []; let k = 0;
  const add = (o: Partial<Item>) => { const it = blankItem({ ...o, id: 'i' + ++k }); I.push(it); return it; };
  const blkShape = (b: number) => (b === 0 ? 'stern' : b === 11 ? 'bow' : b < 5 ? 'dbottom' : b < 9 ? 'side' : 'panel');
  ['p802', 'p803'].forEach((pid, h) => {
    const hull = h ? '803' : '802', base = t0 + h * 50; const blocks: Item[] = [];
    for (let b = 0; b < 12; b++) {
      const s = base + b * 6, n = 101 + b;
      const pn = add({ code: `${hull}-P${n}`, name: `Panels for block ${n}`, proj: pid, type: 'tpan', area: 'apan', start: ds(s), finish: ds(s + 11), wt: 10 });
      blocks.push(add({ code: `${hull}-B${n}`, name: `Block ${n}`, proj: pid, type: 'tblk', shape: blkShape(b), area: 'afab', start: ds(s + 12), finish: ds(s + 47), wt: h && b === 11 ? 44 : 20 + (b % 6) * 3, l: 15, w: 12.5 }));
      pn.parent = blocks[blocks.length - 1].id; // the panels are joined into their block
    }
    for (let g = 0; g < 6; g++) {
      const p1 = blocks[g * 2], p2 = blocks[g * 2 + 1], s = dn(p2.finish)! + 1;
      const gb = add({ code: `${hull}-GB${g + 1}`, name: `Grand block ${g + 1}`, proj: pid, type: 'tgb', shape: g === 0 ? 'stern' : g === 5 ? 'bow' : 'side', area: 'ablk', start: ds(s), finish: ds(s + 34), wt: 60 + g * 6, l: 30, w: 15 });
      p1.parent = gb.id; p2.parent = gb.id;
    }
  });
  ['Pump room unit', 'Steering gear unit', 'Fire main skid', 'HVAC unit', 'Fuel module', 'Bow thruster unit', 'Separator module', 'Sewage unit'].forEach((nm, u) => {
    const s = t0 + 40 + u * 9;
    add({ code: `802-U${u + 1}`, name: nm, proj: 'p802', type: 'tout', area: 'aout', start: ds(s), finish: ds(s + 32), wt: 3 + u });
  });
  add({ code: '802-LD1', name: 'Steel stock – 802', proj: 'p802', type: 'tlay', area: 'alay', start: ds(t0 - 30), finish: ds(t0 + 110) });
  add({ code: '803-LD1', name: 'Steel stock – 803', proj: 'p803', type: 'tlay', area: 'alay', start: ds(t0 + 40), finish: ds(t0 + 180) });
  add({ code: 'R01-LD1', name: 'Refit equipment staging', proj: 'pref', type: 'tlay', area: 'alay', start: ds(t0 + 60), finish: ds(t0 + 130) });
  add({ code: 'R01-U1', name: 'Replacement deckhouse', proj: 'pref', type: 'tout', shape: 'deckhouse', area: 'ablk', start: ds(t0 + 75), finish: ds(t0 + 120), wt: 60, l: 18, w: 12 });
  const gb1 = I.find(i => i.code === '802-GB1')!;
  const h802 = add({ code: '802-HULL', name: 'Hull 802 on the berth', proj: 'p802', type: 'thull', area: 'aber', start: ds(dn(gb1.finish)! + 1), finish: ds(dn(gb1.finish)! + 150) });
  I.filter(i => i.proj === 'p802' && i.type === 'tgb').forEach(g => (g.parent = h802.id));
  // Hull 804: a small vessel made with the same tool as "New vessel": 1 hull, 4 blocks, 9 units
  P.push({ id: 'p804', code: '804', name: 'Hull 804', color: '#1baf7a' });
  buildVessel({ proj: 'p804', code: '804', name: 'Hull 804 on the berth', units: [2, 2, 3, 2], start: dn(h802.finish)! - 48, gap: 6, unitDays: 21, blockDays: 28, hullDays: 90, wheelhouse: true, keepCodes: true, types: { hull: 'thull', block: 'tblk', unit: 'tunit' }, areas: { hull: 'aber', block: 'ablk', unit: 'afab' } }, { types: T })
    .forEach(it => { it.id = 'i' + ++k; I.push(it); });
  {
    const map: Record<string, string> = {};
    I.filter(i => i.proj === 'p804').forEach(i => (map[i.code] = i.id));
    I.filter(i => i.proj === 'p804').forEach(i => { if (i._pc) { i.parent = map[i._pc]; delete i._pc; } });
  }
  const st: PlanState = { v: 2, _meta: { rev: 0, by: '', at: '' }, drawing: { id: 'dex', src: exampleDrawing(), w: DEF_W, h: DEF_H, mpu: DEF_MPU, name: 'Example yard', op: 0.9 }, projects: P, types: T, stypes: ST, areas: A, footprints: F, items: I, profiles: [], set: { look: 14 } };
  I.forEach(it => fillStages(it, st)); // standard stages for every item
  autoFill(st);
  const ru = I.find(i => i.code === 'R01-U1')!;
  const mate = I.find(i => i.area === 'ablk' && i.fp && i !== ru && dn(i.start)! <= dn(ru.finish)! && dn(ru.start)! <= dn(i.finish)!);
  if (mate) ru.fp = mate.fp; // one double-booking to show the warning
  return st;
}

export function blankState(): PlanState {
  return { v: 2, _meta: { rev: 0, by: '', at: '' }, drawing: { id: 'd0', src: null, w: DEF_W, h: DEF_H, mpu: DEF_MPU, name: '', op: 0.9 }, projects: [{ id: 'p1', code: '001', name: 'Project 1', color: PAL[0] }], types: exampleTypes(), stypes: exampleStypes(), areas: [], footprints: [], items: [], profiles: [], set: { look: 14 } };
}
