/* Vessel build: how each hull comes together – units join blocks, blocks join the hull.
   A side profile you can play through time, an editor to draw where each part sits, and the assembly tree. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { app, itemIn, useApp } from '../store/app';
import type { Item, Pt } from '../core/types';
import { dist, movePts } from '../core/geometry';
import { s0, s1 } from '../core/plan';
import { fillStages, blankItem } from '../core/example';
import { readPicture } from '../core/pictures';
import { DEF_PROF, profOf, vesselProfile, vesselSpan, vesselTreeSVG } from '../core/vesselSvg';
import { clamp, ds, esc, fd, fdl, r1, TODAY, uid, weekNo } from '../core/util';
import { Icon } from '../ui/Icon';
import { confirmBox, tip } from '../ui/Overlays';
import { itemTip } from '../ui/actions';
import { newVesselDialog, splitDialog, vesselRoot } from '../ui/dialogs';
import { setPageKeys } from '../ui/keys';

type VDraft = { kind: 'rect'; a: Pt; b?: { x: number; y: number; w: number; h: number } } | { kind: 'poly'; pts: Pt[]; mouse?: Pt };

function rescaleZones(d: { items: Item[] }, rootId: string, w0: number, h0: number, w1: number, h1: number) {
  const sx = w1 / w0, sy = h1 / h0, P = app.P, root = P.item(rootId)!;
  const ids = new Set([root.id, ...P.descendants(root).map(x => x.id)]);
  d.items.forEach(it => { if (ids.has(it.id) && it.zone) it.zone = it.zone.map(([x, y]) => [r1(x * sx), r1(y * sy)] as Pt); });
}

export function VesselBuild() {
  const a = useApp(); const P = a.P, V = a.V, ved = a.vedit;
  const R = P.treeRoots().filter(P.shown);
  const root = vesselRoot();
  const [play, setPlay] = useState(false);
  const [tool, setTool] = useState<'select' | 'draw' | 'hull'>('select');
  const [shape, setShape] = useState<'rect' | 'poly'>('rect');
  const [target, setTarget] = useState('');
  const [vsel, setVsel] = useState('');
  const [draft, setDraft] = useState<VDraft | null>(null);
  const draftRef = useRef<VDraft | null>(null);
  const setD = (d: VDraft | null) => { draftRef.current = d; setDraft(d ? ({ ...d } as VDraft) : null); };
  const host = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const vd = useRef<Record<string, any> | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [hostW, setHostW] = useState(1000);
  useLayoutEffect(() => { const el = host.current; if (!el) return; const ro = new ResizeObserver(() => setHostW(el.clientWidth || 1000)); ro.observe(el); return () => ro.disconnect(); }, [root?.id]);
  useEffect(() => { if (!root && ved) app.setVedit(false); }, [root, ved]);
  const sp = root ? vesselSpan(P, root, TODAY) : { a: TODAY - 30, b: TODAY + 90 };
  const d = V.date;
  useEffect(() => {
    if (!play || !root) return;
    if (app.V.date >= sp.b - 7) app.setView({ date: sp.a });
    const t = setInterval(() => { const r2 = vesselRoot(); const s2 = r2 ? vesselSpan(app.P, r2, TODAY) : sp; if (app.vedit || app.V.date + 7 > s2.b) { setPlay(false); return; } app.setView({ date: app.V.date + 7 }); }, 600);
    return () => clearInterval(t);
  }, [play]); // eslint-disable-line react-hooks/exhaustive-deps

  const desc = root ? P.descendants(root) : [];
  const tgtId = target && P.item(target) && root && P.isUnder(target, root.id) ? target : (desc.find(k => !k.zone) || desc[0])?.id || '';
  const pr = root ? profOf(P, root) : null;
  const fs = (pr?.w || DEF_PROF.w) / Math.max(300, hostW - 20);
  const regs = new Map();
  const Pf = root ? vesselProfile(P, root, d, { fs, regs, edit: ved, sel: ved ? vsel : V.sel }) : null;

  /* ---------- keys ---------- */
  setPageKeys((e: KeyboardEvent) => {
    if (!ved) return false;
    const k = e.key, dr = draftRef.current;
    if (dr) {
      if (k === 'Escape') { setD(null); return true; }
      if (k === 'Enter') { finishPoly(); return true; }
      if (k === 'Backspace' && dr.kind === 'poly') { setD({ ...dr, pts: dr.pts.slice(0, -1) }); return true; }
    }
    const it = vsel ? P.item(vsel) : undefined;
    if (it && it.zone && (k === 'Delete' || k === 'Backspace')) { e.preventDefault(); app.commit(dd => { delete itemIn(dd, it.id).zone; }, `${it.code}'s shape cleared – it shares its parent's again`); return true; }
    if (k === 'Escape' && vsel) { setVsel(''); return true; }
    return false;
  });

  if (!root) return (
    <>
      <div className="page-head"><div><h1>Vessel build</h1><p>How each hull comes together: units join into blocks and blocks into the hull.</p></div><div className="tb"><button className="btn sm primary" onClick={newVesselDialog}><Icon k="ship" />New vessel…</button></div></div>
      <div className="panel"><div className="empty"><Icon k="ship" /><b>No build trees yet</b><span>Create a vessel from blocks and units, or open any item and use “Joins into” to link it to the item it becomes part of.</span><button className="btn primary" onClick={newVesselDialog}><Icon k="ship" />New vessel…</button></div></div>
    </>
  );

  /* ---------- stats ---------- */
  const leaves: Item[] = []; const walk = (it: Item) => { const k = P.kidsOf(it.id); if (k.length) k.forEach(walk); else leaves.push(it); }; walk(root);
  const all = [root, ...desc];
  const done = leaves.filter(l => P.stateOn(l, d) === 'done').length, joined = all.filter(x => x.parent && P.joinDate(x) != null && d >= P.joinDate(x)!).length;
  const next = all.filter(x => x.parent && P.joinDate(x) != null && P.joinDate(x)! > d).sort((x, y) => P.joinDate(x)! - P.joinDate(y)!)[0];
  const rs = P.stateOn(root, d), rf = P.fpOf(root.fp);

  /* ---------- profile editing ---------- */
  const toU = (e: { clientX: number; clientY: number }): Pt => { const svg = svgRef.current!, pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(svg.getScreenCTM()!.inverse()); return [q.x, q.y]; };
  const snapU = (p: Pt, skip?: { id: string; i: number }): Pt => {
    let best: Pt | null = null, bd = 8 * fs;
    all.forEach(it => (it.zone || []).forEach((q, i) => { if (skip && skip.id === it.id && skip.i === i) return; const dd = dist(p, q); if (dd < bd) { bd = dd; best = q; } }));
    return best ? [best[0], best[1]] : [r1(p[0]), r1(p[1])];
  };
  const tgt = () => (tool === 'hull' ? root : P.item(tgtId));
  const finish = (pts: Pt[]) => {
    const t = tgt(); setD(null);
    if (!t) { app.toast('Pick the part to draw first'); return; }
    app.commit(dd => { itemIn(dd, t.id).zone = pts.map(p => [r1(p[0]), r1(p[1])] as Pt); }, t === root ? 'Hull outline drawn' : `${t.code} drawn`);
    setVsel(t.id);
    if (t !== root) { const nx = desc.find(k => !k.zone && k.id !== t.id); if (nx) setTarget(nx.id); }
  };
  const finishPoly = () => { const dr = draftRef.current; if (dr?.kind === 'poly' && dr.pts.length >= 3) finish(dr.pts); };
  const sel = vsel ? (vsel === root.id ? root : P.item(vsel)) : undefined;
  const editDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const p = toU(e), t = e.target as Element;
    (document.activeElement as HTMLElement | null)?.blur?.(); // so Enter, Delete and Esc reach the drawing
    if (tool === 'select') {
      const v = t.closest('[data-vv]') as SVGElement | null, m = t.closest('[data-vm]') as SVGElement | null, hit = t.closest('[data-vi]') as SVGElement | null;
      if (v && sel?.zone) {
        if (e.detail === 2 && sel.zone.length > 3) { const i = +v.dataset.vv!; app.commit(dd => { itemIn(dd, sel.id).zone!.splice(i, 1); }); return; }
        app.beginGesture(); vd.current = { kind: 'vert', id: sel.id, i: +v.dataset.vv! };
      } else if (m && sel?.zone) {
        const i = +m.dataset.vm! + 1; app.beginGesture();
        app.preview(dd => { itemIn(dd, sel.id).zone!.splice(i, 0, p); });
        vd.current = { kind: 'vert', id: sel.id, i, moved: true };
      } else if (hit) {
        const it = P.item(hit.dataset.vi!)!; setVsel(it.id); setTarget(it.id);
        if (it.zone) { const fam = [it, ...P.descendants(it)].filter(x => x.zone); app.beginGesture(); vd.current = { kind: 'body', fam: fam.map(x => x.id), p0: p, orig: fam.map(x => x.zone!.map(q => [...q])) }; }
      } else { setVsel(''); return; }
    } else if (shape === 'rect') { setD({ kind: 'rect', a: snapU(p) }); vd.current = { kind: 'rect' }; }
    else { if (draftRef.current?.kind !== 'poly') setD({ kind: 'poly', pts: [] }); vd.current = { kind: 'click', x: e.clientX, y: e.clientY }; }
    svgRef.current!.setPointerCapture(e.pointerId);
  };
  const editMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const D = vd.current;
    if (!D) { const dr = draftRef.current; if (dr?.kind === 'poly') setD({ ...dr, mouse: toU(e) }); return; }
    const q = toU(e);
    if (D.kind === 'vert') { D.moved = true; const sp2 = snapU(q, { id: D.id, i: D.i }); app.preview(dd => { const z = itemIn(dd, D.id).zone!; z[D.i] = sp2; }); }
    else if (D.kind === 'body') {
      const dx = q[0] - D.p0[0], dy = q[1] - D.p0[1];
      if (Math.hypot(dx, dy) / fs > 3) D.moved = true;
      if (D.moved) app.preview(dd => (D.fam as string[]).forEach((id, j) => { itemIn(dd, id).zone = movePts(D.orig[j], dx, dy); }));
    } else if (D.kind === 'rect') { const dr = draftRef.current; if (dr?.kind === 'rect') { const b2 = snapU(q), aa = dr.a; setD({ ...dr, b: { x: Math.min(aa[0], b2[0]), y: Math.min(aa[1], b2[1]), w: Math.abs(b2[0] - aa[0]), h: Math.abs(b2[1] - aa[1]) } }); } }
  };
  const editUp = (ev: React.PointerEvent<SVGSVGElement>) => {
    const D = vd.current; vd.current = null; if (!D) return;
    if (D.kind === 'vert' || D.kind === 'body') { if (D.moved) app.endGesture(); else app.cancelGesture(); return; }
    if (D.kind === 'rect') { const dr = draftRef.current, b = dr?.kind === 'rect' ? dr.b : undefined; if (b && b.w / fs > 6 && b.h / fs > 6) finish([[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]); else setD(null); return; }
    if (D.kind === 'click' && Math.hypot(ev.clientX - D.x, ev.clientY - D.y) < 5) {
      const dr = draftRef.current; if (dr?.kind !== 'poly') return;
      const q = snapU(toU(ev));
      if (dr.pts.length >= 3 && dist(q, dr.pts[0]) / fs < 10) { finishPoly(); return; }
      setD({ ...dr, pts: [...dr.pts, q] });
    }
  };
  let over = '';
  if (ved && sel?.zone) {
    const z = sel.zone;
    z.forEach((p, i) => { const q = z[(i + 1) % z.length]; over += `<circle data-vm="${i}" cx="${(p[0] + q[0]) / 2}" cy="${(p[1] + q[1]) / 2}" r="${3.5 * fs}" fill="#fff" stroke="#0f2f4c" stroke-width="${1.2 * fs}" style="cursor:copy"/>`; });
    z.forEach((p, i) => (over += `<rect data-vv="${i}" x="${p[0] - 5 * fs}" y="${p[1] - 5 * fs}" width="${10 * fs}" height="${10 * fs}" fill="#0f2f4c" stroke="#fff" stroke-width="${1.5 * fs}" style="cursor:move"/>`));
  }
  let tmp = '';
  if (draft) {
    const st = `fill="#0f2f4c" fill-opacity=".12" stroke="#0f2f4c" stroke-width="${2 * fs}"`;
    if (draft.kind === 'rect' && draft.b) tmp = `<rect x="${draft.b.x}" y="${draft.b.y}" width="${draft.b.w}" height="${draft.b.h}" ${st}/>`;
    else if (draft.kind === 'poly') { const pts = draft.mouse ? [...draft.pts, draft.mouse] : draft.pts; tmp = pts.length ? `<path d="M${pts.map(p => p.join(' ')).join('L')}" ${st}/>` + draft.pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${(i ? 3 : 5) * fs}" fill="#0f2f4c"/>`).join('') : ''; }
  }
  const und = desc.filter(k => !k.zone);
  const hint = { select: 'Click a part to select it. Drag a drawn part to move it (its own parts move with it), drag its corners, drag a round handle to add a corner, double-click a corner to remove it. Delete clears its shape.', draw: shape === 'poly' ? 'Click each corner of the part, then click the first corner, double-click or press Enter. Backspace removes the last corner, Esc cancels.' : 'Drag a box where the part sits. The next part to draw is picked for you.', hull: shape === 'poly' ? 'Click round the hull outline, then click the first corner or press Enter.' : 'Drag a box for the hull.' }[tool];

  const uploadProfile = async (file: File) => {
    let res;
    try { app.toast('Reading ' + file.name + '…'); res = await readPicture(file); }
    catch (er) { app.toast('Could not read that picture: ' + ((er as Error).message || er) + '. Save it as PNG, JPG or PDF and try again.'); return; }
    const old = profOf(P, root), w0 = old?.w || DEF_PROF.w, h0 = old?.h || DEF_PROF.h;
    app.commit(dd => { rescaleZones(dd, root.id, w0, h0, res.w, res.h); dd.profiles = dd.profiles.filter(x => x.root !== root.id); dd.profiles.push({ id: uid('pp'), root: root.id, src: res.src, w: res.w, h: res.h, op: 1, name: file.name }); }, 'Side profile added – now draw each part on it');
    app.setVedit(true); setTool('draw'); setTarget((desc.find(k => !k.zone) || { id: '' }).id);
  };
  const addWheelhouse = () => {
    const kids = P.kidsOf(root.id), base = (root.code || 'X').replace(/-HULL$/, '');
    let code = base + '-WH', i = 2; while (P.S.items.some(x => x.code === code)) code = `${base}-WH${i++}`;
    const len = root.start ? s1(root) - s0(root) : 60, fin = root.start ? s0(root) + Math.round(len * 0.5) : TODAY + 28;
    const it = blankItem({ code, name: 'Wheelhouse', proj: root.proj, type: kids[0]?.type || P.S.types[0]?.id || '', shape: 'deckhouse', area: kids.find(k => k.area)?.area || '', start: ds(fin - 27), finish: ds(fin), parent: root.id });
    fillStages(it, P.S);
    app.commit(dd => { dd.items.push(it); }, `${code} wheelhouse added – it joins ${root.code} ${fd(fin + 1)}`);
    if (ved) { setTool('draw'); setTarget(it.id); setVsel(it.id); }
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Vessel build{ved ? ' · edit profile' : ''}</h1><p>{ved ? 'Add a picture of the ship’s side profile, or sketch on the standard hull. Pick a part and draw where it sits – blocks, units, a wheelhouse above the deck. Parts you have not drawn share their parent’s shape.' : 'How each hull comes together: units join into blocks and blocks into the hull. Pick a date or press Play to watch it build. In the tree, drag a part onto another to change what it joins; + splits an item into parts.'}</p></div>
        <div className="tb">
          <select className="ctl" aria-label="Vessel" value={root.id} onChange={e => { setVsel(''); setTarget(''); setD(null); const s2 = vesselSpan(P, P.item(e.target.value)!, TODAY); app.setView({ vroot: e.target.value, date: V.date < s2.a || V.date > s2.b ? clamp(TODAY, s2.a, s2.b) : V.date }); }}>
            {R.map(r => <option key={r.id} value={r.id}>{r.code} · {r.name} ({P.leafCount(r)} parts)</option>)}
          </select>
          {!ved ? <button className="btn sm" title="Put your ship's side profile in and draw where each block sits" onClick={() => { setPlay(false); app.setVedit(true); }}><Icon k="edit" />Edit profile</button> : null}
          <button className="btn sm primary" onClick={newVesselDialog}><Icon k="ship" />New vessel…</button>
        </div>
      </div>
      <div className="panel">
        {ved ? (
          <>
            <div className="datebar edit-hint vedit">
              <div className="seg">{([['select', 'cursor', 'Select'], ['draw', 'pen', 'Draw a part'], ['hull', 'ship', 'Hull outline']] as const).map(([k, i, l]) => <button key={k} aria-pressed={tool === k} onClick={() => { setTool(k); setD(null); }}><Icon k={i} /> {l}</button>)}</div>
              {tool !== 'select' ? <div className="seg"><button aria-pressed={shape === 'rect'} onClick={() => { setShape('rect'); setD(null); }}>Rectangle</button><button aria-pressed={shape === 'poly'} onClick={() => { setShape('poly'); setD(null); }}>Any shape</button></div> : null}
              {tool === 'draw' ? <select className="ctl" aria-label="Part to draw" value={tgtId} onChange={e => { setTarget(e.target.value); setVsel(e.target.value); }}>{desc.map(k => <option key={k.id} value={k.id}>{k.zone ? '✓ ' : ''}{k.code} · {k.name}</option>)}</select> : null}
              <span className="sep" />
              <button className="btn sm" onClick={() => fileRef.current?.click()}><Icon k="image" />{pr ? 'Replace picture…' : 'Side profile picture…'}</button>
              {pr ? <><button className="btn sm ghost" onClick={() => confirmBox('Remove the picture', 'Remove the side profile picture? Your drawn shapes stay, on the standard hull.', 'Remove', () => app.commit(dd => { rescaleZones(dd, root.id, pr.w, pr.h, DEF_PROF.w, DEF_PROF.h); dd.profiles = dd.profiles.filter(x => x.id !== pr.id); }, 'Picture removed'))}>Remove picture</button>
                <input type="range" min={0.15} max={1} step={0.05} defaultValue={pr.op} title="Picture strength" aria-label="Picture strength" style={{ width: 90 }} onInput={e => svgRef.current?.querySelector('image')?.setAttribute('opacity', (e.target as HTMLInputElement).value)} onChange={e => app.commit(dd => { dd.profiles.find(x => x.id === pr.id)!.op = +e.target.value; })} /></> : null}
              <button className="btn sm" onClick={addWheelhouse}><Icon k="plus" />Wheelhouse</button>
              <button className="btn sm ghost" title="Forget every drawn shape for this vessel" onClick={() => confirmBox('Clear drawn shapes', `Forget every shape drawn for ${root.code}? The picture stays; parts go back to sharing the hull automatically.`, 'Clear', () => app.commit(dd => { [root, ...desc].forEach(k => delete itemIn(dd, k.id).zone); }, 'Drawn shapes cleared'), true)}>Clear drawn shapes</button>
              <span className="grow" /><button className="btn sm primary" onClick={() => { app.setVedit(false); setD(null); }}>Done</button>
              <input type="file" ref={fileRef} accept="image/*,.pdf,.svg" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadProfile(f); }} />
            </div>
            <div className="vhint"><span><Icon k={tool === 'select' ? 'cursor' : 'pen'} /> {hint}</span>
              {und.length && (Pf?.anyZone || pr) ? <span className="chips"><span className="small muted">Not drawn yet:</span>{und.slice(0, 24).map(k => <button key={k.id} className="fchip" onClick={() => { setTool('draw'); setTarget(k.id); setVsel(k.id); }}>{k.code}</button>)}{und.length > 24 ? <span className="small muted">+{und.length - 24}</span> : null}</span> : null}
            </div>
          </>
        ) : (
          <div className="datebar">
            <div className="big">{fd(d)}<small>{fdl(d).split(' ')[0].toUpperCase()} · WEEK {weekNo(d)}{d === TODAY ? ' · TODAY' : ''}</small></div>
            <div className="seg"><button title="Back a week" onClick={() => app.setView({ date: d - 7 })}>‹‹</button><button title="Back a day" onClick={() => app.setView({ date: d - 1 })}>‹</button><button onClick={() => app.setView({ date: TODAY })}>Today</button><button title="On a day" onClick={() => app.setView({ date: d + 1 })}>›</button><button title="On a week" onClick={() => app.setView({ date: d + 7 })}>››</button></div>
            <button className="btn sm" onClick={() => setPlay(!play)}><Icon k={play ? 'pause' : 'play'} />{play ? 'Pause' : 'Play'}</button>
            <input type="range" className="vrange" aria-label="Date" min={sp.a} max={sp.b} value={clamp(d, sp.a, sp.b)} onChange={e => app.setView({ date: +e.target.value })} />
            <div className="chips" id="vStats">
              <span className="chip">{done} of {leaves.length} units finished</span><span className="chip">{joined} of {all.length - 1} joined</span>
              {next ? <span className="chip">Next: {next.code} joins {P.parentOf(next)!.code} {fd(P.joinDate(next))}</span> : <span className="chip good">All joined</span>}
            </div>
          </div>
        )}
        <div className="vtitle"><b>{root.code} · {root.name}</b><span className="muted">{rs === 'wait' ? 'Starts ' + fd(s0(root)) + (rf ? ' in ' + rf.code : '') : rs === 'build' ? 'Being built' + (rf ? ' in ' + rf.code : '') + ' until ' + fd(s1(root)) : rs === 'done' ? 'Finished ' + fd(s1(root)) : ''}</span></div>
        <div className="vprof" ref={host}>
          {Pf ? <svg id="vSvg" ref={svgRef} width="100%" style={{ display: 'block', maxHeight: (ved ? 70 : 60) + 'vh' }} viewBox={`0 ${Pf.y0} ${Pf.w} ${Pf.h - Pf.y0}`} className={ved ? 'editing tool-' + tool : ''}
            onPointerDown={ved ? editDown : e => { const hit = (e.target as Element).closest('[data-vi]') as SVGElement | null; if (hit) app.openItem(hit.dataset.vi!); }}
            onPointerMove={ved ? editMove : e => { const hit = (e.target as Element).closest('[data-vi]') as SVGElement | null; if (!hit) { tip(null); return; } const it = P.item(hit.dataset.vi!)!, p = P.parentOf(it); tip(e, itemTip(it) + (p ? `\nJoins ${esc(p.code)} ${P.joinDate(it) != null ? fd(P.joinDate(it)) : ''}` : '') + (P.kidsOf(it.id).length ? `\nMade from ${P.kidsOf(it.id).map(k => esc(k.code)).join(', ')}` : '')); }}
            onPointerUp={ved ? editUp : undefined} onMouseLeave={() => tip(null)}
            onDoubleClick={e => { if (ved && draftRef.current?.kind === 'poly') { e.preventDefault(); finishPoly(); } }}
            dangerouslySetInnerHTML={{ __html: `${Pf.svg}<g>${over}</g><g>${tmp}</g>` }} /> : null}
        </div>
        <div className="legend"><span><i style={{ background: '#efecf1', border: '1px dashed #6c6a74' }} />Not started</span><span><i style={{ background: `repeating-linear-gradient(45deg,${P.proj(root.proj).color} 0 3px,#fff 3px 5px)` }} />Being built</span><span><i style={{ ['--c' as string]: P.proj(root.proj).color }} />Finished</span><span>Gaps show parts still separate; parts touch once they have joined</span></div>
      </div>
      <div className="panel">
        <div className="panel-h"><div><h2>Assembly tree</h2><p>Parts on the left join the item on their right. A solid line has joined on this date; dashed is still to come.</p></div><div className="row"><button className="btn sm" onClick={() => splitDialog(root.id)}><Icon k="split" />Split {root.code} into parts…</button></div></div>
        <Tree root={root} d={d} />
      </div>
    </>
  );
}

function Tree({ root, d }: { root: Item; d: number }) {
  const a = useApp(); const P = a.P;
  const ref = useRef<HTMLDivElement>(null);
  const T = vesselTreeSVG(P, root, d, { sel: a.V.sel });
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const [dropId, setDropId] = useState('');
  const down = (e: React.PointerEvent) => {
    const t = e.target as Element;
    const add = t.closest('[data-vadd]') as SVGElement | null;
    if (add) { e.stopPropagation(); splitDialog(add.dataset.vadd!); return; }
    const n = t.closest('[data-vn]') as SVGElement | null; if (!n || e.button !== 0) return;
    e.preventDefault();
    const id = n.dataset.vn!; drag.current = { id, x: e.clientX, y: e.clientY, moved: false };
    const mv = (ev: PointerEvent) => {
      const D = drag.current; if (!D) return;
      if (Math.hypot(ev.clientX - D.x, ev.clientY - D.y) > 5) D.moved = true;
      if (!D.moved) return;
      n.setAttribute('opacity', '.55');
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-vn]') as SVGElement | null;
      setDropId(over && over.dataset.vn !== id ? over.dataset.vn! : '');
      tip(ev, `Drop ${esc(P.item(id)!.code)} onto the item it joins`);
    };
    const up = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); tip(null);
      const D = drag.current; drag.current = null; n.removeAttribute('opacity'); setDropId('');
      if (!D) return;
      if (!D.moved) { app.openItem(id); return; }
      const t2 = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-vn]') as SVGElement | null;
      if (!t2 || t2.dataset.vn === id) return;
      const it = app.P.item(id)!, np = app.P.item(t2.dataset.vn!)!;
      if (app.P.isUnder(np.id, it.id)) { app.toast(`${np.code} is one of ${it.code}'s own parts`); return; }
      if (it.parent === np.id) return;
      app.commit(dd => { itemIn(dd, it.id).parent = np.id; }, `${it.code} now joins ${np.code}`);
    };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  };
  const svg = dropId ? T.svg.replace(`class="vn" data-vn="${dropId}"`, `class="vn drop" data-vn="${dropId}"`) : T.svg;
  return (
    <div className="vtree" ref={ref}>
      <svg width={Math.max(T.w, (ref.current?.clientWidth || 0) - 2)} height={T.h} style={{ display: 'block' }} onPointerDown={down}
        onMouseMove={e => { if (drag.current) return; const n = (e.target as Element).closest('[data-vn]') as SVGElement | null; tip(e, n ? itemTip(P.item(n.dataset.vn!)!) : null); }} onMouseLeave={() => tip(null)}
        dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
