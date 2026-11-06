/* Capacity: footprints needed in each hall or area every week, against the footprints it has. */
import { useLayoutEffect, useRef, useState } from 'react';
import { app, useApp } from '../store/app';
import { capChart, capWeeks, weekStack, type WeekData } from '../core/capacity';
import { heatCol } from '../core/plan';
import { DAY, esc, fd, MON, monday, TODAY } from '../core/util';
import { Icon } from '../ui/Icon';
import { tip } from '../ui/Overlays';
import { openOnFloor } from '../ui/actions';
import { setPageKeys } from '../ui/keys';

interface Card { id: string; title: string; sub: string; aids: string[]; cap: number; color?: string; data: WeekData[] }

export function Capacity() {
  const a = useApp(); const P = a.P, V = a.V, AS = P.areasSorted(), by = V.capBy;
  setPageKeys(null);
  const weeks = capWeeks(P, V.capWeeks);
  const cards: Card[] = AS.map(x => ({ id: x.id, title: x.name, sub: `${P.capOf(x.id)} footprints · ${x.kind}${x.crane ? ` · ${x.crane} t crane` : ''}`, aids: [x.id], cap: P.capOf(x.id), color: x.color, data: weeks.map(w => weekStack(P, [x.id], w, by)) }));
  const totCap = P.S.footprints.length;
  const comb: Card = { id: 'all', title: 'All areas combined', sub: `${totCap} footprints across ${AS.length} areas`, aids: AS.map(x => x.id), cap: totCap, data: weeks.map(w => weekStack(P, AS.map(x => x.id), w, 'area')) };
  const shortNow = AS.filter(x => { const o = P.occWeek(x.id, monday(TODAY)); return o.n > o.cap; });
  const shortWeeks = cards.reduce((s, c) => s + c.data.filter(d => d.n > c.cap).length, 0);
  const nofp = P.S.items.filter(it => P.shown(it) && it.area && !P.placed(it) && it.start && P.stateOn(it, TODAY) !== 'done').length;
  const legs = by === 'type' ? P.S.types : P.shownProjects();
  const goItems = (only: 'unplaced' | 'problems') => { app.setView({ f: { only } }); app.go('items'); };
  return (
    <>
      <div className="page-head">
        <div><h1>Capacity</h1><p>Footprints needed in each hall or area every week, against the footprints it has. A week shows its busiest day. Striped means planned in the area but not yet given a footprint. Click a week to open it on the floor plan.</p></div>
        <div className="tb">
          <span className="small muted">From this week</span>
          <div className="seg">{([[13, '13 weeks'], [26, '26 weeks'], [52, '52 weeks'], [0, 'Whole plan']] as const).map(([n, l]) => <button key={n} aria-pressed={V.capWeeks === n} onClick={() => app.setView({ capWeeks: n })}>{l}</button>)}</div>
          <span className="small muted">Colour by</span>
          <div className="seg">{([['proj', 'Project'], ['type', 'Type']] as const).map(([k, l]) => <button key={k} aria-pressed={by === k} onClick={() => app.setView({ capBy: k })}>{l}</button>)}</div>
        </div>
      </div>
      <div className="stat">
        <div className={`kpi ${shortNow.length ? 'warn' : ''}`}><span className="lbl">Short this week</span><b>{shortNow.length}</b><span className="s">{shortNow.length ? shortNow.map(x => x.name).join(', ') : 'every area has enough footprints'}</span></div>
        <div className={`kpi ${shortWeeks ? 'warn' : ''}`}><span className="lbl">Weeks short ahead</span><b>{shortWeeks}</b><span className="s">area-weeks needing more footprints than they have</span></div>
        <button className="kpi" onClick={() => goItems('unplaced')}><span className="lbl">Not in a footprint</span><b>{nofp}</b><span className="s">planned in an area, no footprint yet</span></button>
        <button className={`kpi ${P.pairs.length ? 'warn' : ''}`} onClick={() => goItems('problems')}><span className="lbl">Double-booked</span><b>{P.pairs.length}</b><span className="s">two items given the same footprint</span></button>
      </div>
      <div className="legend" style={{ padding: 0 }}>
        {legs.map(x => <span key={x.id} style={{ ['--c' as string]: x.color }}><i />{x.name}</span>)}
        <span><i style={{ background: 'repeating-linear-gradient(45deg,var(--fg-2) 0 2px,transparent 2px 4px)' }} />No footprint yet</span>
        <span><i style={{ background: 'none', border: '2px solid var(--late)' }} />Short of footprints</span>
        <span><i style={{ background: 'var(--fg-2)', height: 2 }} />Footprints in the area</span>
      </div>
      <div className="capgrid">{cards.length ? cards.map(c => <CapCard key={c.id} c={c} h={180} />) : <div className="empty">Add areas and draw footprints on the floor plan to see capacity.</div>}</div>
      {AS.length ? <CapCard c={comb} h={240} comb /> : null}
      <div className="panel">
        <div className="panel-h"><div><h2>Week by week</h2><p>Footprints needed on the busiest day of each week. Amber is full, red is short.</p></div></div>
        <div className="tbl-wrap" style={{ maxHeight: '50vh', overflow: 'auto' }}>
          <table className="heat">
            <thead><tr><th className="a">Area · footprints</th>{comb.data.map(d => <th key={d.w} title={`Week of ${fd(d.w)}`}>{MON[new Date(d.w * DAY).getUTCMonth()]}<br />{new Date(d.w * DAY).getUTCDate()}</th>)}</tr></thead>
            <tbody>
              {[...cards, { ...comb, title: 'All areas' }].map(c => (
                <tr key={c.id}>
                  <td className="a">{c.id === 'all' ? <b>All areas · {c.cap}</b> : `${c.title} · ${c.cap}`}</td>
                  {c.data.map(d => <td key={d.w} className={d.w === monday(TODAY) ? 'now' : ''} style={{ background: heatCol(d.n, c.cap), color: d.n / (c.cap || 1) > 0.45 ? '#fff' : 'var(--fg-2)' }} title={`${c.title}, week of ${fd(d.w)}: ${d.n} needed of ${c.cap}`} onClick={() => openOnFloor(d.d, c.id)}>{d.n || ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function CapCard({ c, h, comb }: { c: Card; h: number; comb?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useLayoutEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth || 600)); ro.observe(el); return () => ro.disconnect(); }, []);
  const short = c.data.filter(d => d.n > c.cap), peak = c.data.reduce((m, d) => (d.n > m.n ? d : m), { n: 0, w: 0 } as { n: number; w: number });
  const svg = capChart(c.data, c.cap, W, h, { id: 'hw' + c.id });
  const week = (e: React.MouseEvent) => { const t = (e.target as Element).closest('.cw') as SVGElement | null; return t ? c.data[+t.dataset.i!] : null; };
  return (
    <div className={`panel capcard ${comb ? 'comb' : ''}`}>
      <div className="panel-h">
        <div><h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{c.color ? <span className="sw" style={{ ['--c' as string]: c.color }} /> : null}{c.title}</h2><p>{c.sub}</p></div>
        <div className="chips">
          {peak.n ? <span className="chip">Peak {peak.n} · wk of {fd(peak.w)}</span> : <span className="chip">Nothing planned</span>}
          {short.length ? <span className="chip late"><Icon k="warn" />{short.length} week{short.length > 1 ? 's' : ''} short</span> : peak.n ? <span className="chip good">Fits</span> : null}
        </div>
      </div>
      <div className="capsvg" ref={ref}>
        <svg width={W} height={h} style={{ display: 'block' }} dangerouslySetInnerHTML={{ __html: svg }}
          onMouseMove={e => { const d = week(e); tip(e, d ? `<b>Week of ${fd(d.w)}</b> (busiest day ${fd(d.d)})\n${d.n} needed of ${c.cap} footprints${d.n > c.cap ? ` – ${d.n - c.cap} short` : ''}${d.segs.length ? '\n' + d.segs.map(g => `${esc(g.label)}: ${g.n}${g.unp ? ` (${g.unp} no footprint)` : ''}`).join('\n') : ''}` : null); }}
          onMouseLeave={() => tip(null)}
          onClick={e => { const d = week(e); if (d) { tip(null); openOnFloor(d.d, c.id); } }} />
      </div>
    </div>
  );
}
