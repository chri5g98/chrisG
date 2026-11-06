/* Items: every item in a table you type straight into, like a spreadsheet.
   Enter moves down, Tab moves across, and a block of cells pasted from Excel fills the rows below. */
import { useRef, useState } from 'react';
import { app, useApp } from '../store/app';
import type { Item } from '../core/types';
import { itemMatch } from '../core/rows';
import { s0, s1 } from '../core/plan';
import { fillStages } from '../core/example';
import { shiftStages } from '../core/excel';
import { SHAPES } from '../core/shapes';
import { byCodeCmp, ds, n0, trimTo } from '../core/util';
import { Icon } from '../ui/Icon';
import { confirmBox } from '../ui/Overlays';
import { In } from '../ui/fields';
import { Options, addManyDialog, newVesselDialog, setParentMany } from '../ui/dialogs';
import { deleteItems, newItem, setItemField } from '../ui/actions';
import { FilterChips, filterPop } from './PlanGantt';
import { setPageKeys } from '../ui/keys';

const ICOLS = ['code', 'name', 'proj', 'type', 'shape', 'parent', 'area', 'fp', 'start', 'finish', 'days', 'wt'];

export function Items() {
  const a = useApp(); const P = a.P, V = a.V, tree = V.itemsView === 'tree';
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [shift, setShift] = useState('');
  const body = useRef<HTMLTableSectionElement>(null);
  setPageKeys(null);

  const rows: [Item, number][] = (() => {
    const L = P.S.items.filter(it => itemMatch(P, V.f, it));
    if (tree) {
      const inL = new Set(L.map(i => i.id)), out: [Item, number][] = [];
      const walk = (it: Item, lvl: number) => { if (inL.has(it.id)) out.push([it, lvl]); if (!V.ishut.includes(it.id)) P.kidsOf(it.id).forEach(k => walk(k, lvl + 1)); };
      P.S.items.filter(i => !i.parent || !P.item(i.parent)).sort((x, y) => P.proj(x.proj).name.localeCompare(P.proj(y.proj).name) || (P.kidsOf(y.id).length ? 1 : 0) - (P.kidsOf(x.id).length ? 1 : 0) || byCodeCmp(x, y)).forEach(t => walk(t, 0));
      return out;
    }
    const k = V.tblSort || 'start', dir = V.tblDir || 1;
    const val: Record<string, (i: Item) => string | number> = { code: i => i.code || '', name: i => i.name || '', proj: i => P.proj(i.proj).name, type: i => P.typ(i.type).name, area: i => P.area(i.area)?.name || '~', fp: i => P.fpOf(i.fp)?.code || '~', start: i => (i.start ? s0(i) : 1e9), finish: i => (i.finish ? s1(i) : 1e9), wt: i => +(i.wt || 0), prob: i => -P.probs(i.id).length, parent: i => P.parentOf(i)?.code || '~' };
    const f = val[k] || val.start;
    return L.sort((x, y) => { const p = f(x), q = f(y); return (p < q ? -1 : p > q ? 1 : 0) * dir || byCodeCmp(x, y); }).map(i => [i, 0]);
  })();
  const ids = new Set(rows.map(([i]) => i.id));
  const selected = new Set([...sel].filter(x => ids.has(x)));
  const th = (key: string, l: string, cls = '') => tree ? <th className={cls}>{l}</th> :
    <th className={cls} style={{ cursor: 'pointer' }} onClick={() => app.setView(V.tblSort === key ? { tblDir: -(V.tblDir || 1) } : { tblSort: key, tblDir: 1 })}>{l}{V.tblSort === key ? (V.tblDir > 0 ? ' ▲' : ' ▼') : ''}</th>;
  const each = (fn: (it: Item) => void, msg?: string) => app.commit(d => d.items.filter(i => selected.has(i.id)).forEach(fn), msg);

  /* spreadsheet keys: Enter / Shift+Enter move down / up in the same column */
  const onKey = (e: React.KeyboardEvent) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (!el.dataset?.f || e.key !== 'Enter' || e.altKey) return;
    e.preventDefault();
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const trs = [...body.current!.querySelectorAll('tr[data-i]')], i = trs.indexOf(el.closest('tr')!), next = trs[i + (e.shiftKey ? -1 : 1)];
    const n = next?.querySelector<HTMLInputElement>(`[data-f="${el.dataset.f}"]`);
    if (n) { n.focus(); n.select?.(); n.scrollIntoView({ block: 'nearest' }); }
  };
  /* paste a block of cells copied from Excel */
  const onPaste = (e: React.ClipboardEvent) => {
    const el = e.target as HTMLElement; if (!el.dataset?.f) return;
    const txt = e.clipboardData?.getData('text') || '';
    if (!/[\t\n]/.test(txt.trim())) return;
    e.preventDefault();
    const grid = txt.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(r => r.split('\t'));
    const trs = [...body.current!.querySelectorAll<HTMLElement>('tr[data-i]')], r0 = trs.indexOf(el.closest('tr')!), c0 = ICOLS.indexOf(el.dataset.f);
    app.beginGesture();
    let n = 0;
    grid.forEach((row, ri) => {
      const tr = trs[r0 + ri]; if (!tr) return;
      row.forEach((v, ci) => { const col = ICOLS[c0 + ci]; if (!col) return; const before = app.undoStack.length; if (setItemField(tr.dataset.i!, col, v.trim())) { n++; if (app.undoStack.length > before) app.undoStack.pop(); } });
    });
    app.endGesture();
    app.toast(n ? `Pasted into ${n} cell${n > 1 ? 's' : ''}` : 'Nothing changed', { undo: !!n });
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Items</h1><p>Everything that takes a footprint. Type straight into the table: Enter moves down, Tab moves across, and you can paste a block of cells from Excel. The floor plan, plan and capacity follow as you go.</p></div>
        <div className="tb">
          <div className="seg"><button aria-pressed={!tree} onClick={() => app.setView({ itemsView: 'list' })}>List</button><button aria-pressed={tree} onClick={() => app.setView({ itemsView: 'tree' })}><Icon k="tree" /> Build tree</button></div>
          <button className="btn sm" onClick={e => filterPop(e.currentTarget)}><Icon k="filter" />Filter</button>
          <button className="btn sm" onClick={addManyDialog}><Icon k="plus" />Add many</button>
          <button className="btn sm" onClick={newVesselDialog}><Icon k="ship" />New vessel…</button>
          <button className="btn sm primary" onClick={() => newItem()}><Icon k="plus" />Add item</button>
        </div>
      </div>
      <FilterChips />
      <div className="panel">
        {selected.size ? (
          <div className="bulk"><b>{selected.size} selected</b>
            <select className="ctl" aria-label="Move to area" value="" onChange={e => { const v = e.target.value; if (v) each(it => { it.area = v; it.fp = ''; }, `Moved to ${P.area(v)!.name} – give them footprints on the floor plan`); }}><option value="">Move to area…</option><Options list={P.areasSorted().map(x => ({ id: x.id, name: x.name }))} /></select>
            <select className="ctl" aria-label="Set project" value="" onChange={e => { const v = e.target.value; if (v) each(it => { it.proj = v; }); }}><option value="">Set project…</option><Options list={P.S.projects.map(x => ({ id: x.id, name: x.name }))} /></select>
            <select className="ctl" aria-label="Set type" value="" onChange={e => { const v = e.target.value; if (v) each(it => { it.type = v; }); }}><option value="">Set type…</option><Options list={P.S.types} /></select>
            <In className="ctl" list="dlCodes" placeholder="Joins into…" style={{ width: 120 }} aria-label="Joins into" value="" onCommit={(v, el) => { if (v.trim()) setParentMany(selected, v); el.value = ''; }} />
            <span>Shift</span><input className="ctl" type="number" style={{ width: 70 }} placeholder="days" aria-label="Days to shift" value={shift} onChange={e => setShift(e.target.value)} />
            <button className="btn sm" onClick={() => { const n = Math.round(n0(shift)); if (n) each(it => { if (it.start) { it.start = ds(s0(it) + n); it.finish = ds(s1(it) + n); shiftStages(it, n); } }, `Shifted ${n} days`); }}>Shift</button>
            <button className="btn sm" onClick={() => app.commit(d => d.items.filter(i => selected.has(i.id)).forEach(i => fillStages(i, d)), 'Standard stages set')}>Standard stages</button>
            <button className="btn sm" onClick={() => each(it => { it.fp = ''; })}>Take out of footprint</button>
            <button className="btn sm danger" onClick={() => confirmBox('Delete items', `Delete ${selected.size} items? You can undo this.`, 'Delete', () => { deleteItems(new Set(selected), `${selected.size} deleted`); setSel(new Set()); }, true)}><Icon k="trash" />Delete</button>
            <button className="btn sm ghost" onClick={() => setSel(new Set())}>Clear</button>
          </div>
        ) : null}
        <div className="tbl-wrap grid-wrap" style={{ maxHeight: 'calc(100vh - 250px)', overflow: 'auto' }}>
          <table className="t grid">
            <thead><tr>
              <th className="cb"><input type="checkbox" aria-label="Select all" checked={!!selected.size && selected.size === rows.length} onChange={e => setSel(e.target.checked ? new Set(rows.map(([i]) => i.id)) : new Set())} /></th>
              {th('code', 'Code')}{th('name', 'Name')}{th('proj', 'Project')}{th('type', 'Type')}<th>Looks like</th>{th('parent', 'Joins into')}{th('area', 'Area')}{th('fp', 'Footprint')}{th('start', 'Start')}{th('finish', 'Finish')}<th className="r">Days</th><th className="r">Parts</th><th className="r">Stages</th>{th('wt', 'Weight t', 'r')}{th('prob', 'Problems')}<th />
            </tr></thead>
            <tbody ref={body} onKeyDown={onKey} onPaste={onPaste}>
              {rows.length ? rows.map(([it, lvl]) => <ItemRow key={it.id} it={it} lvl={lvl} tree={tree} checked={selected.has(it.id)} onCheck={c => { const s = new Set(selected); if (c) s.add(it.id); else s.delete(it.id); setSel(s); }} />)
                : <tr><td colSpan={17}><div className="empty">No items{Object.values(V.f).some(Boolean) ? ' match the filter' : ' yet'}.</div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="pager"><span>{rows.length} items</span></div>
      </div>
    </>
  );
}

function ItemRow({ it, lvl, tree, checked, onCheck }: { it: Item; lvl: number; tree: boolean; checked: boolean; onCheck: (c: boolean) => void }) {
  const a = useApp(); const P = a.P, V = a.V;
  const set = (f: string) => (v: string) => setItemField(it.id, f, v);
  const kids = P.kidsOf(it.id).length, p = P.probs(it.id);
  return (
    <tr data-i={it.id} className={`${checked ? 'sel' : ''} ${tree && kids ? 'tparent' : ''}`}>
      <td className="cb"><input type="checkbox" checked={checked} aria-label={`Select ${it.code}`} onChange={e => onCheck(e.target.checked)} /></td>
      <td className="code-c" style={tree ? { paddingLeft: 8 + lvl * 18 } : undefined}><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
        {tree ? kids ? <button className="tg" aria-label="Show or hide parts" onClick={() => app.setView({ ishut: V.ishut.includes(it.id) ? V.ishut.filter(x => x !== it.id) : [...V.ishut, it.id] })}>{V.ishut.includes(it.id) ? '▸' : '▾'}</button> : <span className="tg" /> : null}
        <In className="cell" data-f="code" value={it.code} style={{ width: tree ? 120 : 108 }} aria-label="Code" onCommit={set('code')} />
      </div></td>
      <td><In className="cell" data-f="name" value={it.name} style={{ minWidth: 160 }} aria-label="Name" onCommit={set('name')} /></td>
      <td><select className="cell" data-f="proj" aria-label="Project" value={it.proj} onChange={e => set('proj')(e.target.value)}><Options list={P.S.projects.map(x => ({ id: x.id, name: x.name }))} /></select></td>
      <td><select className="cell" data-f="type" aria-label="Type" value={it.type} onChange={e => set('type')(e.target.value)}><Options list={P.S.types} /></select></td>
      <td><select className="cell" data-f="shape" aria-label="Looks like" value={it.shape} onChange={e => set('shape')(e.target.value)}><option value="">(type)</option>{SHAPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
      <td><In className="cell" data-f="parent" list="dlCodes" value={P.parentOf(it)?.code || ''} placeholder="–" style={{ width: 104 }} aria-label="Joins into" onCommit={set('parent')} /></td>
      <td><select className="cell" data-f="area" aria-label="Area" value={it.area} onChange={e => set('area')(e.target.value)}><Options list={P.areasSorted().map(x => ({ id: x.id, name: x.name }))} blank="Not assigned" /></select></td>
      <td>{it.area ? <select className="cell" data-f="fp" aria-label="Footprint" value={it.fp} onChange={e => set('fp')(e.target.value)}><option value="">None</option>{P.fpsIn(it.area).map(f => <option key={f.id} value={f.id}>{f.code}</option>)}</select> : <span className="muted xs">–</span>}</td>
      <td><In className="cell d" type="date" data-f="start" value={it.start} aria-label="Start" onCommit={set('start')} /></td>
      <td><In className="cell d" type="date" data-f="finish" value={it.finish} aria-label="Finish" onCommit={set('finish')} /></td>
      <td className="r"><In className="cell n" type="number" min={1} data-f="days" value={it.start && it.finish ? s1(it) - s0(it) + 1 : ''} style={{ width: 56 }} aria-label="Days" onCommit={set('days')} /></td>
      <td className="r num">{kids || ''}</td>
      <td className="r num">{it.stages.length || '–'}</td>
      <td className="r"><In className="cell n" type="number" step={0.1} data-f="wt" value={it.wt ?? ''} style={{ width: 62 }} aria-label="Weight" onCommit={set('wt')} /></td>
      <td>{p.length ? <span className={`chip ${p.some(x => x.k === 'clash') ? 'late' : 'warn'}`} title={p.map(x => x.t).join('\n')}><Icon k="warn" />{trimTo(p[0].t, 40)}{p.length > 1 ? ` +${p.length - 1}` : ''}</span> : null}</td>
      <td><button className="btn icon" title="Open" onClick={() => app.openItem(it.id)}><Icon k="edit" /></button></td>
    </tr>
  );
}
