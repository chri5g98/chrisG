/* Excel export and import: every sheet, matched on ID then Code, with a report of what would change. */
import type { Area, Footprint, Item, PlanState, StageType } from './types';
import type { Book, Sheet } from './xlsx';
import { Plan, s0, s1 } from './plan';
import { fillStages, blankItem } from './example';
import { frameOf, labelPt, ptsDeg, rotRect } from './geometry';
import { PAL, SHAPES, shapeLabel } from './shapes';
import { clamp, clone, dn, ds, fdl, monday, n0, nN, r1, TODAY, uid } from './util';
import type { Pt } from './types';

const ptsTxt = (pts: Pt[]) => (pts || []).map(p => `${r1(p[0])},${r1(p[1])}`).join('; ');
const txtPts = (t: unknown): Pt[] => String(t || '').split(';').map(x => x.split(',').map(Number)).filter(p => p.length === 2 && p.every(isFinite)) as Pt[];

export function exportSheets(P: Plan, template = false): Sheet[] {
  const S = P.S, items = template ? [] : S.items, m = P.mpu();
  const fpc = (id: string) => P.fpOf(id)?.code || '';
  const sheets: Sheet[] = [
    { name: 'Read me', widths: [110], rows: [[`FMAREA – footprint planner. Exported ${fdl(TODAY)}.`], ['Change the Items, Stages, Areas, Footprints, Projects, Types and Stage types sheets, then use Data → Import from Excel. You see every change before it is saved.'], ['Rows match on ID, then Code (Name for types and stage types). Leave ID blank for new rows. Blank cells leave values unchanged.'], ['Project, Type, Area and Footprint can be the code or the name. Joins into = the code of the item it becomes part of (unit → block → hull). Comes after = item codes separated by ;'], ['Stages: one row per stage, matched to its item by Item code. Items listed on the Stages sheet get exactly the stages listed.'], ['Footprints: change Length m, Width m or Angle to resize or turn one round its centre (it becomes a rectangle). A new footprint with a length and width but no outline is put in the middle of its area. Outlines are corner points in drawing units, "x,y; x,y; …".'], ['The yard drawing itself is not in Excel – it stays in the data file and backups.'], ['Weekly capacity is for information only and is not imported.']] },
    { name: 'Items', widths: [10, 14, 30, 10, 18, 14, 18, 14, 12, 12, 12, 9, 9, 9, 8, 20, 30], rows: [['ID', 'Code', 'Name', 'Project', 'Type', 'Joins into', 'Looks like', 'Area', 'Footprint', 'Start', 'Finish', 'Length m', 'Width m', 'Weight t', 'Turned', 'Comes after', 'Note'], ...items.map(it => [it.id, it.code, it.name, P.proj(it.proj).code, P.typ(it.type).name, P.parentOf(it)?.code || '', it.shape ? shapeLabel(it.shape) : '', P.area(it.area)?.code || P.area(it.area)?.name || '', fpc(it.fp), it.start ? { d: s0(it) } : '', it.finish ? { d: s1(it) } : '', it.l ?? '', it.w ?? '', it.wt ?? '', it.ori || '', (it.pred || []).map(id => P.item(id)?.code).filter(Boolean).join('; '), it.note || ''])] },
    { name: 'Stages', widths: [14, 28, 12, 12], rows: [['Item code', 'Stage', 'Start', 'Finish'], ...items.flatMap(it => (it.stages || []).map(sg => [it.code, P.stype(sg.st).name, sg.start ? { d: dn(sg.start)! } : '', sg.finish ? { d: dn(sg.finish)! } : '']))] },
    { name: 'Areas', widths: [10, 8, 20, 10, 8, 10, 60], rows: [['ID', 'Code', 'Name', 'Kind', 'Crane t', 'Colour', 'Outline'], ...P.areasSorted().map(a => [a.id, a.code, a.name, a.kind, a.crane, a.color, ptsTxt(a.pts)])] },
    { name: 'Footprints', widths: [10, 12, 12, 10, 10, 10, 9, 24, 60], rows: [['ID', 'Code', 'Area', 'Kind', 'Length m', 'Width m', 'Angle', 'Note', 'Outline'], ...S.footprints.map(f => { const F = frameOf(f.pts); return [f.id, f.code, P.area(f.area)?.code || P.area(f.area)?.name || '', f.kind, m && F ? r1(F.L * m) : '', m && F ? r1(F.W * m) : '', F ? ptsDeg(f.pts) : '', f.note || '', ptsTxt(f.pts)]; })] },
    { name: 'Projects', widths: [10, 10, 24, 10], rows: [['ID', 'Code', 'Name', 'Colour'], ...S.projects.map(p => [p.id, p.code, p.name, p.color])] },
    { name: 'Types', widths: [10, 24, 10, 22, 60], rows: [['ID', 'Name', 'Colour', 'Looks like', 'Standard stages'], ...S.types.map(t => [t.id, t.name, t.color, shapeLabel(t.shape), t.std.map(x => `${P.stype(x.st).name} ${x.pct}%`).join('; ')])] },
    { name: 'Stage types', widths: [10, 28, 10], rows: [['ID', 'Name', 'Colour'], ...S.stypes.map(x => [x.id, x.name, x.color])] }
  ];
  if (!template) {
    const R = P.R, AS = P.areasSorted();
    const rows: Sheet['rows'] = [['Week of', ...AS.map(a => `${a.name} (${P.capOf(a.id)})`), `All areas (${S.footprints.length})`]];
    for (let w = monday(R.d0); w <= R.d1; w += 7) {
      const cells = AS.map(a => P.occWeek(a.id, w).n);
      let best = 0;
      for (let d = w; d < w + 7; d++) { let t = 0; AS.forEach(a => (t += P.occAt(a.id, d).n)); best = Math.max(best, t); }
      rows.push([{ d: w }, ...cells, best]);
    }
    sheets.push({ name: 'Weekly footprints needed', widths: [12, ...AS.map(() => 16), 14], rows });
  }
  return sheets;
}

export interface SheetReport { name: string; nw: number; ch: number; same: number; lines: string[]; missing?: string[] }
export interface ImportResult { next: PlanState; report: SheetReport[]; warn: string[]; missing: string[]; total: number }

const cellDay = (v: unknown) => { if (v === '' || v == null) return null; if (typeof v === 'number') return Math.round(v) - 25569; return dn(String(v).trim()); };
type Row = Record<string, unknown>;

/** Work out what an Excel or CSV file would change. Nothing is saved: the caller decides. */
export function importBook(book: Book, S: PlanState): ImportResult {
  const names = Object.keys(book);
  if (names.length === 1 && !book.Items) book.Items = book[names[0]];
  const drawing = S.drawing;
  const N: PlanState = clone({ ...S, drawing: null as unknown as PlanState['drawing'] });
  N.drawing = drawing;
  const report: SheetReport[] = [], warn: string[] = [];
  const tbl = (rows?: unknown[][]): Row[] => {
    if (!rows || !rows.length) return [];
    const h = rows[0].map(x => String(x).trim().toLowerCase());
    return rows.slice(1).filter(r => r.some(v => v !== '' && v != null)).map(r => { const o: Row = {}; h.forEach((k, i) => (o[k] = r[i] ?? '')); return o; });
  };
  const str = (v: unknown) => String(v ?? '').trim();
  const has = (o: Row, k: string) => k in o && str(o[k]) !== '';
  const diffs = <T extends object>(a: T, b: T, keys: string[]) => keys.filter(k => JSON.stringify((a as Row)[k] ?? null) !== JSON.stringify((b as Row)[k] ?? null));
  const sheetRep = (name: string) => { const r: SheetReport = { name, nw: 0, ch: 0, same: 0, lines: [] }; report.push(r); return r; };
  const simple = <T extends { id: string; name: string; code?: string }>(sheet: string, arr: T[], mk: (o: Row) => T | false, keys: [string, keyof T, ((v: unknown) => unknown)?][], matchName = false) => {
    if (!book[sheet]) return;
    const r = sheetRep(sheet);
    tbl(book[sheet]).forEach(o => {
      let x = arr.find(y => has(o, 'id') && y.id === str(o.id)) || (matchName ? arr.find(y => y.name.toLowerCase() === str(o.name).toLowerCase()) : arr.find(y => has(o, 'code') && y.code === str(o.code)));
      if (!x) { const n = mk(o); if (!n) return; arr.push(n); r.nw++; r.lines.push('New ' + (n.name || n.code)); return; }
      const old = clone(x);
      keys.forEach(([col, k, f]) => { if (has(o, col)) (x as Row)[k as string] = f ? f(o[col]) : str(o[col]); });
      const d = diffs(old, x, keys.map(z => z[1] as string));
      if (d.length) { r.ch++; r.lines.push(`${x.name || x.code}: ${d.join(', ')}`); } else r.same++;
    });
  };
  simple('Projects', N.projects, o => (has(o, 'code') || has(o, 'name')) && { id: str(o.id) || uid('p'), code: str(o.code), name: str(o.name) || str(o.code), color: str(o.colour) || PAL[N.projects.length % PAL.length] }, [['code', 'code'], ['name', 'name'], ['colour', 'color']]);
  simple('Stage types', N.stypes, o => has(o, 'name') && { id: str(o.id) || uid('s'), name: str(o.name), color: str(o.colour) || PAL[N.stypes.length % PAL.length] }, [['name', 'name'], ['colour', 'color']], true);
  const findSt = (v: unknown): StageType | undefined => { const s = str(v).toLowerCase(); return N.stypes.find(x => x.name.toLowerCase() === s || x.id === str(v)); };
  const shapeKey = (v: unknown) => { const s = str(v).toLowerCase(); const m = SHAPES.find(([k, l]) => l.toLowerCase() === s || k === s); return m ? m[0] : null; };
  const stdParse = (v: unknown) => str(v).split(';').map(x => x.trim()).filter(Boolean).map(x => {
    const m = /^(.*?)\s*(\d+(?:\.\d+)?)\s*%?$/.exec(x); const st = findSt(m ? m[1] : x);
    if (!st) warn.push(`Standard stage "${x}" not found`);
    return st ? { st: st.id, pct: m ? +m[2] : 25 } : null;
  }).filter(Boolean) as { st: string; pct: number }[];
  simple('Types', N.types, o => has(o, 'name') && { id: str(o.id) || uid('t'), name: str(o.name), color: str(o.colour) || PAL[(N.types.length + 3) % PAL.length], shape: shapeKey(o['looks like']) || 'box', std: stdParse(o['standard stages']) }, [['name', 'name'], ['colour', 'color'], ['looks like', 'shape', v => shapeKey(v) || 'box'], ['standard stages', 'std', stdParse]], true);

  if (book.Areas) {
    const r = sheetRep('Areas');
    tbl(book.Areas).forEach((o, i) => {
      let a = N.areas.find(x => has(o, 'id') && x.id === str(o.id)) || N.areas.find(x => has(o, 'code') && x.code === str(o.code)) || N.areas.find(x => x.name.toLowerCase() === str(o.name).toLowerCase());
      if (!a) {
        if (!has(o, 'name') && !has(o, 'code')) return;
        const na: Area = { id: str(o.id) || uid('a'), code: str(o.code), name: str(o.name) || str(o.code), kind: str(o.kind) || 'Shed', crane: n0(o['crane t']), color: str(o.colour) || PAL[N.areas.length % PAL.length], ord: i, pts: txtPts(o.outline) };
        N.areas.push(na); r.nw++; r.lines.push('New area ' + na.name); return;
      }
      const old = clone(a);
      (['code', 'name', 'kind'] as const).forEach(k => { if (has(o, k)) a![k] = str(o[k]); });
      if (has(o, 'colour')) a.color = str(o.colour);
      if (has(o, 'crane t')) a.crane = n0(o['crane t']);
      if (has(o, 'outline')) { const p = txtPts(o.outline); if (p.length > 2) a.pts = p; }
      a.ord = i;
      const d = diffs(old, a, ['code', 'name', 'kind', 'crane', 'color', 'pts']);
      if (d.length) { r.ch++; r.lines.push(`${a.name}: ${d.map(x => (x === 'pts' ? 'outline' : x)).join(', ')}`); } else r.same++;
    });
  }
  const findArea = (v: unknown) => { const s = str(v).toLowerCase(); return s ? N.areas.find(a => (a.code || '').toLowerCase() === s || a.name.toLowerCase() === s || a.id === str(v)) : undefined; };
  if (book.Footprints) {
    const r = sheetRep('Footprints');
    tbl(book.Footprints).forEach(o => {
      let f = N.footprints.find(x => has(o, 'id') && x.id === str(o.id)) || N.footprints.find(x => has(o, 'code') && x.code === str(o.code));
      const a = has(o, 'area') ? findArea(o.area) : undefined;
      if (has(o, 'area') && !a) { warn.push(`Footprint ${str(o.code)}: area "${str(o.area)}" not found`); return; }
      const m = N.drawing?.mpu || null;
      const dimL = has(o, 'length m') ? n0(o['length m']) : null, dimW = has(o, 'width m') ? n0(o['width m']) : null, dimA = has(o, 'angle') ? n0(o.angle) : null;
      if (!f) {
        let p = txtPts(o.outline);
        if (!has(o, 'code') || !a) return;
        if (p.length < 3 && dimL && dimW && m) { const c = a.pts.length > 2 ? labelPt(a.pts) : [N.drawing.w / 2, N.drawing.h / 2]; p = rotRect(c[0], c[1], dimL / m, dimW / m, ((dimA || 0) * Math.PI) / 180); }
        if (p.length < 3) warn.push(`Footprint ${str(o.code)} has no outline or size – draw it on the floor plan`);
        const nf: Footprint = { id: str(o.id) || uid('f'), code: str(o.code), area: a.id, kind: str(o.kind) || 'Build', note: str(o.note), pts: p.length > 2 ? p : [] };
        N.footprints.push(nf); r.nw++; r.lines.push('New footprint ' + nf.code); return;
      }
      const old = clone(f);
      if (has(o, 'code')) f.code = str(o.code);
      if (a) f.area = a.id;
      if (has(o, 'kind')) f.kind = str(o.kind);
      if ('note' in o) f.note = str(o.note);
      if (has(o, 'outline')) { const p = txtPts(o.outline); if (p.length > 2) f.pts = p; }
      if (f.pts.length > 2 && JSON.stringify(f.pts) === JSON.stringify(old.pts)) {
        const F = frameOf(f.pts)!, deg = ptsDeg(f.pts);
        const L = m && dimL ? dimL : null, W = m && dimW ? dimW : null;
        if ((L && Math.abs(L - r1(F.L * m!)) > 0.05) || (W && Math.abs(W - r1(F.W * m!)) > 0.05) || (dimA != null && Math.abs(dimA - deg) > 0.05))
          f.pts = rotRect(F.cx, F.cy, L ? L / m! : F.L, W ? W / m! : F.W, dimA != null ? (dimA * Math.PI) / 180 : F.a);
      }
      const d = diffs(old, f, ['code', 'area', 'kind', 'note', 'pts']);
      if (d.length) { r.ch++; r.lines.push(`${f.code}: ${d.map(x => (x === 'pts' ? 'outline' : x)).join(', ')}`); } else r.same++;
    });
    N.footprints = N.footprints.filter(f => f.pts.length > 2);
  }
  let missing: string[] = [];
  if (book.Items) {
    const r = sheetRep('Items'); const rows = tbl(book.Items); const seen = new Set<string>();
    const findP = (v: unknown) => { const s = str(v).toLowerCase(); return N.projects.find(p => p.code.toLowerCase() === s || p.name.toLowerCase() === s || p.id === str(v)); };
    const findT = (v: unknown) => { const s = str(v).toLowerCase(); return N.types.find(t => t.name.toLowerCase() === s || t.id === str(v)); };
    const findF = (v: unknown, aid?: string) => { const s = str(v).toLowerCase(); return N.footprints.find(f => (f.code.toLowerCase() === s || f.id === str(v)) && (!aid || f.area === aid)); };
    const preds: [Item, string][] = [], parents: [Item, string][] = [];
    rows.forEach((o, i) => {
      let it = N.items.find(x => has(o, 'id') && x.id === str(o.id)) || (has(o, 'code') ? N.items.find(x => x.code === str(o.code)) : undefined);
      const isNew = !it;
      if (!it) {
        if (!has(o, 'code') && !has(o, 'name')) return;
        it = blankItem({ id: str(o.id) || uid('i'), proj: N.projects[0]?.id || '', type: N.types[0]?.id || '' });
      }
      const old = clone(it); seen.add(it.id);
      if (has(o, 'code')) it.code = str(o.code);
      if (has(o, 'name')) it.name = str(o.name);
      if (has(o, 'project')) { const p = findP(o.project); if (p) it.proj = p.id; else warn.push(`Row ${i + 2}: project "${str(o.project)}" not found`); }
      if (has(o, 'type')) { const t = findT(o.type); if (t) it.type = t.id; else warn.push(`Row ${i + 2}: type "${str(o.type)}" not found`); }
      if ('looks like' in o) it.shape = shapeKey(o['looks like']) || '';
      if (has(o, 'area')) { const a = findArea(o.area); if (a) { if (a.id !== it.area) it.fp = ''; it.area = a.id; } else warn.push(`Row ${i + 2}: area "${str(o.area)}" not found`); }
      if ('footprint' in o) {
        if (!str(o.footprint)) it.fp = '';
        else { const f = findF(o.footprint, it.area) || findF(o.footprint); if (f) { it.fp = f.id; it.area = f.area; } else warn.push(`Row ${i + 2}: footprint "${str(o.footprint)}" not found`); }
      }
      const sh = it.start && has(o, 'start') && cellDay(o.start) != null ? cellDay(o.start)! - dn(it.start)! : 0;
      if (has(o, 'start')) { const d = cellDay(o.start); if (d != null) it.start = ds(d); }
      if (has(o, 'finish')) { const d = cellDay(o.finish); if (d != null) it.finish = ds(d); }
      if (sh && !book.Stages) shiftStages(it, sh);
      if (it.start && !it.finish) it.finish = it.start;
      if (it.start && it.finish && dn(it.finish)! < dn(it.start)!) { warn.push(`Row ${i + 2}: finish before start – set to the start`); it.finish = it.start; }
      (['length m', 'width m', 'weight t'] as const).forEach((c, j) => { if (c in o) it![(['l', 'w', 'wt'] as const)[j]] = nN(o[c]); });
      if (has(o, 'turned')) it.ori = clamp(Math.round(n0(o.turned)), 0, 3);
      if ('note' in o) it.note = str(o.note);
      if ('comes after' in o) preds.push([it, str(o['comes after'])]);
      if ('joins into' in o) parents.push([it, str(o['joins into'])]);
      if (isNew) { N.items.push(it); r.nw++; r.lines.push(`New ${it.code} ${it.name}`); if (!book.Stages) fillStages(it, N); }
      else {
        const d = diffs(old, it, ['code', 'name', 'proj', 'type', 'shape', 'area', 'fp', 'start', 'finish', 'l', 'w', 'wt', 'ori', 'note']);
        const lab: Record<string, string> = { proj: 'project', fp: 'footprint', l: 'length', w: 'width', wt: 'weight', ori: 'turned', shape: 'looks like' };
        if (d.length) { r.ch++; r.lines.push(`${it.code}: ${d.map(k => lab[k] || k).join(', ')}`); } else it._same = 1;
      }
    });
    preds.forEach(([it, s]) => {
      const ids = s.split(/[;,]/).map(c => c.trim()).filter(Boolean).map(c => N.items.find(x => x.code === c)?.id).filter(Boolean) as string[];
      if (JSON.stringify(ids) !== JSON.stringify(it.pred || [])) { if (it._same) { delete it._same; r.ch++; r.lines.push(`${it.code}: comes after`); } it.pred = ids; }
    });
    parents.forEach(([it, c]) => {
      const p = c ? N.items.find(x => x.code === c) : null;
      if (c && !p) { warn.push(`${it.code}: joins into "${c}" not found`); return; }
      const v = p && p.id !== it.id ? p.id : '';
      if (v !== (it.parent || '')) { if (it._same) { delete it._same; r.ch++; r.lines.push(`${it.code}: joins into`); } it.parent = v; }
    });
    N.items.forEach(it => { if (it._same) { r.same++; delete it._same; } });
    missing = N.items.filter(it => !seen.has(it.id)).map(it => it.id);
  }
  if (book.Stages) {
    const r = sheetRep('Stages'); const by = new Map<string, Item['stages']>();
    tbl(book.Stages).forEach((o, i) => {
      const it = N.items.find(x => x.code === str(o['item code']));
      if (!it) { warn.push(`Stages row ${i + 2}: item "${str(o['item code'])}" not found`); return; }
      const st = findSt(o.stage);
      if (!st) { warn.push(`Stages row ${i + 2}: stage "${str(o.stage)}" not found`); return; }
      if (!by.has(it.id)) by.set(it.id, []);
      by.get(it.id)!.push({ id: uid('s'), st: st.id, start: cellDay(o.start) != null ? ds(cellDay(o.start)) : '', finish: cellDay(o.finish) != null ? ds(cellDay(o.finish)) : '' });
    });
    by.forEach((L, id) => {
      const it = N.items.find(x => x.id === id)!;
      const key = (x: Item['stages']) => x.map(s => [s.st, s.start, s.finish].join('|')).join(';');
      if (key(L) !== key(it.stages || [])) { const wasNew = !(it.stages || []).length; it.stages = L; if (wasNew) r.nw += L.length; else r.ch++; r.lines.push(`${it.code}: ${L.length} stage${L.length > 1 ? 's' : ''}`); }
      else r.same++;
    });
  }
  const total = report.reduce((s, r) => s + r.nw + r.ch, 0);
  return { next: N, report, warn, missing, total };
}

export function shiftStages(it: Item, n: number) {
  (it.stages || []).forEach(s => { if (s.start) s.start = ds(dn(s.start)! + n); if (s.finish) s.finish = ds(dn(s.finish)! + n); });
}
