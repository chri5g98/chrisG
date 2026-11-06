/* Floor plan: the yard drawing with areas, footprints and what sits in them on the chosen date.
   View mode moves blocks between footprints; Edit layout draws the drawing, scale, areas and footprints. */
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { app, useApp } from '../store/app';
import type { Area, Footprint, Item, Pt } from '../core/types';
import { dist, fBox, frameOf, fTx, inPoly, isRect, labelPt, movePts, polyArea, polyD, ptsDeg, rectPts, rotPts, rotRect } from '../core/geometry';
import { floorBody, focusBox } from '../core/floorSvg';
import { heatCol, onDay, ratioCol, s0, s1 } from '../core/plan';
import { shapeSVG, PAL } from '../core/shapes';
import { readPicture } from '../core/pictures';
import { clamp, DAY, esc, fd, fdl, MON, monday, n0, r1, TODAY, uid, weekNo } from '../core/util';
import { DEF_MPU } from '../core/example';
import { Icon } from '../ui/Icon';
import { Modal, confirmBox, tip } from '../ui/Overlays';
import { In } from '../ui/fields';
import { assignFp, itemTip, newItem, removeFootprint, setFpAngle, sizeFp, squareFp, turnFp } from '../ui/actions';
import { setPageKeys } from '../ui/keys';

type FV = { s: number; tx: number; ty: number; key: string; h: number };
type Draft = { kind: 'rect'; a: Pt; b: { x: number; y: number; w: number; h: number } | null } | { kind: 'poly' | 'scale'; pts: Pt[]; mouse?: Pt };
const HANDLE = 5;

export function FloorPlan() {
  const a = useApp(); const P = a.P, V = a.V, S = P.S, edit = a.editLayout, esel = a.esel;
  const svgRef = useRef<SVGSVGElement>(null);
  const fv = useRef<FV | null>(null);
  const drag = useRef<Record<string, unknown> | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const setDraft = (d: Draft | null) => { draftRef.current = d; setDraftState(d ? { ...d } as Draft : null); };
  const [tmp, setTmp] = useState('');
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [play, setPlay] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ---------- view: fit, zoom, pan ---------- */
  const fit = useCallback((keep = false) => {
    const svg = svgRef.current; if (!svg) return;
    const W = svg.clientWidth || 900, b = focusBox(app.P, app.V.focus, app.editLayout), pad = 20;
    const maxH = Math.max(420, innerHeight - 250), h = Math.min(maxH, Math.max(420, (b.h * (W - pad * 2)) / b.w + pad * 2));
    const key = app.V.focus + app.editLayout;
    if (keep && fv.current && fv.current.key === key) { fv.current.h = h; force(); return; }
    const s = Math.min((W - pad * 2) / b.w, (h - pad * 2) / b.h);
    fv.current = { s, tx: (W - b.w * s) / 2 - b.x * s, ty: (h - b.h * s) / 2 - b.y * s, key, h };
    force();
  }, []);
  useLayoutEffect(() => { fit(); }, [V.focus, edit, S.drawing.id, fit]);
  useEffect(() => { const r = () => fit(true); addEventListener('resize', r); return () => removeEventListener('resize', r); }, [fit]);
  const zoom = (k: number, cx?: number, cy?: number) => {
    const svg = svgRef.current, F = fv.current; if (!svg || !F) return;
    if (cx == null) { cx = svg.clientWidth / 2; cy = svg.clientHeight / 2; }
    const base = (svg.clientWidth || 900) / S.drawing.w, s2 = clamp(F.s * k, base * 0.3, base * 40); k = s2 / F.s;
    F.tx = cx - (cx - F.tx) * k; F.ty = cy! - (cy! - F.ty) * k; F.s = s2; force();
  };
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    const w = (e: WheelEvent) => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); };
    svg.addEventListener('wheel', w, { passive: false });
    return () => svg.removeEventListener('wheel', w);
  });
  const toWorld = (e: { clientX: number; clientY: number }): Pt => { const r = svgRef.current!.getBoundingClientRect(), F = fv.current!; return [(e.clientX - r.left - F.tx) / F.s, (e.clientY - r.top - F.ty) / F.s]; };
  const viewTx = () => { const F = fv.current; return F ? `translate(${F.tx} ${F.ty}) scale(${F.s})` : ''; };
  const setTx = () => svgRef.current?.querySelector('#flView')?.setAttribute('transform', viewTx());

  /* ---------- date ---------- */
  const setDate = (d: number) => app.setView({ date: clamp(Math.round(d), P.R.d0, P.R.d1) });
  useEffect(() => {
    if (!play) return;
    if (app.V.date >= P.R.d1 - 7) setDate(monday(TODAY));
    const t = setInterval(() => { if (app.V.date + 7 > app.P.R.d1 || app.editLayout) { setPlay(false); return; } app.setView({ date: app.V.date + 7 }); }, 650);
    return () => clearInterval(t);
  }, [play]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- lookups ---------- */
  const fpAt = (p: Pt) => S.footprints.filter(f => f.pts.length > 2 && inPoly(p, f.pts)).sort((x, y) => polyArea(x.pts) - polyArea(y.pts))[0] || null;
  const areaAt = (p: Pt) => S.areas.filter(x => x.pts.length > 2 && inPoly(p, x.pts)).sort((x, y) => polyArea(x.pts) - polyArea(y.pts))[0] || null;
  const mpu = P.mpu();

  /* ---------- view mode: move blocks between footprints ---------- */
  const startItemDrag = (e: { clientX: number; clientY: number }, it: Item) => {
    const f0 = P.fpOf(it.fp), F0 = f0 ? frameOf(f0.pts) : null, m = mpu || DEF_MPU;
    const sz: [number, number] = F0 ? [F0.L, F0.W] : [(it.l || 14) / m, (it.w || 11) / m];
    const D = { kind: 'item', it, p0: [e.clientX, e.clientY], moved: false, sz, tf: null as Footprint | null, ta: null as Area | null };
    drag.current = D;
    const mv = (ev: PointerEvent) => {
      if (!D.moved && Math.hypot(ev.clientX - D.p0[0], ev.clientY - D.p0[1]) < 4) return;
      D.moved = true;
      const p = toWorld(ev), tf = fpAt(p), ta = tf ? P.area(tf.area)! : areaAt(p); D.tf = tf; D.ta = ta;
      const k = 1 / fv.current!.s; let box, tr = '';
      if (tf) { const F = frameOf(tf.pts)!; box = fBox(F, F.W * 0.05); tr = fTx(F); }
      else box = { x: p[0] - sz[0] / 2, y: p[1] - sz[1] / 2, w: sz[0], h: sz[1] };
      const taken = tf ? P.takenBy(it, tf.id, true) : [];
      setTmp((tf ? `<path d="${polyD(tf.pts)}" fill="var(--accent-soft)" stroke="${taken.length ? 'var(--late)' : 'var(--accent)'}" stroke-width="${3 * k}"/>` : '') + `<g opacity=".8" transform="${tr}">${shapeSVG(P.shapeOf(it), box, it.ori, P.colourOf(it, V.colour), k, { sw: 1.5 })}</g>`);
      tip(ev, tf ? `${esc(it.code)} → ${esc(tf.code)} (${esc(P.area(tf.area)?.name || '')})${taken.length ? `\n⚠ ${esc(taken.map(o => o.code).join(', '))} ${taken.length > 1 ? 'are' : 'is'} there on these dates` : ''}` : ta ? `${esc(it.code)} → ${esc(ta.name)}, not in a footprint` : 'Drop on a footprint');
    };
    const up = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); tip(null);
      drag.current = null; setTmp('');
      if (!D.moved) { app.openItem(it.id); return; }
      const r = svgRef.current!.getBoundingClientRect();
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;
      if (D.tf) { if (D.tf.id !== it.fp) assignFp(it.id, D.tf); }
      else if (D.ta) { const ta = D.ta; if (!(ta.id === it.area && !it.fp)) app.commit(d => { const x = d.items.find(i => i.id === it.id)!; x.area = ta.id; x.fp = ''; }, `${it.code} is in ${ta.name} but not in a footprint`); }
      else app.toast('Dropped outside every area – nothing moved');
    };
    app.setView({ sel: it.id });
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  };
  const fillPop = (fid: string, ev: { clientX: number; clientY: number }) => {
    const f = P.fpOf(fid)!, d = V.date, look = S.set.look || 14;
    const cand = S.items.filter(it => P.shown(it) && it.area === f.area && !P.placed(it) && it.start && s1(it) >= d && s0(it) <= d + look * 4).sort((x, y) => s0(x) - s0(y));
    const other = S.items.filter(it => P.shown(it) && it.area === f.area && P.placed(it) && it.fp !== f.id && onDay(it, d));
    app.openPopover(ev.clientX + 8, ev.clientY + 8, close => (
      <>
        <div><b>{f.code}</b> <span className="muted small">· {P.area(f.area)?.name || ''} · {P.fmtSize(f)}</span></div>
        {cand.length ? <><div className="lbl">Not in a footprint yet</div><div className="ulist" style={{ padding: 0 }}>{cand.slice(0, 8).map(it => <button key={it.id} className="uitem" style={{ ['--c' as string]: P.colourOf(it, V.colour) }} onClick={() => { close(); assignFp(it.id, f); }}><i /><span className="ell"><b>{it.code}</b> {it.name}<br /><span className="xs muted">{fd(s0(it))}–{fd(s1(it))}</span></span></button>)}</div></> : <div className="small muted">Every item in this area already has a footprint.</div>}
        {other.length ? <><div className="lbl">Move here from another footprint</div><div className="ulist" style={{ padding: 0 }}>{other.slice(0, 6).map(it => <button key={it.id} className="uitem" style={{ ['--c' as string]: P.colourOf(it, V.colour) }} onClick={() => { close(); assignFp(it.id, f); }}><i /><span className="ell"><b>{it.code}</b> in {P.fpOf(it.fp)!.code}</span></button>)}</div></> : null}
        <div className="row"><button className="btn sm" onClick={() => { close(); newItem({ area: f.area, fp: f.id }); }}><Icon k="plus" />New item here</button></div>
      </>
    ));
  };
  const floorDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    tip(null); app.closePopover();
    const t = e.target as Element, g = t.closest('.it') as SVGElement | null, f = t.closest('.fl-fp') as SVGElement | null;
    if (g) { startItemDrag(e, P.item(g.dataset.i!)!); return; }
    const F = fv.current!;
    drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, tx: F.tx, ty: F.ty, moved: false, fp: f?.dataset.f };
    svgRef.current!.classList.add('panning'); svgRef.current!.setPointerCapture(e.pointerId);
  };

  /* ---------- edit layout ---------- */
  const eobj = (): Area | Footprint | null => (esel ? (esel.kind === 'fp' ? P.fpOf(esel.id) : P.area(esel.id)) || null : null);
  const snapPt = (p: Pt, skip?: { id: string; i: number }): Pt => {
    const r = 8 / fv.current!.s; let best: Pt | null = null, bd = r;
    [...app.S.areas, ...app.S.footprints].forEach(o => o.pts.forEach((q, i) => { if (skip && skip.id === o.id && skip.i === i) return; const d = dist(p, q); if (d < bd) { bd = d; best = q; } }));
    return best ? [best[0], best[1]] : [r1(p[0]), r1(p[1])];
  };
  const patchShape = (kind: 'fp' | 'area', id: string, fn: (pts: Pt[]) => Pt[]) => app.preview(d => {
    const o = kind === 'fp' ? d.footprints.find(x => x.id === id) : d.areas.find(x => x.id === id);
    if (o) o.pts = fn(o.pts);
  });
  const createShape = (pts: Pt[]) => {
    const tool = app.V.tool, ex = app.esel?.kind === 'area' ? app.P.area(app.esel.id) : null;
    if (tool === 'area') {
      if (ex && !ex.pts.length) { app.commit(d => { d.areas.find(x => x.id === ex.id)!.pts = pts; }, `Outline drawn for ${ex.name}`); app.setView({ drawArea: ex.id }); return; }
      const ar: Area = { id: uid('a'), code: 'A' + (S.areas.length + 1), name: 'New area', kind: 'Shed', color: PAL[S.areas.length % PAL.length], crane: 0, ord: S.areas.length, pts };
      app.commit(d => { d.areas.push(ar); }, 'Area added – give it a name on the right');
      app.setEsel({ kind: 'area', id: ar.id }); app.setView({ drawArea: ar.id });
      setTimeout(() => (document.getElementById('eName') as HTMLInputElement | null)?.select(), 40);
      return;
    }
    const c = labelPt(pts), ar = areaAt(c) || P.area(app.V.drawArea);
    if (!ar) { app.toast('Draw the hall or area outline first, or add an area on the Areas page'); return; }
    const f: Footprint = { id: uid('f'), code: app.P.nextFpCode(ar), area: ar.id, kind: ar.kind === 'Outdoor' ? 'Laydown' : 'Build', note: '', pts };
    app.commit(d => { d.footprints.push(f); }, `${f.code} added to ${ar.name}`);
    app.setEsel({ kind: 'fp', id: f.id });
  };
  const finishPoly = () => { const D = draftRef.current; setDraft(null); if (D && D.kind === 'poly' && D.pts.length >= 3) createShape(D.pts); };
  const editDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const p = toWorld(e), t = e.target as Element, tool = V.tool, F = fv.current!;
    tip(null);
    const panStart = () => { drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, tx: F.tx, ty: F.ty, moved: false }; svgRef.current!.classList.add('panning'); };
    if (tool === 'select') {
      const v = t.closest('[data-v]') as SVGElement | null, mid = t.closest('[data-mid]') as SVGElement | null, f = t.closest('.fl-fp') as SVGElement | null, ar = t.closest('.fl-area') as SVGElement | null;
      const o = eobj();
      if (t.closest('[data-rot]') && o && esel) {
        const Fr = frameOf(o.pts)!; app.beginGesture();
        drag.current = { kind: 'rot', sel: esel, F: Fr, a0: Math.atan2(p[1] - Fr.cy, p[0] - Fr.cx), orig: o.pts.map(q => [...q]) };
      } else if (v && o && esel) {
        if (e.detail === 2 && o.pts.length > 3) { const i = +v.dataset.v!; app.commit(d => { const x = esel.kind === 'fp' ? d.footprints.find(z => z.id === esel.id)! : d.areas.find(z => z.id === esel.id)!; x.pts.splice(i, 1); }); return; }
        app.beginGesture(); drag.current = { kind: 'vert', sel: esel, i: +v.dataset.v! };
      } else if (mid && o && esel) {
        const i = +mid.dataset.mid! + 1; app.beginGesture();
        patchShape(esel.kind, esel.id, pts => { const n = [...pts]; n.splice(i, 0, p); return n; });
        drag.current = { kind: 'vert', sel: esel, i, moved: true };
      } else if (f || ar) {
        const sel = f ? { kind: 'fp' as const, id: f.dataset.f! } : { kind: 'area' as const, id: ar!.dataset.a! };
        app.setEsel(sel);
        const obj = (f ? P.fpOf(sel.id) : P.area(sel.id))!, kids = f ? [] : P.fpsIn(obj.id);
        app.beginGesture();
        drag.current = { kind: 'body', sel, kids: kids.map(k => k.id), p0: p, orig: [obj, ...kids].map(x => x.pts.map(q => [...q])) };
      } else { app.setEsel(null); panStart(); }
    } else if (tool === 'scale') {
      if (draftRef.current?.kind !== 'scale') setDraft({ kind: 'scale', pts: [] });
      drag.current = { kind: 'click', x: e.clientX, y: e.clientY, p, tx: F.tx, ty: F.ty };
    } else if (V.toolShape === 'rect') {
      setDraft({ kind: 'rect', a: snapPt(p), b: null }); drag.current = { kind: 'rect' };
    } else {
      if (draftRef.current?.kind !== 'poly') setDraft({ kind: 'poly', pts: [] });
      drag.current = { kind: 'click', x: e.clientX, y: e.clientY, p, tx: F.tx, ty: F.ty };
    }
    svgRef.current!.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const D = drag.current as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!D) {
      if (edit) { const dr = draftRef.current; if (dr && dr.kind !== 'rect') { dr.mouse = toWorld(e); setDraft(dr); } tip(null); return; }
      const t = e.target as Element, g = t.closest('.it') as SVGElement | null;
      if (g) { tip(e, itemTip(P.item(g.dataset.i!)!)); return; }
      const f = t.closest('.fl-fp') as SVGElement | null;
      if (f) { const fp = P.fpOf(f.dataset.f!)!, nx = P.fpUse(V.date).next[fp.id]; tip(e, `<b>${esc(fp.code)}</b> · ${esc(P.area(fp.area)?.name || '')}\n${esc(fp.kind)} footprint · ${P.fmtSize(fp)}\nFree on ${fd(V.date)}${nx ? `\nNext: ${esc(nx.code)} from ${fd(s0(nx))}` : ''}\nClick to fill it`); return; }
      tip(null); return;
    }
    if (D.kind === 'item') return;
    const q = toWorld(e), F = fv.current!;
    if (D.kind === 'pan' || D.kind === 'click') {
      const dx = e.clientX - D.x, dy = e.clientY - D.y;
      if (Math.abs(dx) + Math.abs(dy) > (D.kind === 'click' ? 4 : 3)) { D.moved = true; F.tx = D.tx + dx; F.ty = D.ty + dy; setTx(); }
      return;
    }
    if (D.kind === 'rot') {
      D.moved = true;
      let da = Math.atan2(q[1] - D.F.cy, q[0] - D.F.cx) - D.a0, deg = ((D.F.a + da) * 180) / Math.PI;
      if (!e.shiftKey) deg = Math.round(deg / 5) * 5;
      da = (deg * Math.PI) / 180 - D.F.a;
      patchShape(D.sel.kind, D.sel.id, () => rotPts(D.orig, da, D.F.cx, D.F.cy));
      tip(e, `${Math.round((((deg % 180) + 180) % 180))}°`); return;
    }
    if (D.kind === 'vert') { D.moved = true; const sp = snapPt(q, { id: D.sel.id, i: D.i }); patchShape(D.sel.kind, D.sel.id, pts => pts.map((x, i) => (i === D.i ? sp : x))); return; }
    if (D.kind === 'body') {
      const dx = q[0] - D.p0[0], dy = q[1] - D.p0[1];
      if (Math.hypot(dx, dy) * F.s > 3) D.moved = true;
      if (!D.moved) return;
      app.preview(d => {
        const main = D.sel.kind === 'fp' ? d.footprints.find(x => x.id === D.sel.id) : d.areas.find(x => x.id === D.sel.id);
        if (main) main.pts = movePts(D.orig[0], dx, dy);
        (D.kids as string[]).forEach((kid, j) => { const k = d.footprints.find(x => x.id === kid); if (k) k.pts = movePts(D.orig[j + 1], dx, dy); });
      });
      return;
    }
    if (D.kind === 'rect') {
      const dr = draftRef.current; if (!dr || dr.kind !== 'rect') return;
      const b2 = snapPt(q), aa = dr.a;
      setDraft({ ...dr, b: { x: Math.min(aa[0], b2[0]), y: Math.min(aa[1], b2[1]), w: Math.abs(b2[0] - aa[0]), h: Math.abs(b2[1] - aa[1]) } });
    }
  };
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const D = drag.current as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!D || D.kind === 'item') return;
    drag.current = null; svgRef.current?.classList.remove('panning'); tip(null);
    const F = fv.current!;
    if (D.kind === 'pan') {
      force();
      if (!D.moved && !edit) { if (D.fp) fillPop(D.fp, e); else { app.setView({ sel: null }); app.closeDrawer(); } }
      return;
    }
    if (D.kind === 'vert' || D.kind === 'body' || D.kind === 'rot') { if (D.moved) app.endGesture(); else app.cancelGesture(); return; }
    if (D.kind === 'rect') {
      const dr = draftRef.current; setDraft(null);
      const b = dr && dr.kind === 'rect' ? dr.b : null;
      if (b && b.w * F.s > 6 && b.h * F.s > 6) createShape(rectPts(b.x, b.y, b.w, b.h));
      return;
    }
    if (D.kind === 'click' && !D.moved) {
      const dr = draftRef.current; if (!dr || dr.kind === 'rect') return;
      let q: Pt = D.p;
      if (dr.kind === 'scale') { const pts = [...dr.pts, q]; setDraft({ ...dr, pts }); if (pts.length === 2) scaleDialog(pts, () => setDraft(null)); return; }
      q = snapPt(q);
      if (e.shiftKey && dr.pts.length) { const l = dr.pts[dr.pts.length - 1]; if (Math.abs(q[0] - l[0]) > Math.abs(q[1] - l[1])) q = [q[0], l[1]]; else q = [l[0], q[1]]; }
      if (dr.pts.length >= 3 && dist(q, dr.pts[0]) * F.s < 10) { finishPoly(); return; }
      if (!dr.pts.length || dist(q, dr.pts[dr.pts.length - 1]) * F.s > 3) setDraft({ ...dr, pts: [...dr.pts, q] });
    } else force();
  };

  /* ---------- keys ---------- */
  setPageKeys((e: KeyboardEvent) => {
    const k = e.key;
    if (!edit) {
      const it = V.sel ? P.item(V.sel) : undefined;
      if (it && P.placed(it) && (k === 'r' || k === 'R')) { e.preventDefault(); app.commit(d => { const x = d.items.find(i => i.id === it.id)!; x.ori = (x.ori + 1) % 4; }); return true; }
      const dir = ({ ArrowLeft: -1, ArrowRight: 1 } as Record<string, number>)[k];
      if (!dir) return false;
      e.preventDefault(); setDate(V.date + dir * (e.shiftKey ? 7 : 1)); return true;
    }
    const dr = draftRef.current;
    if (dr) {
      if (k === 'Escape') { setDraft(null); return true; }
      if (k === 'Enter' && dr.kind === 'poly') { finishPoly(); return true; }
      if (k === 'Backspace' && dr.kind === 'poly') { setDraft({ ...dr, pts: dr.pts.slice(0, -1) }); return true; }
    }
    if (!esel) return k === 'Escape';
    if (k === 'Escape') { app.setEsel(null); return true; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); delSel(); return true; }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'd' && esel.kind === 'fp') { e.preventDefault(); dupFp(esel.id); return true; }
    if ((k === '[' || k === ']') && esel.kind === 'fp') { e.preventDefault(); turnFp(esel.id, (k === ']' ? 1 : -1) * (e.shiftKey ? 15 : 5)); return true; }
    const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[k];
    if (dir) {
      e.preventDefault();
      const st = (e.shiftKey ? 5 : 0.5) / (mpu || DEF_MPU);
      app.commit(d => {
        const o = esel.kind === 'fp' ? d.footprints.find(x => x.id === esel.id)! : d.areas.find(x => x.id === esel.id)!;
        o.pts = movePts(o.pts, dir[0] * st, dir[1] * st);
        if (esel.kind === 'area') d.footprints.filter(f => f.area === o.id).forEach(f => (f.pts = movePts(f.pts, dir[0] * st, dir[1] * st)));
      });
      return true;
    }
    return false;
  });
  const dupFp = (fid: string) => {
    const f = P.fpOf(fid)!, F = frameOf(f.pts)!, gap = 1 / (mpu || DEF_MPU), dx = Math.cos(F.a) * (F.L + gap), dy = Math.sin(F.a) * (F.L + gap);
    const n: Footprint = { id: uid('f'), code: P.nextFpCode(P.area(f.area)), area: f.area, kind: f.kind, note: '', pts: movePts(f.pts, dx, dy) };
    app.commit(d => { d.footprints.push(n); }, `${n.code} added next to ${f.code}`);
    app.setEsel({ kind: 'fp', id: n.id });
  };
  const delSel = () => delSelection(app.esel);

  /* ---------- drawing ---------- */
  const F = fv.current, k = F ? 1 / F.s : 1;
  const body = F ? floorBody(P, V.date, { k, edit, sel: V.sel, ghost: V.ghost, label: V.label, colour: V.colour, esel }) + (edit ? editOverlay(eobj(), esel?.kind, k) : '') : '';
  const draftSvg = draft && F ? draftMarkup(draft, k, mpu) : '';
  let scaleBar = null;
  if (F && svgRef.current) {
    const W = svgRef.current.clientWidth, H = F.h;
    if (mpu) {
      const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500], L = nice.find(n => (n / mpu) * F.s >= 90) || 500, px = (L / mpu) * F.s;
      scaleBar = <g transform={`translate(${W - 20 - px} ${H - 22})`}><rect width={px} height={5} fill="var(--fg-2)" /><rect width={px / 2} height={5} fill="var(--surface)" stroke="var(--fg-2)" strokeWidth={1} /><text x={px} y={-5} textAnchor="end" style={{ font: '500 11px var(--f-mono)', fill: 'var(--muted)' }}>{L} m</text></g>;
    } else if (edit || S.drawing.src) scaleBar = <text x={W - 16} y={H - 14} textAnchor="end" style={{ font: '500 11.5px var(--f-body)', fill: 'var(--risk)' }}>No scale set – use Set scale in Edit layout</text>;
  }
  const D = S.drawing;

  const uploadDrawing = async (file: File) => {
    let res;
    try { app.toast('Reading ' + file.name + '…'); res = await readPicture(file); }
    catch (er) { app.toast('Could not read that drawing: ' + ((er as Error).message || er) + '. Save it as PNG, JPG or PDF and try again.'); return; }
    const apply = (clear: boolean) => {
      app.commit(d => {
        d.drawing = { id: uid('d'), src: res.src, w: res.w, h: res.h, mpu: null, name: file.name, op: d.drawing.op || 0.9 };
        if (clear) { d.areas.forEach(x => (x.pts = [])); d.footprints = []; d.items.forEach(i => (i.fp = '')); }
      }, `Drawing added (${res.w} × ${res.h})`, { label: 'Set the scale', fn: () => app.setView({ tool: 'scale' }) });
      app.setView({ tool: 'scale' });
    };
    if (!(S.areas.some(x => x.pts.length) || S.footprints.length)) { apply(false); return; }
    app.openModal(close => (
      <Modal title="New yard drawing" sub={file.name} onClose={close} footer={<><span className="grow" /><button className="btn" onClick={close}>Cancel</button><button className="btn" onClick={() => { close(); apply(true); }}>Clear and redraw</button><button className="btn primary" onClick={() => { close(); apply(false); }}>Keep them</button></>}>
        <p style={{ margin: 0 }}>You already have area outlines and {S.footprints.length} footprints. Keep them where they are, or clear them and draw them again on the new drawing? Items are kept either way.</p>
      </Modal>
    ));
  };

  const hint = { select: 'Click an area or footprint to select it. Drag it to move it (an area takes its footprints with it), drag the squares to move corners, drag the round handles to add a corner. Turn a footprint with its round handle or [ and ], or type its size and angle on the right. Delete removes it, Ctrl+D copies it alongside, arrow keys nudge (Shift = 5 m).', fp: V.toolShape === 'poly' ? 'Click each corner of the footprint. Click the first corner, double-click or press Enter to finish. Backspace removes the last corner, Esc cancels.' : 'Drag a box for each footprint. It joins the area it is drawn in.', area: V.toolShape === 'poly' ? 'Click each corner of the hall or area. Click the first corner, double-click or press Enter to finish.' : 'Drag a box around the hall or area.', scale: 'Click two points on the drawing a known distance apart – the ends of a dimension line or a shed wall – then type the distance.' }[V.tool];
  const zoomBtns = <div className="seg"><button title="Zoom out" onClick={() => zoom(1 / 1.35)}>−</button><button title="Fit" onClick={() => fit()}><Icon k="fit" /></button><button title="Zoom in" onClick={() => zoom(1.35)}>+</button></div>;
  const setTool = (tool: typeof V.tool) => { setDraft(null); app.setView({ tool }); };

  return (
    <>
      <div className="page-head">
        <div><h1>Floor plan{edit ? ' · edit layout' : ''}</h1><p>{edit ? 'Upload the yard drawing, set its scale, then draw each hall or area and the footprints inside it. Every footprint holds one item at a time.' : 'Your yard drawing with each footprint and what sits in it on the chosen date. Drag a block onto another footprint to move it; slide the date to see what is coming.'}</p></div>
        <div className="tb">
          {edit ? (
            <>
              <div className="seg">{([['select', 'cursor', 'Select'], ['fp', 'rect', 'Footprint'], ['area', 'floor', 'Area outline'], ['scale', 'ruler', 'Set scale']] as const).map(([t, i, l]) => <button key={t} aria-pressed={V.tool === t} onClick={() => setTool(t)}><Icon k={i} /> {l}</button>)}</div>
              {V.tool === 'fp' || V.tool === 'area' ? <div className="seg"><button aria-pressed={V.toolShape === 'rect'} title="Drag a box" onClick={() => { setDraft(null); app.setView({ toolShape: 'rect' }); }}>Rectangle</button><button aria-pressed={V.toolShape === 'poly'} title="Click each corner, then click the first corner or press Enter" onClick={() => { setDraft(null); app.setView({ toolShape: 'poly' }); }}>Any shape</button></div> : null}
              {V.tool === 'fp' ? <select className="ctl" value={P.area(V.drawArea) ? V.drawArea : P.areasSorted()[0]?.id || ''} onChange={e => app.setView({ drawArea: e.target.value })} title="Area for new footprints drawn outside every area outline">{P.areasSorted().map(x => <option key={x.id} value={x.id}>Into: {x.name}</option>)}</select> : null}
              <button className="btn sm" onClick={() => fpBySizeDialog(svgRef.current, toWorld)} title="Type the length, width and angle"><Icon k="ruler" />Footprint by size…</button>
              <span className="sep" />
              <button className="btn sm" onClick={() => fileRef.current?.click()}><Icon k="image" />{D.src ? 'Replace drawing…' : 'Upload drawing…'}</button>
              <button className="btn sm primary" onClick={() => { setDraft(null); app.setEdit(false); }}>Done editing</button>
            </>
          ) : (
            <>
              <select className="ctl" value={V.focus} title="Zoom to an area" onChange={e => app.setView({ focus: e.target.value })}><option value="all">Whole yard</option>{P.areasSorted().map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              <select className="ctl" value={V.colour} title="Colour items by" onChange={e => app.setView({ colour: e.target.value as typeof V.colour })}><option value="proj">Colour: project</option><option value="type">Colour: type</option></select>
              <select className="ctl" value={V.label} title="Labels" onChange={e => app.setView({ label: e.target.value as typeof V.label })}><option value="stage">Label: code + stage today</option><option value="code">Label: code</option><option value="name">Label: code + name</option><option value="none">No labels</option></select>
              <label className="chk" title={`Free footprints show what arrives in the next ${S.set.look} days`}><input type="checkbox" checked={V.ghost} onChange={e => app.setView({ ghost: e.target.checked })} /> Coming in {S.set.look} days</label>
              <span className="sep" />
              <button className="btn sm" title="Upload the yard drawing, set its scale and draw areas and footprints" onClick={() => app.setEdit(true)}><Icon k="edit" />Edit layout</button>
              <button className="btn sm primary" onClick={() => newItem()}><Icon k="plus" />Add item</button>
            </>
          )}
          <input type="file" ref={fileRef} accept="image/*,.pdf,.svg" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadDrawing(f); }} />
        </div>
      </div>
      <div className="floor-wrap">
        <div className="panel floor-card">
          {edit ? (
            <div className="datebar edit-hint"><span className="small"><Icon k={V.tool === 'scale' ? 'ruler' : V.tool === 'select' ? 'cursor' : 'pen'} /> {hint}</span><span className="grow" />{zoomBtns}</div>
          ) : (
            <div className="datebar">
              <div className="big">{fd(V.date)}<small>{fdl(V.date).split(' ')[0].toUpperCase()} · WEEK {weekNo(V.date)}{V.date === TODAY ? ' · TODAY' : ''}</small></div>
              <div className="seg"><button title="Back a week (Shift+←)" onClick={() => setDate(V.date - 7)}>‹‹</button><button title="Back a day (←)" onClick={() => setDate(V.date - 1)}>‹</button><button onClick={() => setDate(TODAY)}>Today</button><button title="On a day (→)" onClick={() => setDate(V.date + 1)}>›</button><button title="On a week (Shift+→)" onClick={() => setDate(V.date + 7)}>››</button></div>
              <button className="btn sm" title="Step through the weeks" onClick={() => setPlay(!play)}><Icon k={play ? 'pause' : 'play'} />{play ? 'Pause' : 'Play'}</button>
              <Scrub onDate={setDate} />
              {zoomBtns}
            </div>
          )}
          <svg id="floorSvg" ref={svgRef} aria-label="Yard floor plan" style={{ height: F?.h || 420 }}
            onPointerDown={edit ? editDown : floorDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => !drag.current && tip(null)}
            onDoubleClick={e => { if (edit && draftRef.current?.kind === 'poly') { e.preventDefault(); finishPoly(); } }}>
            <defs><pattern id="paperGrid" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="#ffffff" /><path d="M100 0H0V100" fill="none" stroke="#e4e0e7" strokeWidth="1" /></pattern></defs>
            <g id="flView" transform={viewTx()}>
              <rect width={D.w} height={D.h} fill={D.src ? '#ffffff' : 'url(#paperGrid)'} />
              {D.src ? <image href={D.src} width={D.w} height={D.h} opacity={D.op} preserveAspectRatio="none" /> : null}
              <g dangerouslySetInnerHTML={{ __html: body }} />
              <g dangerouslySetInnerHTML={{ __html: tmp + draftSvg }} />
            </g>
            <g>{scaleBar}</g>
          </svg>
          {edit ? null : <div className="fl-hint">Drag a block onto a footprint to put it there · click a free footprint to fill it · R turns the selected block · ← → change the date · wheel zooms, drag to pan</div>}
        </div>
        <div className="side-list">{edit ? <EditSide onUpload={() => fileRef.current?.click()} /> : <ViewSide onDrag={startItemDrag} />}</div>
      </div>
    </>
  );
}

export function delSelection(esel: { kind: 'fp' | 'area'; id: string } | null) {
  if (!esel) return;
  const P = app.P;
  if (esel.kind === 'fp') {
    const f = P.fpOf(esel.id)!, n = P.S.items.filter(i => i.fp === f.id).length;
    app.commit(d => removeFootprint(d, f.id), `${f.code} deleted${n ? ` – ${n} item${n > 1 ? 's' : ''} now need a footprint` : ''}`);
    app.setEsel(null); return;
  }
  const ar = P.area(esel.id)!, nf = P.fpsIn(ar.id).length;
  confirmBox('Delete area', `Delete ${ar.name}${nf ? ` and its ${nf} footprints` : ''}? Its items stay in the plan with no area.`, 'Delete', () => {
    app.commit(d => {
      d.areas = d.areas.filter(x => x.id !== ar.id);
      const gone = new Set(d.footprints.filter(f => f.area === ar.id).map(f => f.id));
      d.footprints = d.footprints.filter(f => !gone.has(f.id));
      d.items.forEach(i => { if (i.area === ar.id) { i.area = ''; i.fp = ''; } });
    }, 'Area deleted');
    app.setEsel(null);
  }, true);
}

function editOverlay(o: Area | Footprint | null, kind: 'fp' | 'area' | undefined, k: number) {
  if (!o || !o.pts.length) return '';
  let h = '';
  o.pts.forEach((p, i) => { const q = o.pts[(i + 1) % o.pts.length]; h += `<circle data-mid="${i}" cx="${(p[0] + q[0]) / 2}" cy="${(p[1] + q[1]) / 2}" r="${3.5 * k}" fill="var(--surface)" stroke="var(--accent)" stroke-width="${1.2 * k}" style="cursor:copy"><title>Drag to add a corner</title></circle>`; });
  if (kind === 'fp') {
    const F = frameOf(o.pts)!, off = F.W / 2 + 26 * k, hx = F.cx + Math.sin(F.a) * off, hy = F.cy - Math.cos(F.a) * off, ex = F.cx + (Math.sin(F.a) * F.W) / 2, ey = F.cy - (Math.cos(F.a) * F.W) / 2;
    h += `<line x1="${ex}" y1="${ey}" x2="${hx}" y2="${hy}" stroke="var(--accent)" stroke-width="${1.4 * k}" pointer-events="none"/><circle data-rot="1" cx="${hx}" cy="${hy}" r="${6.5 * k}" fill="var(--surface)" stroke="var(--accent)" stroke-width="${2 * k}" style="cursor:grab"><title>Drag to turn it (snaps to 5°, hold Shift for free)</title></circle><path d="M${hx - 3 * k} ${hy - 1 * k}a${3 * k} ${3 * k} 0 1 1 ${1 * k} ${3 * k}" fill="none" stroke="var(--accent)" stroke-width="${1.2 * k}" pointer-events="none"/>`;
  }
  o.pts.forEach((p, i) => (h += `<rect data-v="${i}" x="${p[0] - HANDLE * k}" y="${p[1] - HANDLE * k}" width="${2 * HANDLE * k}" height="${2 * HANDLE * k}" fill="var(--accent)" stroke="var(--surface)" stroke-width="${1.5 * k}" style="cursor:move"><title>Drag to move this corner · double-click to remove it</title></rect>`));
  return h;
}
function draftMarkup(D: Draft, k: number, mpu: number | null) {
  const st = `fill="var(--accent)" fill-opacity=".12" stroke="var(--accent)" stroke-width="${2 * k}"`;
  if (D.kind === 'rect') {
    const b = D.b; if (!b) return '';
    const lab = mpu ? `<text x="${b.x + b.w / 2}" y="${b.y - 6 * k}" text-anchor="middle" style="font:600 ${12 * k}px var(--f-mono)" fill="var(--accent)" paint-order="stroke" stroke="var(--surface)" stroke-width="${3 * k}">${r1(b.w * mpu)} × ${r1(b.h * mpu)} m</text>` : '';
    return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" ${st}/>` + lab;
  }
  if (D.kind === 'poly') {
    const pts = D.mouse ? [...D.pts, D.mouse] : D.pts;
    return pts.length ? `<path d="M${pts.map(p => p.join(' ')).join('L')}" ${st} fill-opacity=".08"/>` + D.pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${(i ? 3 : 5) * k}" fill="var(--accent)"/>`).join('') : '';
  }
  const pts = D.mouse && D.pts.length < 2 ? [...D.pts, D.mouse] : D.pts;
  return pts.length ? `<path d="M${pts.map(p => p.join(' ')).join('L')}" stroke="var(--late)" stroke-width="${2.5 * k}" fill="none"/>` + pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="${5 * k}" fill="var(--late)"/>`).join('') : '';
}

function scaleDialog(pts: Pt[], done: () => void) {
  const u = dist(pts[0], pts[1]), m = app.P.mpu();
  app.openModal(close => <ScaleDlg u={u} init={m ? String(r1(u * m)) : ''} close={() => { close(); done(); }} />);
}
function ScaleDlg({ u, init, close }: { u: number; init: string; close: () => void }) {
  const [v, setV] = useState(init);
  const ok = () => { const m = n0(v); if (m <= 0) return; close(); app.commit(d => { d.drawing.mpu = m / u; }, `Scale set: ${r1(m)} m = ${Math.round(u)} units`); app.setView({ tool: 'select' }); };
  return (
    <Modal title="Set the scale" sub={`The line you clicked is ${Math.round(u)} drawing units long.`} onClose={close} footer={<><span className="grow" /><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={ok}>Set scale</button></>}>
      <div className="field"><label htmlFor="scM">Real distance in metres</label><input id="scM" type="number" min={0.1} step={0.1} value={v} placeholder="e.g. 90" onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ok(); }} /><span className="hint">Every footprint and block size is measured from this.</span></div>
    </Modal>
  );
}

function fpBySizeDialog(svg: SVGSVGElement | null, toWorld: (e: { clientX: number; clientY: number }) => Pt) {
  const P = app.P, m = P.mpu();
  if (!m) { app.toast('Set the drawing scale first, so sizes in metres mean something', { act: { label: 'Set scale', fn: () => app.setView({ tool: 'scale' }) } }); return; }
  const a0 = P.area(app.V.drawArea) || P.areasSorted()[0];
  if (!a0) { app.toast('Add an area first'); return; }
  app.openModal(close => <FpBySize close={close} a0={a0.id} m={m} centre={() => { const r = svg!.getBoundingClientRect(); return toWorld({ clientX: r.left + svg!.clientWidth / 2, clientY: r.top + svg!.clientHeight / 2 }); }} />);
}
function FpBySize({ close, a0, m, centre }: { close: () => void; a0: string; m: number; centre: () => Pt }) {
  const P = app.P;
  const [f, setF] = useState({ area: a0, kind: 'Build', n: '1', L: '15', W: '12', ang: '0' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const ok = () => {
    const ar = P.area(f.area)!, L = n0(f.L) / m, W = n0(f.W) / m, ang = (n0(f.ang) * Math.PI) / 180, n = clamp(Math.round(n0(f.n)), 1, 30);
    if (!(L > 0 && W > 0)) return;
    const c = ar.pts.length > 2 ? labelPt(ar.pts) : centre(), step = L + 1 / m, made: Footprint[] = [];
    for (let i = 0; i < n; i++) { const off = (i - (n - 1) / 2) * step; made.push({ id: uid('f'), code: '', area: ar.id, kind: f.kind, note: '', pts: rotRect(c[0] + Math.cos(ang) * off, c[1] + Math.sin(ang) * off, L, W, ang) }); }
    close();
    app.commit(d => { made.forEach(fp => { const pre = (ar.code || 'FP') + '-'; let k = 1; const have = new Set(d.footprints.map(x => x.code)); while (have.has(pre + String(k).padStart(2, '0'))) k++; fp.code = pre + String(k).padStart(2, '0'); d.footprints.push(fp); }); }, `${n} footprint${n > 1 ? 's' : ''} added to ${ar.name} – drag into place`);
    app.setEsel({ kind: 'fp', id: made[made.length - 1].id }); app.setView({ tool: 'select' });
  };
  return (
    <Modal title="Footprint by size" sub="Placed in the middle of the area (or of the view); drag it into place afterwards." onClose={close} footer={<><span className="grow" /><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={ok}>Add</button></>}>
      <div className="fgrid3">
        <div className="field"><label htmlFor="fsA">Area</label><select id="fsA" value={f.area} onChange={set('area')}>{P.areasSorted().map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="field"><label htmlFor="fsK">Kind</label><select id="fsK" value={f.kind} onChange={set('kind')}><option>Build</option><option>Laydown</option></select></div>
        <div className="field"><label htmlFor="fsN">How many</label><input id="fsN" type="number" min={1} max={30} value={f.n} onChange={set('n')} /><span className="hint">Side by side, 1 m apart</span></div>
        <div className="field"><label htmlFor="fsL">Length m</label><input id="fsL" type="number" min={0.5} step={0.5} value={f.L} onChange={set('L')} /></div>
        <div className="field"><label htmlFor="fsW">Width m</label><input id="fsW" type="number" min={0.5} step={0.5} value={f.W} onChange={set('W')} /></div>
        <div className="field"><label htmlFor="fsG">Angle °</label><input id="fsG" type="number" step={5} value={f.ang} onChange={set('ang')} /></div>
      </div>
    </Modal>
  );
}

/* ---------- the date scrubber: footprints needed each week ---------- */
function Scrub({ onDate }: { onDate: (d: number) => void }) {
  const a = useApp(); const P = a.P, V = a.V, R = P.R;
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(400);
  useLayoutEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth || 400)); ro.observe(el); return () => ro.disconnect(); }, []);
  const H = 46, span = R.d1 - R.d0 + 1, x = (d: number) => ((d - R.d0) / span) * W;
  const ids = V.focus === 'all' ? P.S.areas.map(x => x.id) : [V.focus];
  const bars: React.ReactNode[] = [];
  for (let wk = monday(R.d0); wk <= R.d1; wk += 7) {
    let n = 0, cap = 0, over = false;
    ids.forEach(id => { const o = P.occWeek(id, wk); n += o.n; cap += o.cap; if (o.n > o.cap) over = true; });
    const bh = cap ? Math.min(1.15, n / cap) * 28 : n ? 28 : 0;
    bars.push(<rect key={wk} x={x(wk) + 0.5} y={32 - bh} width={Math.max(1, x(wk + 7) - x(wk) - 1)} height={bh} fill={over ? '#b8321f' : heatCol(n, cap)} />);
  }
  const months: React.ReactNode[] = [];
  let dd = new Date(R.d0 * DAY); dd = new Date(Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 1));
  const every = span > 900 ? 3 : 1;
  while (+dd / DAY <= R.d1) {
    const n = +dd / DAY;
    if (dd.getUTCMonth() % every === 0) months.push(<g key={n}><line x1={x(n)} y1={30} x2={x(n)} y2={36} stroke="var(--muted)" /><text x={x(n) + 2} y={45} style={{ font: '500 9.5px var(--f-mono)', fill: 'var(--muted)' }}>{MON[dd.getUTCMonth()]}{dd.getUTCMonth() === 0 ? ' ' + String(dd.getUTCFullYear()).slice(2) : ''}</text></g>);
    dd = new Date(Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 1));
  }
  const set = (ev: { clientX: number }) => { const r = ref.current!.getBoundingClientRect(); onDate(R.d0 + ((ev.clientX - r.left) / r.width) * span); };
  return (
    <div className="scrub" ref={ref} title="Drag to change the date. Bars show the footprints needed each week against those available"
      onPointerDown={e => { ref.current!.setPointerCapture(e.pointerId); set(e); }} onPointerMove={e => { if (e.buttons & 1) set(e); }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">{bars}<line x1={0} y1={32.5} x2={W} y2={32.5} stroke="var(--line)" />{months}<rect x={x(TODAY)} y={0} width={1.5} height={32} fill="var(--fg-2)" opacity={0.5} /></svg>
      <div className="knob" style={{ left: ((V.date - R.d0) / span) * 100 + '%' }} />
    </div>
  );
}

/* ---------- side panel in view mode ---------- */
function ViewSide({ onDrag }: { onDrag: (e: { clientX: number; clientY: number }, it: Item) => void }) {
  const a = useApp(); const P = a.P, V = a.V, d = V.date, look = P.S.set.look || 14;
  const focus = (area: string) => app.setView({ focus: area });
  const waiting = P.S.items.filter(it => P.shown(it) && onDay(it, d) && !P.placed(it));
  const coming = P.S.items.filter(it => P.shown(it) && !P.placed(it) && it.start && s0(it) > d && s0(it) <= d + look);
  const issues: { id?: string; a?: string; t: string }[] = [];
  P.pairs.filter(p => p.from <= d && d <= p.to).forEach(p => issues.push({ id: p.a, t: `${P.item(p.a)!.code} and ${P.item(p.b)!.code} are both in ${P.fpOf(p.fp)!.code}` }));
  P.S.areas.forEach(x => { const o = P.occAt(x.id, d); if (o.n > o.cap) issues.push({ a: x.id, t: `${x.name} needs ${o.n} footprints but has ${o.cap}` }); });
  P.S.items.filter(it => P.shown(it) && onDay(it, d)).forEach(it => P.probs(it.id).filter(p => p.k === 'heavy' || p.k === 'size').forEach(p => issues.push({ id: it.id, t: `${it.code}: ${p.t}` })));
  const leg = V.colour === 'type' ? P.S.types : P.shownProjects();
  const ulist = (L: Item[]) => L.map(it => (
    <div key={it.id} className="uitem" style={{ ['--c' as string]: P.colourOf(it, V.colour) }} title="Drag onto a footprint" onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); onDrag(e, it); }}>
      <i /><span className="ell"><b>{it.code}</b> {it.name}<br /><span className="xs muted">{P.area(it.area)?.name || 'No area'} · {fd(s0(it))}–{fd(s1(it))}</span></span>
    </div>
  ));
  return (
    <>
      {!P.S.footprints.length ? <div className="panel"><div className="panel-h"><div><h2>Start here</h2><p>Upload your yard drawing, set its scale and draw the footprints you plan with.</p></div></div><div className="row" style={{ padding: '12px 14px' }}><button className="btn primary sm" onClick={() => { app.setEdit(true); app.setView({ tool: P.S.drawing.src && P.S.drawing.id !== 'dex' ? 'fp' : 'select' }); }}><Icon k="edit" />Edit layout</button></div></div> : null}
      <div className="panel"><div className="panel-h"><h2>On {fd(d)}</h2><span className="xs muted">needed / footprints</span></div><div className="occ-list">
        {P.areasSorted().map(x => { const o = P.occAt(x.id, d), c = ratioCol(o.n, o.cap); return (
          <div key={x.id} className="occ-row" title={`Zoom to ${x.name}`} onClick={() => focus(x.id)}>
            <span className="ell">{x.name}</span><b className="num" style={{ color: c }}>{o.n} / {o.cap}</b>
            <div className="bar"><i style={{ width: `${o.cap ? Math.min(100, (o.n / o.cap) * 100) : o.n ? 100 : 0}%`, ['--c' as string]: c }} /></div>
            <span className="xs muted">{o.cap} footprint{o.cap === 1 ? '' : 's'}{o.n > o.cap ? <> · <b style={{ color: 'var(--late)' }}>{o.n - o.cap} short</b></> : ` · ${o.cap - o.n} free`}{o.unp ? ` · ${o.unp} not in a footprint` : ''}</span>
          </div>); })}
        {!P.S.areas.length ? <span className="muted small">No areas yet.</span> : null}
      </div></div>
      {issues.length ? <div className="panel"><div className="panel-h"><h2 style={{ color: 'var(--late)' }}>{issues.length} to sort</h2></div><div className="flags">{issues.map((x, i) => (
        <button key={i} onClick={() => { if (x.id) { const it = P.item(x.id)!; focus(it.area || 'all'); app.openItem(it.id); } else focus(x.a!); }}><Icon k="warn" /><span>{x.t}</span></button>
      ))}</div></div> : null}
      <div className="panel"><div className="panel-h"><div><h2>Not in a footprint</h2><p>Needed on this date but not given a footprint. Drag onto one.</p></div></div>
        {waiting.length ? <div className="ulist">{ulist(waiting)}</div> : <div className="small muted" style={{ padding: '10px 14px' }}>Everything on site has a footprint.</div>}
        {coming.length ? <><div className="lbl" style={{ padding: '4px 14px 0' }}>Arriving in the next {look} days</div><div className="ulist">{ulist(coming)}</div></> : null}
      </div>
      <div className="panel"><div className="legend">{leg.map(x => <span key={x.id} style={{ ['--c' as string]: x.color }}><i />{x.name}</span>)}<span><i style={{ background: 'none', border: '1.5px dashed var(--fg-2)' }} />Free footprint</span><span><i style={{ background: 'none', border: '2px solid var(--late)' }} />Double-booked</span><span><i style={{ background: 'none', border: '2px solid var(--risk)' }} />Too heavy or too big</span></div></div>
    </>
  );
}

/* ---------- side panel while editing the layout ---------- */
function EditSide({ onUpload }: { onUpload: () => void }) {
  const a = useApp(); const P = a.P, D = P.S.drawing, esel = a.esel, m = P.mpu();
  const o = esel ? (esel.kind === 'fp' ? P.fpOf(esel.id) : P.area(esel.id)) : undefined;
  useEffect(() => { if (esel && !o) app.setEsel(null); }, [esel, o]);
  const fpEdit = (fn: (f: Footprint) => void) => app.commit(d => fn(d.footprints.find(x => x.id === o!.id)!));
  const arEdit = (fn: (x: Area) => void) => app.commit(d => fn(d.areas.find(x => x.id === o!.id)!));
  let sel = null;
  if (o && esel?.kind === 'fp') {
    const f = o as Footprint, F = frameOf(f.pts), users = P.S.items.filter(i => i.fp === f.id);
    sel = (
      <div className="panel" key={f.id}><div className="panel-h"><h2>Footprint {f.code}</h2></div><div className="fgrid" style={{ padding: '12px 14px' }}>
        <div className="field"><label htmlFor="eCode">Code</label><In id="eCode" value={f.code} onCommit={v => fpEdit(x => { x.code = v.trim() || x.code; })} /></div>
        <div className="field"><label htmlFor="eKind">Kind</label><select id="eKind" value={f.kind} onChange={e => fpEdit(x => { x.kind = e.target.value; })}><option>Build</option><option>Laydown</option></select></div>
        <div className="field span2"><label htmlFor="eArea">Area</label><select id="eArea" value={f.area} onChange={e => app.commit(d => { const x = d.footprints.find(z => z.id === f.id)!; x.area = e.target.value; d.items.forEach(i => { if (i.fp === f.id) i.area = x.area; }); })}>{P.areasSorted().map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="field span2"><label htmlFor="eNote">Note</label><In id="eNote" value={f.note} placeholder="e.g. stand 4, needs supports" onCommit={v => fpEdit(x => { x.note = v; })} /></div>
        <div className="span2 fgrid3" style={{ gap: 8 }}>
          <div className="field"><label htmlFor="eL">Length m</label><In id="eL" type="number" step={0.1} min={0.1} value={m && F ? r1(F.L * m) : ''} disabled={!m} placeholder={m ? '' : 'set scale'} onCommit={v => { const n = n0(v); if (n > 0) sizeFp(f.id, n, null, null); }} /></div>
          <div className="field"><label htmlFor="eW">Width m</label><In id="eW" type="number" step={0.1} min={0.1} value={m && F ? r1(F.W * m) : ''} disabled={!m} placeholder={m ? '' : 'set scale'} onCommit={v => { const n = n0(v); if (n > 0) sizeFp(f.id, null, n, null); }} /></div>
          <div className="field"><label htmlFor="eAng">Angle °</label><In id="eAng" type="number" step={1} value={F ? ptsDeg(f.pts) : 0} onCommit={v => setFpAngle(f.id, n0(v))} /></div>
        </div>
        <div className="row span2" style={{ gap: 6 }}>
          <button className="btn sm" title="Turn 15° anticlockwise ( [ )" onClick={() => turnFp(f.id, -15)}>⟲ 15°</button><button className="btn sm" title="Turn 15° clockwise ( ] )" onClick={() => turnFp(f.id, 15)}>⟳ 15°</button><button className="btn sm" onClick={() => turnFp(f.id, 90)}>90°</button>
          {isRect(f.pts) ? null : <span className="hint">Typing a length or width makes it a rectangle.</span>}
        </div>
        <div className="small muted span2">{P.fmtSize(f)} · {f.pts.length} corners · {users.length} item{users.length === 1 ? '' : 's'} planned here</div>
        <div className="row span2" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => { const F2 = frameOf(f.pts)!, gap = 1 / (m || DEF_MPU), dx = Math.cos(F2.a) * (F2.L + gap), dy = Math.sin(F2.a) * (F2.L + gap); const n: Footprint = { id: uid('f'), code: P.nextFpCode(P.area(f.area)), area: f.area, kind: f.kind, note: '', pts: movePts(f.pts, dx, dy) }; app.commit(d => { d.footprints.push(n); }, `${n.code} added next to ${f.code}`); app.setEsel({ kind: 'fp', id: n.id }); }}><Icon k="copy" />Copy alongside</button>
          {f.pts.length === 4 ? null : <button className="btn sm" onClick={() => squareFp(f.id)}>Make it a rectangle</button>}
          <button className="btn sm danger" onClick={() => delSelection(esel)}><Icon k="trash" />Delete</button>
        </div>
      </div></div>
    );
  } else if (o && esel?.kind === 'area') {
    const ar = o as Area;
    sel = (
      <div className="panel" key={ar.id}><div className="panel-h"><h2>{ar.name}</h2></div><div className="fgrid" style={{ padding: '12px 14px' }}>
        <div className="field"><label htmlFor="eCode">Code</label><In id="eCode" value={ar.code} onCommit={v => arEdit(x => { x.code = v.trim() || x.code; })} /></div>
        <div className="field"><label htmlFor="eKind">Kind</label><select id="eKind" value={ar.kind} onChange={e => arEdit(x => { x.kind = e.target.value; })}>{['Shed', 'Hall', 'Outdoor', 'Quay', 'Store', 'Other'].map(k => <option key={k}>{k}</option>)}</select></div>
        <div className="field span2"><label htmlFor="eName">Name</label><In id="eName" value={ar.name} onCommit={v => arEdit(x => { x.name = v.trim() || x.name; })} /></div>
        <div className="field"><label htmlFor="eCrane">Crane t</label><In id="eCrane" type="number" min={0} value={ar.crane || 0} onCommit={v => arEdit(x => { x.crane = n0(v); })} /><span className="hint">0 = not checked</span></div>
        <div className="field"><label htmlFor="eCol">Colour</label><In id="eCol" type="color" value={ar.color} onCommit={v => arEdit(x => { x.color = v; })} /></div>
        <div className="small muted span2">{P.fpsIn(ar.id).length} footprints = capacity of {P.fpsIn(ar.id).length}</div>
        <div className="row span2" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => app.setView({ tool: 'fp', drawArea: ar.id })}><Icon k="rect" />Draw footprints in it</button>
          <button className="btn sm danger" onClick={() => delSelection(esel)}><Icon k="trash" />Delete</button>
        </div>
      </div></div>
    );
  }
  return (
    <>
      {sel}
      <div className="panel"><div className="panel-h"><div><h2>Yard drawing</h2><p>{D.src ? `${D.name || 'Drawing'} · ${D.w} × ${D.h}` : 'No drawing yet – a grid is shown'}</p></div></div>
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row"><button className="btn sm" onClick={onUpload}><Icon k="image" />{D.src ? 'Replace…' : 'Upload…'}</button>{D.src ? <button className="btn sm ghost" onClick={() => confirmBox('Remove the drawing', 'Remove the yard drawing? Areas and footprints stay where they are on a plain grid.', 'Remove', () => app.commit(d => { d.drawing.src = null; d.drawing.id = uid('d'); }, 'Drawing removed'))}>Remove</button> : null}</div>
          {D.src ? <div className="field"><label htmlFor="eOp">Drawing strength</label><input id="eOp" type="range" min={0.15} max={1} step={0.05} defaultValue={D.op} onInput={e => document.querySelector('#flView image')?.setAttribute('opacity', (e.target as HTMLInputElement).value)} onChange={e => app.commit(d => { d.drawing.op = +e.target.value; })} /></div> : null}
          <div className="row small"><span className={D.mpu ? '' : 'chip warn'}>{D.mpu ? `Scale: 1 m = ${r1(1 / D.mpu)} units` : 'No scale set'}</span><button className="btn sm" onClick={() => app.setView({ tool: 'scale' })}><Icon k="ruler" />Set scale</button></div>
          <span className="hint">PNG, JPG, SVG or PDF (first page). From AutoCAD, plot to PDF first.</span>
        </div>
      </div>
      <div className="panel"><div className="panel-h"><h2>Areas</h2><button className="btn sm" onClick={() => app.setView({ tool: 'area' })}><Icon k="plus" />Draw area</button></div><div className="occ-list">
        {P.areasSorted().map(x => <div key={x.id} className="occ-row" onClick={() => { app.setEsel({ kind: 'area', id: x.id }); app.setView({ tool: 'select' }); }}><span className="ell"><span className="sw" style={{ ['--c' as string]: x.color }} /> {x.name}</span><b className="num">{P.fpsIn(x.id).length}</b><span className="xs muted">{x.pts.length ? 'outline drawn' : 'no outline yet'} · footprints</span></div>)}
        {!P.S.areas.length ? <span className="small muted">None yet.</span> : null}
      </div></div>
    </>
  );
}
