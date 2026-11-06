/* Actions used from several pages: adding items, changing a field and everything it ripples into, moving items. */
import { app, itemIn } from '../store/app';
import type { Footprint, Item, PlanState } from '../core/types';
import { blankItem, fillStages } from '../core/example';
import { shiftStages, exportSheets } from '../core/excel';
import { buildXlsx } from '../core/xlsx';
import { s0, s1 } from '../core/plan';
import { download, dn, ds, esc, fd, n0, nN, TODAY, uid } from '../core/util';
import { frameOf, isRect, ptsDeg, rotPts, rotRect, bbox, rectPts } from '../core/geometry';

/** the item's tooltip, as HTML */
export function itemTip(it: Item) {
  const P = app.P, V = app.V, a = P.area(it.area), f = P.fpOf(it.fp), p = P.probs(it.id), sg = P.stageOn(it, V.date);
  return `<b>${esc(it.code)}</b> ${esc(it.name)}\n${esc(P.proj(it.proj).name)} · ${esc(P.typ(it.type).name)}\n${esc(a ? a.name : 'No area')} · ${f ? esc(f.code) : 'not in a footprint'}\n${it.start ? `${fd(s0(it))} – ${fd(s1(it))} (${s1(it) - s0(it) + 1} days)` : 'No dates'}${sg ? `\nOn ${fd(V.date)}: ${esc(P.stype(sg.st).name)}` : ''}${it.l && it.w ? `\n${it.l} × ${it.w} m` : ''}${it.wt ? ` · ${it.wt} t` : ''}${p.length ? '\n⚠ ' + p.map(x => esc(x.t)).join('\n⚠ ') : ''}`;
}

export function newItem(o: Partial<Item> = {}) {
  const P = app.P, V = app.V;
  const area = o.area ?? (V.focus !== 'all' ? V.focus : '');
  const it = blankItem({ code: 'NEW-' + (P.S.items.length + 1), proj: P.S.projects.find(p => !V.hide.includes(p.id))?.id || P.S.projects[0]?.id || '', type: P.S.types[0]?.id || '', area, start: ds(V.date), finish: ds(V.date + 27), ...o });
  fillStages(it, P.S);
  app.commit(d => { d.items.push(it); }, `Added ${it.code}`);
  app.openItem(it.id);
  setTimeout(() => document.querySelector<HTMLInputElement>('.drawer #dName')?.focus(), 40);
  return it;
}

/** one place that knows how a field change ripples through an item */
export function applyField(id: string, f: string, v: string) {
  return app.commit(d => {
    const it = itemIn(d, id);
    const fpOf = (fid: string) => d.footprints.find(x => x.id === fid);
    if (f === 'days') { const n = Math.max(1, Math.round(n0(v))); if (it.start) it.finish = ds(s0(it) + n - 1); }
    else if (f === 'start') {
      if (!v) { it.start = ''; return; }
      const keep = it.start && it.finish ? s1(it) - s0(it) : 0, sh = it.start ? dn(v)! - s0(it) : 0;
      it.start = ds(dn(v)); it.finish = ds(dn(v)! + keep);
      if (sh) shiftStages(it, sh);
    }
    else if (f === 'finish') { if (!v) return false; it.finish = ds(dn(v)); if (it.start && dn(v)! < s0(it)) it.start = it.finish; }
    else if (f === 'l' || f === 'w' || f === 'wt') it[f] = nN(v);
    else if (f === 'area') { it.area = v; if (it.fp && fpOf(it.fp)?.area !== v) it.fp = ''; }
    else if (f === 'fp') { it.fp = v; if (v) it.area = fpOf(v)!.area; }
    else if (f === 'parent') {
      if (v && (v === it.id || app.P.isUnder(v, it.id))) { app.toast('That would put it inside itself'); return false; }
      it.parent = v;
    }
    else if (f === 'code') { const c = String(v).trim(); if (!c) return false; it.code = c; }
    else if (f === 'ori') it.ori = +v;
    else (it as unknown as Record<string, unknown>)[f] = v;
  });
}

/** from typing or pasting into the Items table: names and codes are looked up */
export function setItemField(id: string, f: string, v: string) {
  const P = app.P, it = P.item(id); if (!it) return false;
  if (f === 'parent') {
    const c = String(v).trim();
    if (!c) return applyField(id, 'parent', '');
    const p = P.S.items.find(i => i.code === c) || P.S.items.find(i => i.code.toLowerCase() === c.toLowerCase());
    if (!p) { app.toast(`No item with code “${c}”`); app.emit(); return false; }
    return applyField(id, 'parent', p.id);
  }
  if (['proj', 'type', 'area', 'fp', 'shape'].includes(f)) {
    const s = String(v).trim().toLowerCase();
    if (f === 'shape') { /* handled by the select */ }
    else {
      const list = ({ proj: P.S.projects, type: P.S.types, area: P.S.areas, fp: P.fpsIn(it.area) } as Record<string, { id: string; code?: string; name?: string }[]>)[f];
      const m = list.find(x => x.id === v) || list.find(x => (x.code || '').toLowerCase() === s || (x.name || '').toLowerCase() === s);
      if (!m && s) { app.toast(`“${v}” is not a ${f === 'proj' ? 'project' : f === 'fp' ? 'footprint' : f}`); app.emit(); return false; }
      v = m ? m.id : '';
    }
  }
  if ((f === 'start' || f === 'finish') && v && !/^\d{4}-/.test(v)) { const d = dn(v); v = d == null ? '' : ds(d); }
  return applyField(id, f, v);
}

export function addStage(id: string, st: string) {
  const it = app.P.item(id)!;
  const last = (it.stages || []).reduce((m, s) => Math.max(m, dn(s.finish) ?? -Infinity), -Infinity);
  const a = it.start ? (isFinite(last) ? Math.min(last + 1, s1(it)) : s0(it)) : TODAY, b = it.start ? Math.min(s1(it), a + 6) : a + 6;
  const sg = { id: uid('s'), st, start: ds(a), finish: ds(Math.max(a, b)) };
  app.commit(d => { const x = itemIn(d, id); x.stages = [...(x.stages || []), sg]; }, `${app.P.stype(st).name} added to ${it.code}`);
  if (app.drawer.id === id) app.openItem(id, sg.id);
  return sg;
}
export function useStandardStages(id: string) {
  const had = app.P.item(id)!.stages.length;
  app.commit(d => { fillStages(itemIn(d, id), d); }, had ? 'Stages replaced with the standard ones' : 'Standard stages added');
}
export function startAfterParts(id: string) {
  const P = app.P, it = P.item(id)!, kids = P.kidsOf(id).filter(k => k.finish);
  if (!kids.length) return;
  const s = Math.max(...kids.map(k => s1(k))) + 1, len = it.start && it.finish ? s1(it) - s0(it) : 27, sh = it.start ? s - s0(it) : 0;
  app.commit(d => { const x = itemIn(d, id); x.start = ds(s); x.finish = ds(s + len); if (sh) shiftStages(x, sh); }, `${it.code} now starts ${fd(s)}, the day after its last part`);
}
export function turnItem(id: string) { app.commit(d => { const x = itemIn(d, id); x.ori = (x.ori + 1) % 4; }); }

export function assignFp(id: string, f: Footprint) {
  const it = app.P.item(id)!, moving = it.area !== f.area;
  app.commit(d => { const x = itemIn(d, id); x.fp = f.id; x.area = f.area; });
  const c = app.P.probs(id).filter(p => p.k === 'clash');
  app.toast(c.length ? `${it.code} put in ${f.code} – ${c[0].t.toLowerCase()}` : `${it.code} put in ${f.code}${moving ? ' (' + app.P.area(f.area)!.name + ')' : ''}`, { undo: true });
}

export function duplicateItem(id: string) {
  const it = app.P.item(id)!;
  const n: Item = JSON.parse(JSON.stringify(it));
  n.id = uid('i'); n.code = (it.code || '') + '-copy'; n.pred = []; n.fp = ''; n.stages.forEach(s => (s.id = uid('s')));
  app.commit(d => { d.items.push(n); }, 'Duplicated (not in a footprint yet)');
  app.openItem(n.id);
}
export function deleteItems(ids: Set<string>, msg: string) {
  app.commit(d => {
    const gone = d.items.filter(i => ids.has(i.id));
    d.items = d.items.filter(i => !ids.has(i.id));
    d.items.forEach(o => {
      o.pred = (o.pred || []).filter(p => !ids.has(p));
      if (ids.has(o.parent)) o.parent = gone.find(g => g.id === o.parent)?.parent || '';
      if (ids.has(o.parent)) o.parent = '';
    });
  }, msg);
  if (app.drawer.id && ids.has(app.drawer.id)) app.closeDrawer();
}
export function deleteItem(id: string) {
  const P = app.P, it = P.item(id)!, kids = P.kidsOf(id);
  deleteItems(new Set([id]), `Deleted ${it.code}${kids.length ? ` – its ${kids.length} parts now join ${P.parentOf(it)?.code || 'nothing'}` : ''}`);
}

/** jump to the floor plan on a date, zoomed to an area */
export function openOnFloor(d: number, area = 'all') {
  app.setEdit(false);
  app.setView({ date: d, focus: area || 'all' });
  app.go('floor');
}
export function showOnFloor(id: string) {
  const it = app.P.item(id)!; if (!it.start) return;
  const date = app.V.date >= s0(it) && app.V.date <= s1(it) ? app.V.date : s0(it);
  app.setEdit(false);
  app.setView({ date, focus: it.area || 'all', sel: it.id, page: 'floor' });
}

/* ---------- footprints ---------- */
export function turnFp(fid: string, deg: number) {
  app.commit(d => { const f = d.footprints.find(x => x.id === fid)!, F = frameOf(f.pts)!; f.pts = rotPts(f.pts, (deg * Math.PI) / 180, F.cx, F.cy); });
}
/** typed sizes rebuild it as a rectangle round its centre */
export function sizeFp(fid: string, L: number | null, W: number | null, deg: number | null) {
  const m = app.P.mpu();
  app.commit(d => {
    const f = d.footprints.find(x => x.id === fid)!, F = frameOf(f.pts)!, a = deg == null ? F.a : (deg * Math.PI) / 180;
    f.pts = rotRect(F.cx, F.cy, L != null && m ? L / m : F.L, W != null && m ? W / m : F.W, a);
  });
}
export function setFpAngle(fid: string, v: number) {
  const f = app.P.fpOf(fid)!;
  if (isRect(f.pts)) sizeFp(fid, null, null, v); else turnFp(fid, v - ptsDeg(f.pts));
}
export function squareFp(fid: string) { app.commit(d => { const f = d.footprints.find(x => x.id === fid)!, b = bbox(f.pts)!; f.pts = rectPts(b.x, b.y, b.w, b.h); }); }
export function removeFootprint(d: PlanState, fid: string) {
  d.footprints = d.footprints.filter(x => x.id !== fid);
  d.items.forEach(i => { if (i.fp === fid) i.fp = ''; });
}

/* ---------- Excel ---------- */
export function exportXlsx(template = false) {
  download(buildXlsx(exportSheets(app.P, template)), template ? 'FMAREA-template.xlsx' : `FMAREA-${ds(TODAY)}.xlsx`);
}
