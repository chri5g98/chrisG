/* Plan: each item's time in its area as a bar, with the stages planned while it is there.
   Drag bars to move or stretch them, drag into another group to move area or footprint, drag the ● to link items. */
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { app, itemIn, useApp } from '../store/app';
import type { Item, ViewState } from '../core/types';
import { buildRows, filterChipList, groupKeys, itemMatch, ONLY, RH, SH, HH, type Row } from '../core/rows';
import { heatCol, s0, s1 } from '../core/plan';
import { fillStages } from '../core/example';
import { clamp, DAY, dn, dow, ds, esc, fd, MON, monday, TODAY, trimTo, weekNo } from '../core/util';
import { Icon } from '../ui/Icon';
import { tip } from '../ui/Overlays';
import { addStage, itemTip, newItem } from '../ui/actions';
import { setPageKeys } from '../ui/keys';

const ZP: Record<string, number> = { days: 26, weeks: 7, months: 2.2 };

export function FilterChips() {
  const a = useApp(), c = filterChipList(a.P, a.V.f);
  if (!c.length) return null;
  const all = a.P.S.items.filter(a.P.shown).length;
  return (
    <div className="chips">
      {c.map(([k, l]) => <span key={k} className="fchip">{l}<button aria-label="Remove" onClick={() => { const f = { ...app.V.f }; delete f[k]; app.setView({ f }); }}>×</button></span>)}
      <span className="small muted">Showing <CountMatches /> of {all}</span>
    </div>
  );
}
const CountMatches = () => { const a = useApp(); return <>{a.P.S.items.filter(it => itemMatch(a.P, a.V.f, it)).length}</>; };

export function filterPop(btn: HTMLElement) {
  const r = btn.getBoundingClientRect();
  app.openPopover(r.left, r.bottom + 6, close => <FilterForm close={close} />);
}
function FilterForm({ close }: { close: () => void }) {
  const P = app.P, f0 = app.V.f;
  const [f, setF] = useState(f0);
  const apply = () => { app.setView({ f: { q: f.q?.trim() || undefined, type: f.type || undefined, area: f.area || undefined, only: f.only || undefined } }); close(); };
  return (
    <div onKeyDown={e => { if (e.key === 'Enter') apply(); }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="field"><label htmlFor="fq">Search</label><input id="fq" autoFocus value={f.q || ''} placeholder="Code or name" onChange={e => setF({ ...f, q: e.target.value })} /></div>
      <div className="field"><label htmlFor="ft">Type</label><select id="ft" value={f.type || ''} onChange={e => setF({ ...f, type: e.target.value })}><option value="">Any</option>{P.S.types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      <div className="field"><label htmlFor="fa">Area</label><select id="fa" value={f.area || ''} onChange={e => setF({ ...f, area: e.target.value })}><option value="">Any</option>{P.areasSorted().map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      <div className="field"><label htmlFor="fo">Show only</label><select id="fo" value={f.only || ''} onChange={e => setF({ ...f, only: (e.target.value || undefined) as ViewState['f']['only'] })}><option value="">Everything</option>{Object.entries(ONLY).map(([k, l]) => <option key={k} value={k}>{l.replace('Only ', '')}</option>)}</select></div>
      <div className="row"><button className="btn sm" onClick={() => { app.setView({ f: {} }); close(); }}>Clear</button><span className="grow" /><button className="btn sm primary" onClick={apply}>Apply</button></div>
    </div>
  );
}

function stagePop(it: Item, btn: HTMLElement) {
  const r = btn.getBoundingClientRect(), t = app.P.typ(it.type);
  const open = () => app.setView({ shut: app.V.shut.filter(x => x !== it.id), stages: true });
  app.openPopover(r.right + 6, r.top, close => (
    <>
      <div><b>Add a stage to {it.code}</b></div>
      <div className="ulist" style={{ padding: 0 }}>{app.P.S.stypes.map(x => <button key={x.id} className="uitem" style={{ ['--c' as string]: x.color }} onClick={() => { close(); open(); addStage(it.id, x.id); }}><i /><span>{x.name}</span></button>)}</div>
      {t.std.length && it.start ? <button className="btn sm" onClick={() => { close(); open(); app.commit(d => { fillStages(itemIn(d, it.id), d); }, `Standard stages added to ${it.code}`); }}>Use the standard {t.name.toLowerCase()} stages</button> : null}
    </>
  ));
}

export function PlanGantt() {
  const a = useApp(); const P = a.P, V = a.V;
  const right = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gv = useRef<{ ppd: number; off: number; z: string } | null>(null);
  const drag = useRef<Record<string, any> | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [W, setW] = useState(900);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [gw, setGw] = useState(V.gw);
  useLayoutEffect(() => { const el = right.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth || 900)); ro.observe(el); return () => ro.disconnect(); }, []);
  setPageKeys(null);

  if (!gv.current || (V.gz !== 'custom' && gv.current.z !== V.gz)) {
    gv.current = V.gz === 'fit' ? { z: 'fit', ppd: W / (P.R.d1 - P.R.d0 + 1), off: P.R.d0 } : { z: V.gz, ppd: ZP[V.gz] || 7, off: TODAY - Math.round((W / (ZP[V.gz] || 7)) * 0.2) };
  }
  const G = gv.current, x = (d: number) => (d - G.off) * G.ppd;
  const { rows, H } = buildRows(P, V);
  const tgt: string | null = drag.current?.tgt || null;

  useEffect(() => {
    const el = right.current; if (!el) return;
    const w = (e: WheelEvent) => {
      const g = gv.current!;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); const r = el.getBoundingClientRect(), day = g.off + (e.clientX - r.left) / g.ppd;
        g.ppd = clamp(g.ppd * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 0.25, 60); g.off = day - (e.clientX - r.left) / g.ppd; g.z = 'custom';
        if (app.V.gz !== 'custom') app.setView({ gz: 'custom' }); else force();
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); g.off += (e.deltaX || e.deltaY) / g.ppd; force(); }
    };
    el.addEventListener('wheel', w, { passive: false });
    return () => el.removeEventListener('wheel', w);
  }, []);

  /* ---------- the bars ---------- */
  const d0 = Math.floor(G.off), d1 = Math.ceil(G.off + W / G.ppd);
  let h = '';
  if (G.ppd >= 12) for (let d = d0; d <= d1; d++) if (dow(d) >= 5) h += `<rect x="${x(d)}" y="0" width="${G.ppd}" height="${H}" fill="var(--sunk)" opacity=".7" pointer-events="none"/>`;
  gridLines(d0, d1, G.ppd, x).forEach(gx => (h += `<line x1="${gx}" y1="0" x2="${gx}" y2="${H}" stroke="var(--line-soft)" pointer-events="none"/>`));
  rows.forEach(r => {
    const y = r.y;
    if (r.grp) {
      h += `<rect x="0" y="${y}" width="${W}" height="${RH}" fill="${tgt === r.key ? 'var(--accent-soft)' : 'var(--sunk)'}" data-gk="${r.key}"/>`;
      if (r.area) {
        const step = G.ppd >= 12 ? 1 : 7, st = step === 7 ? monday(d0) : d0;
        for (let d = st; d <= d1; d += step) {
          const o = step === 7 ? P.occWeek(r.area.id, d) : P.occAt(r.area.id, d); if (!o.n) continue;
          const bw = Math.max(1, step * G.ppd - (step === 7 ? 1 : 0));
          h += `<rect x="${x(d)}" y="${y + 7}" width="${bw}" height="${RH - 14}" fill="${heatCol(o.n, o.cap)}" rx="2" pointer-events="none"/>`;
          if (bw >= 26) h += `<text x="${x(d) + bw / 2}" y="${y + RH / 2 + 4}" text-anchor="middle" style="font:600 10.5px var(--f-mono);fill:${o.n / (o.cap || 1) > 0.45 ? '#fff' : 'var(--fg)'};pointer-events:none">${o.n}/${o.cap}</text>`;
        }
        h += `<rect x="0" y="${y}" width="${W}" height="${RH}" fill="transparent" data-gk="${r.key}" class="gband" data-area="${r.area.id}"/>`;
      }
      h += `<line x1="0" y1="${y + RH - 0.5}" x2="${W}" y2="${y + RH - 0.5}" stroke="var(--line)" pointer-events="none"/>`;
      return;
    }
    if (r.sg) {
      const sg = r.sg, t = P.stype(sg.st);
      h += `<line x1="0" y1="${y + SH - 0.5}" x2="${W}" y2="${y + SH - 0.5}" stroke="var(--line-soft)" opacity=".6" pointer-events="none"/>`;
      if (!sg.start || !sg.finish) return;
      const bx = x(dn(sg.start)!), bw = Math.max(3, (dn(sg.finish)! - dn(sg.start)! + 1) * G.ppd), by = y + 5, bh = SH - 10, bad = P.probs(r.it!.id).some(p => p.sg === sg.id);
      h += `<g class="gb gs" data-i="${r.it!.id}" data-sg="${sg.id}"><rect class="b" x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="2" fill="${t.color}" ${bad ? 'stroke="var(--late)" stroke-dasharray="3 2" stroke-width="1.5"' : ''}/>${bw > 70 ? `<text class="in" x="${bx + 5}" y="${by + bh / 2 + 3.5}" style="font-size:10px">${esc(trimTo(t.name, bw / 5.6))}</text>` : `<text x="${bx + bw + 5}" y="${by + bh / 2 + 3.5}" style="font-size:10.5px;fill:var(--muted)">${esc(t.name)}</text>`}<rect class="h" data-h="s" x="${bx - 3}" y="${by}" width="6" height="${bh}"/><rect class="h" data-h="f" x="${bx + bw - 3}" y="${by}" width="6" height="${bh}"/></g>`;
      return;
    }
    const it = r.it!;
    h += `<line x1="0" y1="${y + RH - 0.5}" x2="${W}" y2="${y + RH - 0.5}" stroke="var(--line-soft)" pointer-events="none"/>`;
    if (!it.start) { h += `<text x="10" y="${y + 19}" style="font:12px var(--f-body);fill:var(--muted)">No dates – drag on this row to set them</text><rect data-draw="${it.id}" x="0" y="${y}" width="${W}" height="${RH}" fill="transparent" style="cursor:crosshair"/>`; return; }
    const bx = x(s0(it)), bw = Math.max(3, (s1(it) - s0(it) + 1) * G.ppd), by = y + 6, bh = RH - 12;
    const cls = 'gb' + (it.id === V.sel ? ' sel' : '') + (P.hasK(it.id, 'clash') ? ' clash' : '');
    const lab = `${it.code}${it.name ? ' · ' + it.name : ''}`, labW = lab.length * 6.3;
    let lx: number, anchor = 'start', ltxt = lab;
    if (bx + bw + 16 + labW < W) lx = bx + bw + 16; else if (bx - 6 - labW > 0) { lx = bx - 6; anchor = 'end'; } else { lx = bx + bw + 16; ltxt = trimTo(lab, Math.max(4, (W - lx) / 6.3)); }
    const dy = drag.current?.kind === 'mv' && drag.current.id === it.id && !drag.current.sg ? drag.current.dy || 0 : 0;
    h += `<g class="${cls}" data-i="${it.id}" data-key="${r.key}" transform="translate(0 ${dy})"><rect class="b" x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3" fill="${P.colourOf(it, V.colour)}" ${P.placed(it) || !it.area ? '' : 'fill-opacity=".55" stroke-dasharray="3 2"'}/>`
      + (bw > 46 ? `<text class="in" x="${bx + 6}" y="${by + bh / 2 + 4}" style="font-size:11px">${esc(trimTo(it.code, bw / 6.5))}</text>` : '')
      + `<text x="${lx}" y="${by + bh / 2 + 4}" text-anchor="${anchor}" style="fill:var(--muted)">${esc(ltxt)}</text>`
      + `<rect class="h" data-h="s" x="${bx - 3}" y="${by}" width="7" height="${bh}"/><rect class="h" data-h="f" x="${bx + bw - 4}" y="${by}" width="7" height="${bh}"/>`
      + `<circle class="lk" data-lk="${it.id}" cx="${bx + bw + 9}" cy="${by + bh / 2}" r="4.5"/></g>`;
  });
  const rowOf = new Map<string, Row>(); rows.forEach(r => { if (r.it && !r.sg) rowOf.set(r.it.id, r); });
  rows.forEach(r => {
    if (!r.it || r.sg || !r.it.start) return; const it = r.it;
    (it.pred || []).forEach(pid => {
      const p = P.item(pid); if (!p || !p.start || !rowOf.has(pid)) return;
      const j = rowOf.get(pid)!, x1 = x(s1(p) + 1), y1 = j.y + RH / 2, x2 = x(s0(it)), y2 = r.y + RH / 2, bad = s0(it) <= s1(p);
      h += `<path class="glink ${bad ? 'bad' : ''}" data-l="${pid}>${it.id}" d="M${x1} ${y1} H${x1 + 8} V${y2} H${x2 - 2}" marker-end="url(#ar)"><title>${esc(p.code)} → ${esc(it.code)}${bad ? ' (out of sequence)' : ''} · click to remove</title></path>`;
    });
  });
  // build tree: each part's finish is tied to the moment it joins its parent
  rows.forEach(r => {
    if (!r.it || r.sg || !r.it.parent || !r.it.finish) return;
    const p = rowOf.get(r.it.parent); if (!p) return;
    const jd = P.joinDate(r.it); if (jd == null) return;
    const late = P.hasK(r.it.id, 'join'), cx = x(s1(r.it) + 1), cy = r.y + RH / 2, jx = x(jd), py = p.y + RH / 2, ey = py + (py > cy ? -RH / 2 + 6 : RH / 2 - 6);
    h += `<path d="M${cx} ${cy}H${jx}V${ey}" fill="none" stroke="${late ? 'var(--late)' : 'var(--accent)'}" stroke-width="1.3" stroke-dasharray="2 3" opacity=".75" pointer-events="none"/><circle cx="${jx}" cy="${ey}" r="2.6" fill="${late ? 'var(--late)' : 'var(--accent)'}" pointer-events="none"/>`;
  });
  if (TODAY >= d0 && TODAY <= d1) h += `<line x1="${x(TODAY)}" y1="0" x2="${x(TODAY)}" y2="${H}" stroke="var(--today)" stroke-width="1.5" pointer-events="none"/>`;
  if (drag.current?.line) h += drag.current.line;

  /* ---------- dragging ---------- */
  const rowAtY = (y: number) => rows.find(r => y >= r.y && y < r.y + r.h) || (y >= H ? rows[rows.length - 1] : rows[0]);
  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return; tip(null); app.closePopover();
    const t = e.target as Element, svg = svgRef.current!, r = svg.getBoundingClientRect();
    const lk = t.closest('[data-lk]') as SVGElement | null, g = t.closest('.gb') as SVGElement | null, dr = t.closest('[data-draw]') as SVGElement | null, link = t.closest('.glink') as SVGElement | null;
    const day = (ev: { clientX: number }) => G.off + (ev.clientX - r.left) / G.ppd;
    if (link) {
      const [pa, pb] = link.dataset.l!.split('>');
      app.commit(d => { const it = itemIn(d, pb); it.pred = it.pred.filter(q => q !== pa); }, 'Link removed'); return;
    }
    if (lk) drag.current = { kind: 'link', from: lk.dataset.lk, x0: +lk.getAttribute('cx')!, y0: +lk.getAttribute('cy')! };
    else if (dr) drag.current = { kind: 'draw', id: dr.dataset.draw, d0: Math.floor(day(e)), y: +dr.getAttribute('y')! };
    else if (g) {
      const it = P.item(g.dataset.i!)!, sg = g.dataset.sg ? it.stages.find(s => s.id === g.dataset.sg) : null, hnd = (t as SVGElement).dataset?.h, obj = sg || it;
      app.beginGesture();
      drag.current = { kind: hnd ? 'rs' + hnd : 'mv', id: it.id, code: it.code, sg: sg?.id, sgName: sg ? P.stype(sg.st).name : '', key: g.dataset.key, s: dn(obj.start), f: dn(obj.finish), d0: day(e), y0: e.clientY, moved: false, st0: (it.stages || []).map(x2 => [x2.start, x2.finish]) };
    } else { drag.current = { kind: 'pan', x: e.clientX, off: G.off, moved: false }; right.current!.classList.add('panning'); }
    svg.setPointerCapture(e.pointerId);
  };
  const move = (ev: React.PointerEvent<SVGSVGElement>) => {
    const D = drag.current, svg = svgRef.current!;
    if (!D) {
      const t = ev.target as Element, g = t.closest('.gb') as SVGElement | null;
      if (g && g.dataset.sg) { const it = P.item(g.dataset.i!)!, sg = it.stages.find(s => s.id === g.dataset.sg)!; tip(ev, `<b>${esc(P.stype(sg.st).name)}</b> · ${esc(it.code)}\n${fd(dn(sg.start))} – ${fd(dn(sg.finish))} (${dn(sg.finish)! - dn(sg.start)! + 1} days)`); }
      else if (g) tip(ev, itemTip(P.item(g.dataset.i!)!));
      else if (t.classList.contains('gband')) {
        const r = svg.getBoundingClientRect(), d = Math.floor(G.off + (ev.clientX - r.left) / G.ppd), ar = P.area((t as SVGElement).dataset.area!)!;
        const o = G.ppd >= 12 ? P.occAt(ar.id, d) : P.occWeek(ar.id, monday(d));
        tip(ev, `<b>${esc(ar.name)}</b> ${G.ppd >= 12 ? fd(d) : 'week of ' + fd(monday(d))}\n${o.n} needed · ${o.cap} footprints${o.n > o.cap ? `\n⚠ ${o.n - o.cap} short` : ''}${o.unp ? `\n${o.unp} not in a footprint` : ''}`);
      } else tip(null);
      return;
    }
    const r = svg.getBoundingClientRect(), day = G.off + (ev.clientX - r.left) / G.ppd;
    if (D.kind === 'pan') { if (Math.abs(ev.clientX - D.x) > 3) D.moved = true; G.off = D.off - (ev.clientX - D.x) / G.ppd; force(); return; }
    if (D.kind === 'link') { D.line = `<path class="glink" style="opacity:1" d="M${D.x0} ${D.y0} L${ev.clientX - r.left} ${ev.clientY - r.top}"/>`; force(); return; }
    if (D.kind === 'draw') { const lo = Math.min(D.d0, Math.floor(day)), hi = Math.max(D.d0, Math.floor(day)); D.a = lo; D.b = hi; D.line = `<rect class="gdrop" x="${(lo - G.off) * G.ppd}" y="${D.y + 6}" width="${(hi - lo + 1) * G.ppd}" height="${RH - 12}"/>`; force(); return; }
    const dd = Math.round(day - D.d0); if (dd || Math.abs(ev.clientY - D.y0) > 6) D.moved = true;
    app.preview(d => {
      const it = itemIn(d, D.id), o = D.sg ? it.stages.find(s => s.id === D.sg)! : it;
      if (D.kind === 'mv') {
        o.start = ds(D.s + dd); o.finish = ds(D.f + dd);
        if (!D.sg) it.stages.forEach((x2, i) => { x2.start = D.st0[i][0] ? ds(dn(D.st0[i][0])! + dd) : x2.start; x2.finish = D.st0[i][1] ? ds(dn(D.st0[i][1])! + dd) : x2.finish; });
      }
      if (D.kind === 'rss') o.start = ds(Math.min(D.f, D.s + dd));
      if (D.kind === 'rsf') o.finish = ds(Math.max(D.s, D.f + dd));
    });
    D.tgt = null; D.dy = 0;
    if (D.kind === 'mv' && !D.sg && (V.gGroup === 'area' || V.gGroup === 'fp') && Math.abs(ev.clientY - D.y0) > 6) {
      const row = rowAtY(ev.clientY - r.top), key = row?.key;
      if (key && key !== D.key) D.tgt = key;
      D.dy = ev.clientY - D.y0;
    }
    const it = app.P.item(D.id)!, o = D.sg ? it.stages.find(s => s.id === D.sg)! : it;
    tip(ev, `${D.sg ? esc(D.sgName) + ' · ' : ''}${esc(D.code)}: ${fd(dn(o.start))} – ${fd(dn(o.finish))} (${dn(o.finish)! - dn(o.start)! + 1} days)${D.tgt ? '\nMove to ' + esc(tgtLabel(D.tgt)) : ''}`);
  };
  const up = (ev: React.PointerEvent<SVGSVGElement>) => {
    const D = drag.current; drag.current = null; right.current?.classList.remove('panning'); tip(null);
    if (!D) return;
    if (D.kind === 'pan') { if (!D.moved) { app.setView({ sel: null }); app.closeDrawer(); } else force(); return; }
    if (D.kind === 'link') {
      const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.gb') as SVGElement | null;
      if (t && !t.dataset.sg && t.dataset.i !== D.from) { const it = P.item(t.dataset.i!)!; if (!it.pred.includes(D.from)) app.commit(d => { const x2 = itemIn(d, it.id); x2.pred = [...x2.pred, D.from]; }, `${P.item(D.from)!.code} → ${it.code} linked`); else force(); }
      else force();
      return;
    }
    if (D.kind === 'draw') { const lo = D.a ?? D.d0, hi = D.b ?? D.d0 + 13; app.commit(d => { const it = itemIn(d, D.id); it.start = ds(lo); it.finish = ds(hi); }); return; }
    if (!D.moved) { app.cancelGesture(); app.openItem(D.id, D.sg); return; }
    const was = P.probs(D.id).filter(p => p.k === 'clash').length;
    if (D.tgt) {
      const k = D.tgt as string;
      app.preview(d => {
        const it = itemIn(d, D.id);
        if (k.startsWith('a:')) { it.area = k.slice(2); it.fp = ''; }
        else if (k.startsWith('f:-')) { it.area = k.slice(3); it.fp = ''; }
        else if (k.startsWith('f:')) { const f = d.footprints.find(z => z.id === k.slice(2))!; it.fp = f.id; it.area = f.area; }
      });
    }
    app.endGesture();
    const it = app.P.item(D.id)!, c = app.P.probs(D.id).filter(p => p.k === 'clash');
    if (D.tgt) app.toast(`${it.code} moved to ${tgtLabel(D.tgt)}${it.fp ? '' : ' – not in a footprint yet'}`, { undo: true });
    else if (c.length > was) app.toast(`${it.code}: ${c[0].t}`, { undo: true });
  };
  const tgtLabel = (k: string) => {
    if (k.startsWith('a:')) return P.area(k.slice(2))?.name || 'No area';
    if (k.startsWith('f:-')) return (P.area(k.slice(3))?.name || '') + ', not in a footprint';
    const f = P.fpOf(k.slice(2)); return f ? `${f.code} (${P.area(f.area)?.name || ''})` : k;
  };

  const toggle = (list: 'collapsed' | 'shut', k: string) => app.setView({ [list]: V[list].includes(k) ? V[list].filter(x2 => x2 !== k) : [...V[list], k] });
  const nF = (['type', 'area', 'q', 'only'] as const).filter(k => V.f[k]).length;
  const pan = (dir: number) => { G.off += dir * Math.round((W / G.ppd) * 0.6); force(); };

  return (
    <>
      <div className="page-head">
        <div><h1>Plan</h1><p>Each item's time in its area, with the stages planned while it is there. Drag bars to move or stretch them – stages move with their item – drag an item into another group to move it there, and drag the ● to link items in sequence.</p></div>
        <div className="tb">
          <label className="small muted" htmlFor="gGroup">Group by</label>
          <select className="ctl" id="gGroup" value={V.gGroup} onChange={e => app.setView({ gGroup: e.target.value as ViewState['gGroup'] })}>{([['area', 'Area'], ['fp', 'Area › footprint'], ['tree', 'Build tree'], ['proj', 'Project'], ['type', 'Type'], ['none', 'Nothing']] as const).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <label className="chk"><input type="checkbox" checked={V.stages} onChange={e => app.setView({ stages: e.target.checked })} /> Stages</label>
          <div className="seg">{(['fit', 'months', 'weeks', 'days'] as const).map(z => <button key={z} aria-pressed={V.gz === z} onClick={() => { gv.current = null; app.setView({ gz: z }); }}>{z[0].toUpperCase() + z.slice(1)}</button>)}</div>
          <div className="seg"><button aria-label="Earlier" onClick={() => pan(-1)}>‹</button><button onClick={() => { G.off = TODAY - Math.round((W / G.ppd) * 0.25); force(); }}>Today</button><button aria-label="Later" onClick={() => pan(1)}>›</button></div>
          <button className="btn sm" onClick={e => filterPop(e.currentTarget)}><Icon k="filter" />Filter{nF ? <span className="bdg">{nF}</span> : null}</button>
          <button className="btn sm ghost" onClick={() => app.setView({ collapsed: [], shut: [], stages: true })}>Expand all</button>
          <button className="btn sm ghost" onClick={() => app.setView({ collapsed: groupKeys(P, V.gGroup) })}>Collapse all</button>
          <button className="btn sm primary" onClick={() => newItem()}><Icon k="plus" />Add item</button>
        </div>
      </div>
      <FilterChips />
      <div className="panel" style={{ ['--gw' as string]: gw + 'px' }}>
        <div className="gwrap" style={{ borderTop: 0 }}>
          <div className="gleft ghead" style={{ display: 'flex', alignItems: 'flex-end', padding: '0 10px 6px', gap: 8 }}>
            <span className="lbl">Item · stage</span><span className="grow" /><span className="lbl">Footprint</span>
            <div className="gcolgrip" title="Drag to widen" onPointerDown={e => {
              const x0 = e.clientX, w0 = gw, el = e.currentTarget; el.setPointerCapture(e.pointerId); let w = w0;
              el.onpointermove = ev => { w = clamp(w0 + ev.clientX - x0, 200, 640); setGw(w); };
              el.onpointerup = () => { el.onpointermove = null; app.setView({ gw: w }); };
            }} />
          </div>
          <div className="gright ghead" style={{ cursor: 'default' }}><TimeHead W={W} off={G.off} ppd={G.ppd} /></div>
        </div>
        <div id="gBody" style={{ maxHeight: 'calc(100vh - 250px)', minHeight: 240, overflowY: 'auto', overflowX: 'hidden' }}>
          <div className="gwrap" style={{ borderTop: 0 }}>
            <div className="gleft">
              {rows.length ? rows.map((r, i) => <LeftRow key={i} r={r} toggle={toggle} />) : <div className="empty">No items match.</div>}
            </div>
            <div className="gright" ref={right}>
              <svg id="ganttSvg" ref={svgRef} width={W} height={Math.max(H, 40)} onPointerDown={down} onPointerMove={move} onPointerUp={up} onMouseLeave={() => tip(null)}
                dangerouslySetInnerHTML={{ __html: `<defs><marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 8 4 0 8z" fill="var(--fg-2)"/></marker></defs>` + h }} />
            </div>
          </div>
        </div>
      </div>
      <div className="legend"><span className="lbl">Stages</span>{P.S.stypes.map(s => <span key={s.id} style={{ ['--c' as string]: s.color }}><i />{s.name}</span>)}</div>
    </>
  );
}

function LeftRow({ r, toggle }: { r: Row; toggle: (l: 'collapsed' | 'shut', k: string) => void }) {
  const a = useApp(); const P = a.P, V = a.V, pad = 10 + r.lvl * 16;
  if (r.grp) return (
    <div className={`grow-l grp ${r.lvl ? 'sub' : ''}`} style={{ paddingLeft: pad, ['--c' as string]: r.color }}>
      <button className="tg" aria-label={r.col ? 'Expand' : 'Collapse'} onClick={e => { e.stopPropagation(); toggle('collapsed', r.key); }}>{r.col ? '▸' : '▾'}</button>
      <i className="c" style={{ ['--c' as string]: r.color }} /><span className="nm">{r.label}</span>
      {r.area ? <span className="r" title="Footprints in this area">{P.capOf(r.area.id)} fp</span> : null}<span className="r">{r.n}</span>
      {r.area ? <button className="btn icon" style={{ padding: 2 }} title={`Add an item in ${r.area.name}`} onClick={e => { e.stopPropagation(); newItem({ area: r.area!.id }); }}><Icon k="plus" /></button> : null}
    </div>
  );
  if (r.sg) {
    const t = P.stype(r.sg.st), bad = P.probs(r.it!.id).some(p => p.sg === r.sg!.id);
    return (
      <div className="grow-l stg" style={{ height: SH, paddingLeft: pad + 22 }} onClick={() => app.openItem(r.it!.id, r.sg!.id)}>
        <i className="c" style={{ ['--c' as string]: t.color }} /><span className="nm">{t.name}</span>
        {bad ? <span style={{ color: 'var(--late)' }} title="Outside the item's dates"><Icon k="warn" /></span> : null}
        <span className="r">{r.sg.start && r.sg.finish ? dn(r.sg.finish)! - dn(r.sg.start)! + 1 + 'd' : ''}</span>
      </div>
    );
  }
  const it = r.it!, hasS = it.stages?.length, shut = V.shut.includes(it.id) || !V.stages, pr = P.probs(it.id);
  return (
    <div className={`grow-l ${it.id === V.sel ? 'sel' : ''} ${r.hasKids ? 'tpar' : ''}`} style={{ paddingLeft: pad }} onClick={() => app.openItem(it.id)}>
      {r.tree && r.hasKids ? <button className="tg" aria-label={`${r.col ? 'Show' : 'Hide'} parts`} onClick={e => { e.stopPropagation(); toggle('collapsed', 'n:' + it.id); }}>{r.col ? '▸' : '▾'}</button>
        : hasS && V.stages ? <button className="tg" aria-label={`${shut ? 'Show' : 'Hide'} stages`} onClick={e => { e.stopPropagation(); toggle('shut', it.id); }}>{shut ? '▸' : '▾'}</button> : <span className="tg" />}
      <i className="c" style={{ ['--c' as string]: P.colourOf(it, V.colour) }} /><span className="code">{it.code}</span>
      <span className={`nm ${it.name ? '' : 'un'}`}>{it.name || 'No name'}</span>
      {pr.length ? <span style={{ color: 'var(--late)' }} title={pr.map(p => p.t).join('\n')}><Icon k="warn" /></span> : null}
      <button className="btn icon addst" title="Add a stage" onClick={e => { e.stopPropagation(); stagePop(it, e.currentTarget); }}><Icon k="plus" /></button>
      <span className={`r ${P.placed(it) ? '' : 'nofp'}`}>{P.placed(it) ? P.fpOf(it.fp)!.code : it.area ? 'none' : ''}</span>
    </div>
  );
}

function gridLines(d0: number, d1: number, ppd: number, x: (d: number) => number) {
  const out: number[] = [];
  if (ppd >= 3) { for (let d = monday(d0); d <= d1; d += 7) out.push(x(d)); }
  else { let dd = new Date(d0 * DAY); dd = new Date(Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), 1)); while (+dd / DAY <= d1) { out.push(x(+dd / DAY)); dd = new Date(Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 1)); } }
  return out;
}

function TimeHead({ W, off, ppd }: { W: number; off: number; ppd: number }) {
  const x = (d: number) => (d - off) * ppd, d0 = Math.floor(off), d1 = Math.ceil(off + W / ppd);
  const top: [number, string][] = [], bot: [number, string, boolean?, boolean?][] = [];
  if (ppd >= 12) { for (let d = d0; d <= d1; d++) { const dt = new Date(d * DAY); if (dt.getUTCDate() === 1 || d === d0) top.push([x(d), MON[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear()]); bot.push([x(d) + ppd / 2, 'MTWTFSS'[dow(d)] + dt.getUTCDate(), dow(d) >= 5, true]); } }
  else if (ppd >= 3) {
    for (let d = monday(d0); d <= d1; d += 7) { const dt = new Date(d * DAY); bot.push([x(d) + 3, ppd >= 10 ? 'w' + weekNo(d) + ' · ' + dt.getUTCDate() : String(dt.getUTCDate())]); }
    let dd = new Date(d0 * DAY); dd = new Date(Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), 1));
    while (+dd / DAY <= d1) { top.push([Math.max(0, x(+dd / DAY)), MON[dd.getUTCMonth()] + ' ' + dd.getUTCFullYear()]); dd = new Date(Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 1)); }
  } else {
    let dd = new Date(d0 * DAY); dd = new Date(Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), 1));
    while (+dd / DAY <= d1) { const n = +dd / DAY; if (dd.getUTCMonth() === 0 || !top.length) top.push([Math.max(0, x(n)), String(dd.getUTCFullYear())]); if (ppd * 30 > 22) bot.push([x(n) + 3, ppd * 30 > 40 ? MON[dd.getUTCMonth()] : MON[dd.getUTCMonth()][0]]); dd = new Date(Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 1)); }
  }
  return (
    <svg width={W} height={HH} style={{ display: 'block' }}>
      {top.map(([tx, t], i) => <g key={'t' + i}><line x1={tx} y1={0} x2={tx} y2={20} stroke="var(--line)" /><text x={tx + 4} y={15} style={{ font: '600 11.5px var(--f-body)', fill: 'var(--fg-2)' }}>{t}</text></g>)}
      {bot.map(([tx, t, we, mid], i) => <text key={'b' + i} x={tx} y={36} textAnchor={mid ? 'middle' : undefined} style={{ font: '500 10.5px var(--f-mono)', fill: we ? 'var(--muted)' : 'var(--fg-2)' }}>{t}</text>)}
      {TODAY >= d0 && TODAY <= d1 ? <rect x={x(TODAY) - 1} y={22} width={2.5} height={22} fill="var(--today)" /> : null}
      <line x1={0} y1={20.5} x2={W} y2={20.5} stroke="var(--line-soft)" />
    </svg>
  );
}
