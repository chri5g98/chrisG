/* Areas & footprints, Data (projects, types, stages, Excel, backups) and Settings. */
import { useRef } from 'react';
import { app, useApp } from '../store/app';
import type { Area } from '../core/types';
import { frameOf, ptsDeg } from '../core/geometry';
import { onDay } from '../core/plan';
import { normalise } from '../core/normalise';
import { blankState, exampleState } from '../core/example';
import { PAL, SHAPES, shapeIconSVG } from '../core/shapes';
import { download, ds, n0, r1, TODAY, uid } from '../core/util';
import { shared } from '../store/shared';
import { Icon } from '../ui/Icon';
import { confirmBox } from '../ui/Overlays';
import { In } from '../ui/fields';
import { exportXlsx, removeFootprint, setFpAngle, sizeFp } from '../ui/actions';
import { importFile, stdDialog } from '../ui/dialogs';
import { delSelection } from './FloorPlan';
import { setPageKeys } from '../ui/keys';

const KINDS = ['Shed', 'Hall', 'Outdoor', 'Quay', 'Store', 'Other'];

export function Areas() {
  const a = useApp(); const P = a.P, V = a.V, AS = P.areasSorted(), fa = V.fpArea || '', m = P.mpu();
  setPageKeys(null);
  const FP = P.S.footprints.filter(f => !fa || f.area === fa).sort((x, y) => (P.area(x.area)?.ord ?? 99) - (P.area(y.area)?.ord ?? 99) || x.code.localeCompare(y.code, 'en', { numeric: true }));
  const edArea = (id: string, fn: (x: Area) => void) => app.commit(d => fn(d.areas.find(x => x.id === id)!));
  const move = (id: string, dir: number) => app.commit(d => { const L = [...d.areas].sort((x, y) => x.ord - y.ord), i = L.findIndex(x => x.id === id), j = i + dir; [L[i], L[j]] = [L[j], L[i]]; L.forEach((x, k) => (x.ord = k)); });
  const toFloor = (esel: { kind: 'fp' | 'area'; id: string }, tool: 'select' | 'area') => { app.setEdit(true); app.setEsel(esel); app.setView({ tool, page: 'floor' }); };
  return (
    <>
      <div className="page-head">
        <div><h1>Areas &amp; footprints</h1><p>Each hall or area holds footprints; each footprint takes one item at a time, so an area's capacity is its number of footprints. Draw outlines and footprints on the floor plan with <b>Edit layout</b>; tidy names and details here.</p></div>
        <div className="tb">
          <button className="btn sm" onClick={() => { const ar: Area = { id: uid('a'), code: 'A' + (P.S.areas.length + 1), name: 'New area', kind: 'Shed', color: PAL[P.S.areas.length % PAL.length], crane: 0, ord: P.S.areas.length, pts: [] }; app.commit(d => { d.areas.push(ar); }, 'Area added – draw its outline and footprints on the floor plan'); }}><Icon k="plus" />Add area</button>
          <button className="btn sm primary" onClick={() => { app.setEdit(true); app.go('floor'); }}><Icon k="edit" />Edit layout</button>
        </div>
      </div>
      <div className="panel"><div className="panel-h"><h2>Areas</h2></div><div className="tbl-wrap"><table className="t">
        <thead><tr><th /><th>Colour</th><th>Code</th><th>Name</th><th>Kind</th><th className="r" title="Heaviest lift; 0 = not checked">Crane t</th><th className="r">Footprints</th><th>Outline</th><th className="r">Items</th><th /></tr></thead>
        <tbody>{AS.length ? AS.map((x, i) => (
          <tr key={x.id}>
            <td style={{ whiteSpace: 'nowrap' }}><button className="btn icon" disabled={!i} aria-label="Move up" onClick={() => move(x.id, -1)}>↑</button><button className="btn icon" disabled={i === AS.length - 1} aria-label="Move down" onClick={() => move(x.id, 1)}>↓</button></td>
            <td><In type="color" value={x.color} aria-label="Colour" onCommit={v => edArea(x.id, z => { z.color = v; })} /></td>
            <td><In className="cell" value={x.code} style={{ width: 70 }} aria-label="Code" onCommit={v => edArea(x.id, z => { z.code = v; })} /></td>
            <td><In className="cell" value={x.name} style={{ minWidth: 150 }} aria-label="Name" onCommit={v => edArea(x.id, z => { z.name = v; })} /></td>
            <td><select className="cell" aria-label="Kind" value={x.kind} onChange={e => edArea(x.id, z => { z.kind = e.target.value; })}>{KINDS.map(k => <option key={k}>{k}</option>)}</select></td>
            <td className="r"><In className="cell n" type="number" min={0} value={x.crane || 0} style={{ width: 62 }} aria-label="Crane tonnes" onCommit={v => edArea(x.id, z => { z.crane = n0(v); })} /></td>
            <td className="r num"><b>{P.capOf(x.id)}</b></td>
            <td>{x.pts.length ? <span className="chip good">drawn</span> : <button className="btn sm" onClick={() => { toFloor({ kind: 'area', id: x.id }, 'area'); app.toast(`Draw the outline of ${x.name} on the drawing`); }}>Draw it</button>}</td>
            <td className="r num">{P.S.items.filter(it => it.area === x.id).length}</td>
            <td><button className="btn icon" aria-label="Delete" onClick={() => delSelection({ kind: 'area', id: x.id })}><Icon k="trash" /></button></td>
          </tr>
        )) : <tr><td colSpan={10}><div className="empty">No areas yet. Use Edit layout to draw the fab shed first.</div></td></tr>}</tbody>
      </table></div></div>
      <div className="panel">
        <div className="panel-h"><div><h2>Footprints</h2><p>{P.S.footprints.length} in total. Type a length, width or angle to resize or turn one (it becomes a rectangle round its centre). Sizes need the drawing's scale.</p></div>
          <select className="ctl" aria-label="Show footprints in" value={fa} onChange={e => app.setView({ fpArea: e.target.value })}><option value="">All areas</option>{AS.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="tbl-wrap" style={{ maxHeight: '60vh', overflow: 'auto' }}><table className="t">
          <thead><tr><th>Code</th><th>Area</th><th>Kind</th><th className="r">Length m</th><th className="r">Width m</th><th className="r">Angle °</th><th>Note</th><th className="r">Items planned</th><th>In use now</th><th /></tr></thead>
          <tbody>{FP.length ? FP.map(f => {
            const now = P.S.items.find(i => i.fp === f.id && onDay(i, TODAY)), F = frameOf(f.pts);
            const ed = (fn: (x: typeof f) => void) => app.commit(d => fn(d.footprints.find(x => x.id === f.id)!));
            return (
              <tr key={f.id}>
                <td><In className="cell" value={f.code} style={{ width: 100 }} aria-label="Code" onCommit={v => ed(x => { x.code = v; })} /></td>
                <td><select className="cell" aria-label="Area" value={f.area} onChange={e => app.commit(d => { const x = d.footprints.find(z => z.id === f.id)!; x.area = e.target.value; d.items.forEach(i => { if (i.fp === f.id) i.area = x.area; }); })}>{AS.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
                <td><select className="cell" aria-label="Kind" value={f.kind} onChange={e => ed(x => { x.kind = e.target.value; })}><option>Build</option><option>Laydown</option></select></td>
                <td className="r"><In className="cell n" type="number" step={0.1} value={m && F ? r1(F.L * m) : ''} disabled={!m} title={m ? undefined : 'Set the drawing scale first'} aria-label="Length" onCommit={v => { const n = n0(v); if (n > 0) sizeFp(f.id, n, null, null); }} /></td>
                <td className="r"><In className="cell n" type="number" step={0.1} value={m && F ? r1(F.W * m) : ''} disabled={!m} aria-label="Width" onCommit={v => { const n = n0(v); if (n > 0) sizeFp(f.id, null, n, null); }} /></td>
                <td className="r"><In className="cell n" type="number" step={1} value={F ? ptsDeg(f.pts) : ''} aria-label="Angle" style={{ width: 60 }} onCommit={v => setFpAngle(f.id, n0(v))} /></td>
                <td><In className="cell" value={f.note} aria-label="Note" onCommit={v => ed(x => { x.note = v; })} /></td>
                <td className="r num">{P.S.items.filter(i => i.fp === f.id).length}</td>
                <td>{now ? now.code : <span className="muted xs">free</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}><button className="btn icon" title="Show on the floor plan" onClick={() => toFloor({ kind: 'fp', id: f.id }, 'select')}><Icon k="target" /></button><button className="btn icon" aria-label="Delete" onClick={() => { const n = P.S.items.filter(i => i.fp === f.id).length; app.commit(d => removeFootprint(d, f.id), `${f.code} deleted${n ? ` – ${n} item${n > 1 ? 's' : ''} now need a footprint` : ''}`); }}><Icon k="trash" /></button></td>
              </tr>
            );
          }) : <tr><td colSpan={10}><div className="empty">No footprints yet. Draw them on the floor plan with Edit layout.</div></td></tr>}</tbody>
        </table></div>
      </div>
    </>
  );
}

export function Data() {
  const a = useApp(); const P = a.P;
  const xl = useRef<HTMLInputElement>(null), js = useRef<HTMLInputElement>(null);
  setPageKeys(null);
  const restore = async (f: File) => {
    try {
      const st = normalise(JSON.parse(await f.text()));
      if (!Array.isArray(st.items)) throw new Error('not an FMAREA backup');
      confirmBox('Restore from backup', `Replace everything with ${f.name} (${st.items.length} items, ${st.areas.length} areas, ${st.footprints.length} footprints)? You can undo this.`, 'Restore', () => app.commit(d => { Object.assign(d, st, { _meta: d._meta }); }, 'Restored'));
    } catch (er) { app.toast('Could not read that file: ' + (er as Error).message); }
  };
  return (
    <>
      <div className="page-head"><div><h1>Data</h1><p>Projects, item types and their standard stages, stage types, Excel and backups.</p></div></div>
      <div className="grid2 even">
        <div className="panel"><div className="panel-h"><div><h2>Projects</h2><p>Each project's colour is used on the floor plan, the plan and the charts.</p></div>
          <button className="btn sm" onClick={() => app.commit(d => { d.projects.push({ id: uid('p'), code: String(d.projects.length + 1).padStart(3, '0'), name: 'New project', color: PAL[d.projects.length % PAL.length] }); })}><Icon k="plus" />Add</button></div>
          <div className="tbl-wrap"><table className="t"><thead><tr><th>Colour</th><th>Code</th><th>Name</th><th className="r">Items</th><th /></tr></thead><tbody>
            {P.S.projects.map(p => {
              const ed = (fn: (x: typeof p) => void) => app.commit(d => fn(d.projects.find(x => x.id === p.id)!));
              const n = P.S.items.filter(i => i.proj === p.id).length;
              return (<tr key={p.id}>
                <td><In type="color" value={p.color} aria-label="Colour" onCommit={v => ed(x => { x.color = v; })} /></td>
                <td><In className="cell" value={p.code} style={{ width: 70 }} aria-label="Code" onCommit={v => ed(x => { x.code = v; })} /></td>
                <td><In className="cell" value={p.name} aria-label="Name" onCommit={v => ed(x => { x.name = v; })} /></td>
                <td className="r num">{n}</td>
                <td><button className="btn icon" aria-label="Delete" onClick={() => confirmBox('Delete project', `Delete ${p.name}${n ? ` and its ${n} items` : ''}?`, 'Delete', () => app.commit(d => { d.projects = d.projects.filter(x => x.id !== p.id); const gone = new Set(d.items.filter(i => i.proj === p.id).map(i => i.id)); d.items = d.items.filter(i => !gone.has(i.id)); d.items.forEach(i => { i.pred = i.pred.filter(x => !gone.has(x)); if (gone.has(i.parent)) i.parent = ''; }); }, 'Project deleted'), true)}><Icon k="trash" /></button></td>
              </tr>);
            })}
          </tbody></table></div></div>
        <div className="panel"><div className="panel-h"><div><h2>Stage types</h2><p>What can happen to an item while it sits in its footprint.</p></div>
          <button className="btn sm" onClick={() => app.commit(d => { d.stypes.push({ id: uid('s'), name: 'New stage', color: PAL[d.stypes.length % PAL.length] }); })}><Icon k="plus" />Add</button></div>
          <div className="tbl-wrap"><table className="t"><thead><tr><th>Colour</th><th>Stage</th><th className="r">Used</th><th /></tr></thead><tbody>
            {P.S.stypes.map(x => {
              const ed = (fn: (y: typeof x) => void) => app.commit(d => fn(d.stypes.find(y => y.id === x.id)!));
              const n = P.S.items.reduce((c, i) => c + i.stages.filter(s => s.st === x.id).length, 0);
              return (<tr key={x.id}>
                <td><In type="color" value={x.color} aria-label="Colour" onCommit={v => ed(y => { y.color = v; })} /></td>
                <td><In className="cell" value={x.name} aria-label="Name" onCommit={v => ed(y => { y.name = v; })} /></td>
                <td className="r num">{n}</td>
                <td><button className="btn icon" aria-label="Delete" onClick={() => confirmBox('Delete stage type', `Delete ${x.name}${n ? ` and the ${n} stages that use it` : ''}?`, 'Delete', () => app.commit(d => { d.stypes = d.stypes.filter(y => y.id !== x.id); d.items.forEach(i => (i.stages = i.stages.filter(s => s.st !== x.id))); d.types.forEach(t => (t.std = t.std.filter(s => s.st !== x.id))); }, 'Stage type deleted'), true)}><Icon k="trash" /></button></td>
              </tr>);
            })}
          </tbody></table></div></div>
      </div>
      <div className="panel"><div className="panel-h"><div><h2>Item types</h2><p>How each type looks on the floor plan and the stages it gets by default, as a share of its time in the area.</p></div>
        <button className="btn sm" onClick={() => app.commit(d => { d.types.push({ id: uid('t'), name: 'New type', color: PAL[(d.types.length + 3) % PAL.length], shape: 'box', std: [] }); })}><Icon k="plus" />Add</button></div>
        <div className="tbl-wrap"><table className="t"><thead><tr><th>Colour</th><th>Name</th><th>Looks like</th><th>Standard stages</th><th className="r">Items</th><th /></tr></thead><tbody>
          {P.S.types.map(t => {
            const ed = (fn: (y: typeof t) => void) => app.commit(d => fn(d.types.find(y => y.id === t.id)!));
            return (<tr key={t.id}>
              <td><In type="color" value={t.color} aria-label="Colour" onCommit={v => ed(y => { y.color = v; })} /></td>
              <td><In className="cell" value={t.name} aria-label="Name" onCommit={v => ed(y => { y.name = v; })} /></td>
              <td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><span dangerouslySetInnerHTML={{ __html: shapeIconSVG(t.shape, t.color) }} /><select className="cell" aria-label="Looks like" value={t.shape} onChange={e => ed(y => { y.shape = e.target.value; })}>{SHAPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div></td>
              <td><button className="btn sm ghost" style={{ textAlign: 'left', whiteSpace: 'normal' }} onClick={() => stdDialog(t)}>{t.std.length ? t.std.map((x, i) => <span key={i}>{i ? ' · ' : ''}<span className="sw" style={{ ['--c' as string]: P.stype(x.st).color }} /> {P.stype(x.st).name} {x.pct}%</span>) : 'None – set them'}</button></td>
              <td className="r num">{P.S.items.filter(i => i.type === t.id).length}</td>
              <td><button className="btn icon" aria-label="Delete" onClick={() => { if (P.S.items.some(i => i.type === t.id)) { app.toast('Move its items to another type first'); return; } app.commit(d => { d.types = d.types.filter(x => x.id !== t.id); }); }}><Icon k="trash" /></button></td>
            </tr>);
          })}
        </tbody></table></div></div>
      <div className="grid2 even">
        <div className="panel"><div className="panel-h"><div><h2>Excel</h2><p>Export everything, change it in Excel, and import it back. Rows match on ID, then Code. You see what will change before anything is saved.</p></div></div>
          <div className="row" style={{ padding: '14px 16px' }}>
            <button className="btn" onClick={() => exportXlsx()}><Icon k="xl" />Export to Excel</button>
            <button className="btn" onClick={() => exportXlsx(true)}>Download template</button>
            <button className="btn primary" onClick={() => xl.current?.click()}>Import from Excel…</button>
            <input type="file" ref={xl} accept=".xlsx,.csv" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importFile(f); }} />
          </div></div>
        <div className="panel"><div className="panel-h"><div><h2>Backup</h2><p>A complete copy of the data, drawing included, as one file.</p></div></div>
          <div className="row" style={{ padding: '14px 16px' }}>
            <button className="btn" onClick={() => download(new Blob([JSON.stringify(app.S)], { type: 'application/json' }), `FMAREA-backup-${ds(TODAY)}.json`)}>Download backup</button>
            <button className="btn" onClick={() => js.current?.click()}>Restore from backup…</button>
            <input type="file" ref={js} accept=".json" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) restore(f); }} />
          </div></div>
      </div>
    </>
  );
}

export function Settings() {
  const a = useApp(); const S = a.S, V = a.V;
  setPageKeys(null);
  const replaceWith = (st: typeof S, msg: string) => { app.commit(d => { Object.assign(d, st, { _meta: d._meta }); }, msg); };
  return (
    <>
      <div className="page-head"><div><h1>Settings</h1></div></div>
      <div className="grid2 even">
        <div className="panel"><div className="panel-h"><h2>You</h2></div><div style={{ padding: '14px 16px' }} className="field">
          <label htmlFor="sName">Your name</label><In id="sName" value={V.name} placeholder="Shown to colleagues on your saves" onCommit={v => app.setView({ name: v.trim() })} /><span className="hint">Kept in this browser.</span>
        </div></div>
        <div className="panel"><div className="panel-h"><div><h2>Shared file</h2><p>Keep FMAREA-data.json in a SharePoint library synced with OneDrive so everyone plans on the same data. Edge or Chrome.</p></div></div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shared.status === 'shared' ? (
              <>
                <div className="note"><Icon k="share" /><span>Connected to <b>{shared.name}</b>. Changes save automatically; colleagues' changes arrive within about 15 seconds of OneDrive syncing them.</span></div>
                <div className="row"><button className="btn" onClick={() => shared.check()}>Check now</button><button className="btn" onClick={() => shared.pick(false)}>Open a different file…</button><button className="btn ghost" onClick={() => shared.disconnect()}>Stop sharing in this browser</button></div>
              </>
            ) : (
              <>
                <div className="row"><button className="btn primary" onClick={() => shared.pick(true)}>Create the shared file…</button><button className="btn" onClick={() => shared.pick(false)}>Open the shared file…</button></div>
                <span className="hint">{shared.fsOK() ? 'The first person creates it in the synced library folder; everyone else opens it.' : 'This browser cannot open shared files – use Edge or Chrome on a PC.'}</span>
              </>
            )}
          </div></div>
        <div className="panel"><div className="panel-h"><h2>Planning rules</h2></div><div className="fgrid" style={{ padding: '14px 16px' }}>
          <div className="field"><label htmlFor="sLook">"Coming" look-ahead days</label><In type="number" min={1} id="sLook" value={S.set.look} onCommit={v => app.commit(d => { d.set.look = Math.max(1, n0(v)); })} /><span className="hint">Free footprints on the floor plan show what arrives within this many days.</span></div>
        </div></div>
        <div className="panel"><div className="panel-h"><div><h2>Start again</h2><p>Both can be undone.</p></div></div><div className="row" style={{ padding: '14px 16px' }}>
          <button className="btn" onClick={() => confirmBox('Load the example', 'Replace the current data with the example yard?', 'Load example', () => { replaceWith(normalise(exampleState()), 'Example loaded'); app.setView({ hide: [] }); })}>Load the example yard</button>
          <button className="btn danger" onClick={() => confirmBox('Blank plan', 'Remove every area, footprint and item and start from nothing? Then upload your yard drawing in Edit layout.', 'Start blank', () => replaceWith(normalise(blankState()), 'Blank plan – upload your drawing on the floor plan'), true)}>Start with a blank plan</button>
        </div></div>
      </div>
    </>
  );
}
