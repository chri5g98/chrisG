import { describe, expect, it } from 'vitest';
import { exampleState, buildVessel, blankState } from './example';
import { normalise, migrateV1 } from './normalise';
import { Plan, s0, s1 } from './plan';
import { frameOf, inPoly, isRect, labelPt, polyArea, rectPts, rotRect } from './geometry';
import { mergeStates } from './merge';
import { buildXlsx, readXlsx, parseCsv } from './xlsx';
import { exportSheets, importBook } from './excel';
import { buildRows } from './rows';
import { capWeeks, weekStack } from './capacity';
import { buildPrint, type PrintOpts } from './print';
import { vesselProfile, vesselTreeSVG } from './vesselSvg';
import { floorBody } from './floorSvg';
import { clone, dn, ds, monday, weekNo, TODAY } from './util';
import type { ViewState } from './types';

const view = (o: Partial<ViewState> = {}): ViewState => ({
  page: 'floor', date: TODAY, hide: [], focus: 'all', colour: 'proj', ghost: true, label: 'code', gz: 'weeks', gGroup: 'area', gw: 320,
  collapsed: [], shut: [], stages: true, f: {}, tblSort: 'start', tblDir: 1, itemsView: 'list', ishut: [], name: 'Tester', capWeeks: 26, capBy: 'proj',
  tool: 'select', toolShape: 'rect', drawArea: '', fpArea: '', vroot: '', sel: null, ...o
});

describe('dates', () => {
  it('round-trips ISO and UK dates', () => {
    expect(ds(dn('2027-02-01'))).toBe('2027-02-01');
    expect(ds(dn('1/2/2027'))).toBe('2027-02-01');
    expect(dn('')).toBeNull();
  });
  it('finds Mondays and ISO week numbers', () => {
    const d = dn('2026-11-06')!; // a Friday
    expect(ds(monday(d))).toBe('2026-11-02');
    expect(weekNo(d)).toBe(45);
  });
});

describe('geometry', () => {
  it('measures a turned rectangle in its own frame', () => {
    const pts = rotRect(100, 100, 40, 10, Math.PI / 6);
    const F = frameOf(pts)!;
    expect(F.L).toBeCloseTo(40, 0);
    expect(F.W).toBeCloseTo(10, 0);
    expect((F.a * 180) / Math.PI).toBeCloseTo(30, 0);
    expect(isRect(pts)).toBe(true);
  });
  it('knows inside from outside and labels L shapes inside', () => {
    const L: [number, number][] = [[0, 0], [100, 0], [100, 20], [20, 20], [20, 100], [0, 100]];
    expect(inPoly([10, 10], L)).toBe(true);
    expect(inPoly([60, 60], L)).toBe(false);
    expect(inPoly(labelPt(L), L)).toBe(true);
    expect(polyArea(rectPts(0, 0, 10, 5))).toBe(50);
  });
});

describe('example yard', () => {
  const S = normalise(exampleState());
  const P = new Plan(S);
  it('has the expected areas, footprints and vessels', () => {
    expect(S.areas).toHaveLength(6);
    expect(S.footprints.length).toBeGreaterThan(20);
    expect(P.treeRoots().map(r => r.code)).toEqual(expect.arrayContaining(['802-HULL', '804-HULL']));
  });
  it('shows the deliberate double-booking', () => {
    expect(P.pairs.length).toBeGreaterThan(0);
    const ru = S.items.find(i => i.code === 'R01-U1')!;
    expect(P.hasK(ru.id, 'clash')).toBe(true);
  });
  it('counts footprints needed per area against capacity', () => {
    const it = S.items.find(i => i.fp && i.start)!;
    const o = P.occAt(it.area, s0(it));
    expect(o.n).toBeGreaterThanOrEqual(1);
    expect(o.cap).toBe(P.capOf(it.area));
    const wk = weekStack(P, [it.area], monday(s0(it)), 'proj');
    expect(wk.n).toBeGreaterThanOrEqual(1);
    expect(wk.segs.reduce((s, g) => s + g.n, 0)).toBe(wk.n);
  });
  it('hiding a project removes it from checks and capacity', () => {
    const P2 = new Plan(S, ['pref']);
    expect(P2.pairs.some(p => S.items.find(i => i.id === p.a)!.proj === 'pref' || S.items.find(i => i.id === p.b)!.proj === 'pref')).toBe(false);
  });
  it('builds plan rows for every grouping', () => {
    for (const g of ['area', 'fp', 'tree', 'proj', 'type', 'none'] as const) {
      const { rows, H } = buildRows(P, view({ gGroup: g }));
      expect(rows.length).toBeGreaterThan(0);
      expect(H).toBe(rows.reduce((s, r) => s + r.h, 0));
    }
  });
  it('draws the floor plan, vessel and capacity without errors', () => {
    expect(floorBody(P, TODAY, { k: 1, colour: 'proj', ghost: true, label: 'stage' })).toContain('fl-fp');
    const root = P.treeRoots().find(r => r.code === '804-HULL')!;
    expect(vesselProfile(P, root, TODAY).svg).toContain('data-vi');
    expect(vesselTreeSVG(P, root, TODAY).svg).toContain('data-vn');
    expect(capWeeks(P, 13)).toHaveLength(13);
  });
  it('prints every kind of page', () => {
    const base: PrintOpts = { what: 'floor', paper: 'A3', orient: 'L', text: 1, dates: 'one', from: ds(TODAY), to: ds(TODAY + 28), scope: 'each', gFrom: ds(P.R.d0), gTo: ds(P.R.d1), stages: true };
    const root = P.treeRoots()[0];
    for (const what of ['floor', 'plan', 'cap', 'vessel'] as const) {
      const pages = buildPrint(P, view(), { ...base, what }, { logo: '', vroot: root });
      expect(pages.length).toBeGreaterThan(0);
      expect(pages[0]).toContain('page 1 of');
    }
  });
});

describe('new vessel', () => {
  it('builds a hull from blocks from units, scheduled in order', () => {
    const S = blankState();
    const L = buildVessel({ proj: 'p1', code: '900', units: [2, 3], start: TODAY, gap: 7, unitDays: 21, blockDays: 28, hullDays: 90, wheelhouse: true, types: { hull: 'thull', block: 'tblk', unit: 'tunit' }, areas: { hull: '', block: '', unit: '' } }, S);
    expect(L).toHaveLength(1 + 2 + 5 + 1);
    const hull = L[0], blocks = L.filter(i => i.parent === hull.id && i.shape !== 'deckhouse');
    blocks.forEach(b => {
      const units = L.filter(u => u.parent === b.id);
      expect(s0(b)).toBe(Math.max(...units.map(s1)) + 1);
    });
    expect(s0(hull)).toBe(Math.min(...blocks.map(s1)) + 1);
    expect(L.every(i => !i._pc)).toBe(true);
  });
});

describe('normalise', () => {
  it('migrates a v1 file to footprints', () => {
    const v1 = { areas: [{ id: 'a1', code: 'FAB', name: 'Fab', x: 0, y: 0, w: 50, h: 30 }], items: [{ id: 'i1', code: 'B1', area: 'a1', x: 5, y: 5, l: 15, w: 10, start: '2027-01-01', finish: '2027-02-01' }], types: [], projects: [] };
    const s = normalise(migrateV1(clone(v1)));
    expect(s.v).toBe(2);
    expect(s.footprints).toHaveLength(1);
    expect(s.items[0].fp).toBe(s.footprints[0].id);
  });
  it('breaks loops in the build tree', () => {
    const s = normalise({ v: 2, items: [{ id: 'a', parent: 'b' }, { id: 'b', parent: 'a' }] });
    expect(s.items.some(i => i.parent === '')).toBe(true);
  });
});

describe('shared file merge', () => {
  it('keeps both sides when different records change', () => {
    const base = normalise(exampleState());
    const mine = clone(base), theirs = clone(base);
    mine.items[0].name = 'Mine';
    theirs.items[1].name = 'Theirs';
    const { state, conflicts } = mergeStates(base, mine, theirs);
    expect(state.items[0].name).toBe('Mine');
    expect(state.items[1].name).toBe('Theirs');
    expect(conflicts).toBe(0);
  });
  it('counts a conflict and keeps mine', () => {
    const base = normalise(exampleState());
    const mine = clone(base), theirs = clone(base);
    mine.items[0].name = 'Mine'; theirs.items[0].name = 'Theirs';
    const { state, conflicts } = mergeStates(base, mine, theirs);
    expect(state.items[0].name).toBe('Mine');
    expect(conflicts).toBe(1);
  });
  it('drops a record the other side deleted', () => {
    const base = normalise(exampleState());
    const mine = clone(base), theirs = clone(base);
    theirs.items = theirs.items.slice(1);
    expect(mergeStates(base, mine, theirs).state.items).toHaveLength(base.items.length - 1);
  });
});

describe('Excel', () => {
  it('exports and imports back with no changes', async () => {
    const S = normalise(exampleState());
    const P = new Plan(S);
    const blob = buildXlsx(exportSheets(P));
    const book = await readXlsx(await blob.arrayBuffer());
    expect(Object.keys(book)).toContain('Items');
    const r = importBook(book, S);
    expect(r.total).toBe(0);
    expect(r.warn).toEqual([]);
  });
  it('reports a changed and a new item', async () => {
    const S = normalise(exampleState());
    const book = await readXlsx(await buildXlsx(exportSheets(new Plan(S))).arrayBuffer());
    book.Items[1][2] = 'Renamed';
    book.Items.push(['', 'NEW-1', 'Brand new', '802', 'Block', '', '', 'FAB', '', '2027-01-04', '2027-01-20']);
    const r = importBook(book, S);
    const items = r.report.find(x => x.name === 'Items')!;
    expect(items.ch).toBe(1);
    expect(items.nw).toBe(1);
    expect(r.next.items.find(i => i.code === 'NEW-1')!.area).toBe('afab');
  });
  it('reads CSV', () => {
    expect(parseCsv('Code,Name\n"A,1",B\n')).toEqual([['Code', 'Name'], ['A,1', 'B']]);
  });
});
