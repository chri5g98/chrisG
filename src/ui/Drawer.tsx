/* The item side panel: everything about one item, editable in place. */
import { useEffect, useRef } from 'react';
import { app, itemIn, useApp } from '../store/app';
import type { Item } from '../core/types';
import { s0, s1 } from '../core/plan';
import { SHAPES, shapeIconSVG, shapeLabel } from '../core/shapes';
import { byCodeCmp, dn, ds } from '../core/util';
import { Icon } from './Icon';
import { Area, In } from './fields';
import { Options, nextMoveDialog, splitDialog } from './dialogs';
import { addStage, applyField, deleteItem, duplicateItem, showOnFloor, startAfterParts, turnItem, useStandardStages } from './actions';

export function Drawer() {
  const a = useApp(); const P = a.P, V = a.V, id = a.drawer.id;
  const body = useRef<HTMLDivElement>(null);
  const it = id ? P.item(id) : undefined;
  useEffect(() => { if (id && !it) app.closeDrawer(); }, [id, it]);
  useEffect(() => {
    if (a.drawer.focusStage) setTimeout(() => body.current?.querySelector('#dStages')?.scrollIntoView({ block: 'nearest' }), 0);
  }, [a.drawer.focusStage]);
  if (!it) return null;
  const t = P.typ(it.type), kids = P.kidsOf(it.id), cr = P.crumbs(it);
  const preds = (it.pred || []).map(x => P.item(x)).filter(Boolean) as typeof kids;
  const follows = P.S.items.filter(o => (o.pred || []).includes(it.id));
  const dur = it.start && it.finish ? s1(it) - s0(it) + 1 : '';
  const f = (k: string) => (v: string) => applyField(it.id, k, v);
  const stageEdit = (sid: string, k: 'st' | 'start' | 'finish', v: string) => app.commit(d => {
    const sg = itemIn(d, it.id).stages.find(x => x.id === sid)!;
    if (k === 'start') { const keep = sg.start && sg.finish ? dn(sg.finish)! - dn(sg.start)! : 0; sg.start = v; if (v) sg.finish = ds(dn(v)! + keep); }
    else sg[k] = v;
    if (sg.start && sg.finish && dn(sg.finish)! < dn(sg.start)!) sg.finish = sg.start;
  });
  const close = () => { app.closeDrawer(); app.setView({ sel: null }); };
  return (
    <aside className="drawer" aria-label="Item details" key={it.id}>
      <header>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="lbl">{t.name} · {P.proj(it.proj).name}</div>
          <h2>{it.code || 'New item'}</h2>
          {cr.length ? <div className="crumbs">{cr.map(c => <span key={c.id}><button onClick={() => app.openItem(c.id)}>{c.code}</button> › </span>)}<span>{it.code}</span></div> : null}
        </div>
        <span style={{ alignSelf: 'center' }} dangerouslySetInnerHTML={{ __html: shapeIconSVG(P.shapeOf(it), P.colourOf(it, V.colour)) }} />
        <button className="btn icon" onClick={close} aria-label="Close"><Icon k="x" /></button>
      </header>
      <div className="body" ref={body}>
        <div className="warnbox">{P.probs(it.id).map((p, i) => <span key={i} className={`chip ${p.k === 'clash' ? 'late' : 'warn'}`}><Icon k="warn" />{p.t}</span>)}</div>
        <section className="dsec"><div className="fgrid">
          <div className="field"><label htmlFor="dCode">Code</label><In id="dCode" value={it.code} onCommit={f('code')} /></div>
          <div className="field"><label htmlFor="dProj">Project</label><select id="dProj" value={it.proj} onChange={e => f('proj')(e.target.value)}><Options list={P.S.projects} /></select></div>
          <div className="field span2"><label htmlFor="dName">Name</label><In id="dName" value={it.name} onCommit={f('name')} /></div>
          <div className="field"><label htmlFor="dType">Type</label><select id="dType" value={it.type} onChange={e => f('type')(e.target.value)}><Options list={P.S.types} /></select></div>
          <div className="field"><label htmlFor="dShape">Looks like</label><select id="dShape" value={it.shape} onChange={e => f('shape')(e.target.value)}><option value="">{shapeLabel(t.shape)} (type)</option>{SHAPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        </div></section>
        <section className="dsec"><h3>Where</h3><div className="fgrid">
          <div className="field"><label htmlFor="dArea">Area</label><select id="dArea" value={it.area} onChange={e => f('area')(e.target.value)}><Options list={P.areasSorted()} blank="Not assigned" /></select></div>
          <div className="field"><label htmlFor="dFp">Footprint</label><select id="dFp" value={it.fp} onChange={e => f('fp')(e.target.value)}>
            {!it.area ? <option value="">Choose an area first</option> : <><option value="">Not in a footprint</option>{P.fpsIn(it.area).map(fp => { const busy = P.takenBy(it, fp.id); return <option key={fp.id} value={fp.id}>{fp.code}{busy.length ? ' – taken by ' + busy.map(b => b.code).join(', ') : ' – free'}</option>; })}</>}
          </select></div>
        </div><div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => turnItem(it.id)} title="Shortcut R on the floor plan"><Icon k="rot" />Turn it round</button>
          <button className="btn sm" onClick={() => showOnFloor(it.id)} disabled={!it.start}><Icon k="floor" />Show on floor plan</button>
        </div></section>
        <section className="dsec"><h3>When</h3><div className="fgrid3">
          <div className="field"><label htmlFor="dS">Start</label><In id="dS" type="date" value={it.start} onCommit={f('start')} /></div>
          <div className="field"><label htmlFor="dF">Finish</label><In id="dF" type="date" value={it.finish} onCommit={f('finish')} /></div>
          <div className="field"><label htmlFor="dD">Days</label><In id="dD" type="number" min={1} value={dur} onCommit={f('days')} /></div>
        </div>{kids.length ? <div className="row"><button className="btn sm" onClick={() => startAfterParts(it.id)} title="Keep its length; stages move with it">Start when its parts are done</button></div> : null}</section>
        <section className="dsec"><h3>Build tree</h3>
          <div className="field"><label htmlFor="dPar">Joins into</label><select id="dPar" value={it.parent} onChange={e => f('parent')(e.target.value)}><option value="">Nothing – it is a top level item</option>{P.parentChoices(it).map(o => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}</select></div>
          <div className="field"><label>Made from <span className="muted small">{kids.length ? `${kids.length} part${kids.length > 1 ? 's' : ''}` : ''}</span></label>
            <div className="chips">{kids.length ? kids.map(k => <span key={k.id} className={`fchip st-${P.stateOn(k, V.date)}`}><button className="lnk" onClick={() => app.openItem(k.id)} title={`Open ${k.code}`}>{k.code}</button><button aria-label={`Unlink ${k.code}`} onClick={() => app.commit(d => { itemIn(d, k.id).parent = ''; }, `${k.code} no longer joins ${it.code}`)}>×</button></span>) : <span className="small muted">No parts</span>}</div>
            <div className="row" style={{ gap: 6 }}>
              <select className="ctl" aria-label="Add a part" style={{ flex: '1 1 160px' }} value="" onChange={e => { const v = e.target.value; if (v) app.commit(d => { itemIn(d, v).parent = it.id; }, `${P.item(v)!.code} now joins ${it.code}`); }}><option value="">Add an existing part…</option>{P.partChoices(it).map(o => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}</select>
              <button className="btn sm" onClick={() => splitDialog(it.id)}><Icon k="split" />Split into parts…</button>
              <button className="btn sm" disabled={!kids.length && !it.parent} onClick={() => { app.setView({ vroot: P.rootOf(it).id, page: 'vessel' }); app.openItem(it.id); }}><Icon k="ship" />Vessel build</button>
            </div>
          </div>
        </section>
        <section className="dsec" id="dStages"><h3>Stages <span className="muted small">what happens while it is here</span></h3>
          {it.stages.length ? <table className="t stg"><tbody>{it.stages.map(sg => (
            <tr key={sg.id} className={sg.id === a.drawer.focusStage ? 'sel' : ''}>
              <td><span className="sw" style={{ ['--c' as string]: P.stype(sg.st).color }} /></td>
              <td><select className="cell" aria-label="Stage" value={sg.st} onChange={e => stageEdit(sg.id, 'st', e.target.value)}><Options list={P.S.stypes} /></select></td>
              <td><In className="cell d" type="date" aria-label="Stage start" value={sg.start} onCommit={v => stageEdit(sg.id, 'start', v)} /></td>
              <td><In className="cell d" type="date" aria-label="Stage finish" value={sg.finish} onCommit={v => stageEdit(sg.id, 'finish', v)} /></td>
              <td><button className="btn icon" aria-label="Remove stage" onClick={() => app.commit(d => { const x = itemIn(d, it.id); x.stages = x.stages.filter(s => s.id !== sg.id); })}><Icon k="x" /></button></td>
            </tr>))}</tbody></table> : <span className="small muted">No stages yet.</span>}
          <div className="row" style={{ gap: 6 }}>
            <select className="ctl" aria-label="Add a stage" value="" onChange={e => { if (e.target.value) addStage(it.id, e.target.value); }}><option value="">Add a stage…</option><Options list={P.S.stypes} /></select>
            <button className="btn sm" disabled={!t.std.length || !it.start} onClick={() => useStandardStages(it.id)} title={t.std.map(x => P.stype(x.st).name + ' ' + x.pct + '%').join(', ') || 'Set standard stages for this type on the Data page'}>Use standard stages</button>
          </div>
        </section>
        <SizeSection it={it} f={f} />
        <section className="dsec"><h3>Comes after</h3>
          <div className="chips">{preds.length ? preds.map(p => <span key={p.id} className="fchip">{p.code}<button aria-label="Remove" onClick={() => app.commit(d => { const x = itemIn(d, it.id); x.pred = x.pred.filter(q => q !== p.id); })}>×</button></span>) : <span className="small muted">Nothing</span>}</div>
          <select className="ctl" style={{ width: '100%' }} aria-label="Add an item it follows" value="" onChange={e => { const v = e.target.value; if (v) app.commit(d => { const x = itemIn(d, it.id); x.pred = [...x.pred, v]; }); }}>
            <option value="">Add an item it follows…</option>{P.S.items.filter(o => o.id !== it.id && !it.pred.includes(o.id)).sort(byCodeCmp).map(o => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}
          </select>
          {follows.length ? <span className="hint">Followed by {follows.map(x => x.code).join(', ')}</span> : null}
        </section>
        <section className="dsec"><div className="field"><label htmlFor="dNote">Note</label><Area id="dNote" value={it.note} onCommit={f('note')} /></div></section>
      </div>
      <footer>
        <button className="btn sm" onClick={() => nextMoveDialog(it.id)} title="A new item for the same thing in the next area, starting the day after this one finishes"><Icon k="move" />Add next move</button>
        <button className="btn sm" onClick={() => duplicateItem(it.id)}><Icon k="copy" />Duplicate</button>
        <span className="grow" />
        <button className="btn sm danger" onClick={() => deleteItem(it.id)}><Icon k="trash" />Delete</button>
      </footer>
    </aside>
  );
}

/* opens by itself when the item has a size or weight, then stays as the person leaves it */
function SizeSection({ it, f }: { it: Item; f: (k: string) => (v: string) => void }) {
  const open = useRef(!!(it.l || it.w || it.wt));
  return (
    <details className="dsec" open={open.current}><summary><h3>Size and weight</h3></summary><div className="fgrid3">
      <div className="field"><label htmlFor="dL">Length m</label><In id="dL" type="number" step={0.1} min={0} value={it.l} onCommit={f('l')} placeholder="optional" /></div>
      <div className="field"><label htmlFor="dW">Width m</label><In id="dW" type="number" step={0.1} min={0} value={it.w} onCommit={f('w')} placeholder="optional" /></div>
      <div className="field"><label htmlFor="dWt">Weight t</label><In id="dWt" type="number" step={0.1} value={it.wt} onCommit={f('wt')} placeholder="optional" /></div>
    </div><span className="hint">Checked against the footprint size and the area's crane.</span></details>
  );
}
