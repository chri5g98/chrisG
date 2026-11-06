/* The side rail (pages, save status, undo) and the top bar (projects shown, find, print, Excel). */
import { useState } from 'react';
import { app, useApp } from '../store/app';
import { shared } from '../store/shared';
import type { Page } from '../core/types';
import { Icon } from './Icon';
import { Modal } from './Overlays';
import { exportXlsx } from './actions';
import { printDialog } from './dialogs';
import logo from '../assets/logo.png';

export const PAGES: [Page, string, string][] = [
  ['floor', 'Floor plan', 'floor'], ['plan', 'Plan', 'plan'], ['vessel', 'Vessel build', 'ship'], ['cap', 'Capacity', 'cap'],
  ['items', 'Items', 'items'], ['areas', 'Areas & footprints', 'areas'], ['data', 'Data', 'data'], ['settings', 'Settings', 'settings']
];

export function Rail({ open, onNav }: { open: boolean; onNav: () => void }) {
  const a = useApp(); const P = a.P, V = a.V, d = V.date;
  const bad: Partial<Record<Page, number>> = {
    floor: P.pairs.filter(p => p.from <= d && d <= p.to).length,
    cap: P.S.areas.filter(x => { const o = P.occAt(x.id, d); return o.n > o.cap; }).length
  };
  const m = P.S._meta || { rev: 0 };
  return (
    <aside className={`rail ${open ? 'open' : ''}`}>
      <div className="brand">
        <span className="logo-tile"><img alt="Ferguson Marine" src={logo} /></span>
        <div><b>FMAREA</b><small>Footprint &amp; area planner</small></div>
      </div>
      <nav className="nav">
        {PAGES.map(([k, l, i]) => (
          <button key={k} aria-current={V.page === k} onClick={() => { app.go(k); onNav(); }}>
            <Icon k={i} />{l}
            {bad[k] ? <span className="badge" title={k === 'floor' ? 'Footprints double-booked on the selected date' : 'Areas needing more footprints than they have on the selected date'}>{bad[k]}</span> : null}
          </button>
        ))}
      </nav>
      <div className="rail-foot">
        {shared.status === 'shared' ? (
          <>
            <div><span className={`dot ${a.dirty ? 'wait' : ''}`} />{a.dirty ? 'Saving…' : 'Shared'} · {shared.name}</div>
            <div className="xs" style={{ opacity: 0.75 }}>
              Last save {m.by || '–'}{m.at ? ' · ' + new Date(m.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}<br />
              Checked {shared.lastCheck ? shared.lastCheck.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '–'} · <a href="#" style={{ color: 'inherit' }} onClick={e => { e.preventDefault(); shared.check(); }}>check now</a>
            </div>
          </>
        ) : shared.status === 'reconnect' ? (
          <><div><span className="dot bad" />Not connected</div><a href="#" className="xs" style={{ color: 'inherit' }} onClick={e => { e.preventDefault(); reconnectPrompt(); }}>Reconnect to the shared plan</a></>
        ) : (
          <><div><span className="dot wait" />Saved in this browser</div><a href="#" className="xs" style={{ color: 'inherit' }} onClick={e => { e.preventDefault(); app.go('settings'); }}>Not shared · share…</a></>
        )}
        <div className="xs" style={{ opacity: 0.75 }}>{P.S.items.length} items · {P.S.areas.length} areas</div>
        <div className="row" style={{ gap: 4, marginTop: 4 }}>
          <button className="btn sm ghost" style={{ color: 'inherit' }} disabled={!a.undoStack.length} onClick={app.undo}><Icon k="undo" />Undo</button>
          <button className="btn sm ghost" style={{ color: 'inherit' }} disabled={!a.redoStack.length} onClick={app.redo}><Icon k="redo" />Redo</button>
        </div>
      </div>
    </aside>
  );
}

export function reconnectPrompt() {
  app.openModal(close => (
    <Modal title="Reconnect to the shared plan" sub={`${shared.name} needs your permission again in this browser.`} onClose={close}
      footer={<><button className="btn" onClick={() => { shared.workLocally(); close(); }}>Work in this browser only</button><span className="grow" /><button className="btn primary" onClick={async () => { if (await shared.reconnect()) close(); }}>Reconnect</button></>}>
      <p style={{ margin: 0 }}>Click <b>Reconnect</b> and allow access when the browser asks. Your colleagues' changes are in the shared file.</p>
    </Modal>
  ));
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const a = useApp(); const P = a.P, V = a.V;
  const [q, setQ] = useState('');
  const find = (v: string) => {
    const s = v.trim().toLowerCase(); if (!s) return;
    const it = P.S.items.find(i => (i.code || '').toLowerCase() === s) || P.S.items.find(i => ((i.code || '') + ' ' + (i.name || '')).toLowerCase().includes(s));
    if (it) { setQ(''); (document.activeElement as HTMLElement)?.blur(); app.openItem(it.id); } else app.toast('No item matches “' + v + '”');
  };
  const shown = P.S.items.filter(P.shown).length;
  return (
    <div className="ptool" id="ptool">
      <button className="btn icon menu-btn" onClick={onMenu} aria-label="Menu"><Icon k="menu" /></button>
      <span className="title">Projects shown</span>
      <div className="projchips">
        {P.S.projects.map(p => (
          <button key={p.id} className="pchip" style={{ ['--c' as string]: p.color }} aria-pressed={!V.hide.includes(p.id)} title={`Show or hide ${p.name} everywhere, including capacity`}
            onClick={() => app.setView({ hide: V.hide.includes(p.id) ? V.hide.filter(x => x !== p.id) : [...V.hide, p.id] })}><i />{p.name}</button>
        ))}
      </div>
      <span className="grow" />
      <div className="search">
        <Icon k="search" />
        <input className="ctl" id="tFind" list="dlCodes" placeholder="Find an item…" aria-label="Find an item by code or name" autoComplete="off" value={q}
          onChange={e => { setQ(e.target.value); if (P.S.items.some(i => i.code === e.target.value.trim())) find(e.target.value); }}
          onKeyDown={e => { if (e.key === 'Enter') find(q); if (e.key === 'Escape') { setQ(''); e.currentTarget.blur(); } }} />
      </div>
      <datalist id="dlCodes">{P.S.items.map(i => <option key={i.id} value={i.code}>{i.name}</option>)}</datalist>
      <span className="ptool-facts"><span>{shown} items</span><span>{P.pairs.length ? <b style={{ color: 'var(--late)' }}>{P.pairs.length} double-booked</b> : 'No double-bookings'}</span></span>
      <button className="btn sm" onClick={printDialog}><Icon k="print" />Print / PDF</button>
      <button className="btn sm" onClick={() => exportXlsx()}><Icon k="xl" />Export to Excel</button>
    </div>
  );
}
