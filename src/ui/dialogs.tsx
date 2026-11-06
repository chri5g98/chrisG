/* Dialogs: next move, split into parts, new vessel, add many, standard stages, Excel import and print. */
import { useEffect, useMemo, useState } from 'react';
import { app, itemIn } from '../store/app';
import type { Item, ItemType, StdStage } from '../core/types';
import { blankItem, buildVessel, fillStages, type VesselOpts } from '../core/example';
import { s0, s1 } from '../core/plan';
import { importBook, type ImportResult } from '../core/excel';
import { parseCsv, readXlsx, type Book } from '../core/xlsx';
import { normalise } from '../core/normalise';
import { buildPrint, PAPER, pageMM, type PrintOpts } from '../core/print';
import { PAL } from '../core/shapes';
import { clamp, dn, ds, fd, monday, n0, nN, TODAY, uid } from '../core/util';
import { Modal } from './Overlays';
import { Icon } from './Icon';
import logo from '../assets/logo.png';

type Opt = { id: string; code?: string; name: string };
export const Options = ({ list, blank }: { list: Opt[]; blank?: string }) => (
  <>{blank != null ? <option value="">{blank}</option> : null}{list.map(x => <option key={x.id} value={x.id}>{x.code ? x.code + ' · ' + x.name : x.name}</option>)}</>
);
const Foot = ({ close, ok, label, disabled }: { close: () => void; ok: () => void; label: React.ReactNode; disabled?: boolean }) => (
  <><span className="grow" /><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={disabled} onClick={ok}>{label}</button></>
);

/* ---------- next move ---------- */
export function nextMoveDialog(id: string) { app.openModal(close => <NextMove id={id} close={close} />); }
function NextMove({ id, close }: { id: string; close: () => void }) {
  const P = app.P, it = P.item(id)!, AS = P.areasSorted().filter(a => a.id !== it.area);
  const [area, setArea] = useState(AS[0]?.id || ''), [days, setDays] = useState(String(it.start ? s1(it) - s0(it) + 1 : 28)), [code, setCode] = useState(it.code + '-M'), [type, setType] = useState(it.type);
  const [place, setPlace] = useState(false), [std, setStd] = useState(true);
  const ok = () => {
    const s = it.start ? s1(it) + 1 : TODAY, n = Math.max(1, Math.round(n0(days)));
    const ni = blankItem({ code, name: it.name, proj: it.proj, type, shape: it.shape, area, ori: it.ori, l: it.l, w: it.w, wt: it.wt, start: ds(s), finish: ds(s + n - 1), pred: [it.id] });
    if (place) ni.fp = app.P.freeFp(ni)?.id || '';
    if (std) fillStages(ni, app.S);
    close();
    app.commit(d => { d.items.push(ni); }, `Added ${ni.code} in ${P.area(ni.area)?.name || 'no area'}${ni.fp ? ' · ' + P.fpOf(ni.fp)!.code : ' – not in a footprint yet'}`);
    app.openItem(ni.id);
  };
  return (
    <Modal title={`Next move for ${it.code}`} sub="Adds a new item that follows this one, in another area." onClose={close} footer={<Foot close={close} ok={ok} label="Add" />}>
      <div className="fgrid">
        <div className="field"><label htmlFor="nmA">Move to</label><select id="nmA" value={area} onChange={e => setArea(e.target.value)}><Options list={AS} /></select></div>
        <div className="field"><label htmlFor="nmD">Days there</label><input id="nmD" type="number" min={1} value={days} onChange={e => setDays(e.target.value)} /></div>
        <div className="field"><label htmlFor="nmC">Code</label><input id="nmC" value={code} onChange={e => setCode(e.target.value)} /></div>
        <div className="field"><label htmlFor="nmT">Type</label><select id="nmT" value={type} onChange={e => setType(e.target.value)}><Options list={P.S.types} /></select></div>
        <label className="chk span2"><input type="checkbox" checked={place} onChange={e => setPlace(e.target.checked)} /> Put it in the first free footprint</label>
        <label className="chk span2"><input type="checkbox" checked={std} onChange={e => setStd(e.target.checked)} /> Add the type's standard stages</label>
      </div>
    </Modal>
  );
}

/* ---------- split into parts ---------- */
export function splitDialog(id: string) { app.openModal(close => <Split id={id} close={close} />); }
function Split({ id, close }: { id: string; close: () => void }) {
  const P = app.P, it = P.item(id)!, kids = P.kidsOf(id);
  const order = ['thull', 'tgb', 'tblk', 'tunit', 'tpan'], oi = order.indexOf(it.type);
  const lvlType = kids[0]?.type || (oi >= 0 && oi < order.length - 1 && P.S.types.some(t => t.id === order[oi + 1]) ? order[oi + 1] : it.type);
  const hull = /HULL$/.test(it.code || ''), base = (it.code || 'X').replace(/-HULL$/, '');
  const [n, setN] = useState('2'), [pre, setPre] = useState(hull ? base + '-B' : base + '-U'), [nm, setNm] = useState(hull ? 'Block' : 'Unit');
  const [type, setType] = useState(lvlType), [area, setArea] = useState(kids[0]?.area || (P.S.areas.find(a => /fab/i.test(a.name)) || P.areasSorted()[0])?.id || '');
  const [D, setD] = useState('21'), [G, setG] = useState('7'), [std, setStd] = useState(true);
  const ok = () => {
    const cnt = clamp(Math.round(n0(n)), 1, 40), dd = Math.max(1, n0(D)), gg = Math.max(0, n0(G));
    const end = it.start ? s0(it) - 1 : TODAY + dd - 1 + (cnt - 1) * gg;
    const have = new Set(P.S.items.map(i => i.code)), L: Item[] = [];
    for (let i = 0; i < cnt; i++) {
      const f = end - (cnt - 1 - i) * gg; let code = `${pre}${kids.length + i + 1}`;
      while (have.has(code)) code += '′';
      have.add(code);
      const p = blankItem({ code, name: `${nm} ${kids.length + i + 1}`, proj: it.proj, type, area, start: ds(f - dd + 1), finish: ds(f), parent: it.id });
      if (std) fillStages(p, app.S);
      L.push(p);
    }
    close();
    app.commit(d => { L.forEach(p => d.items.push(p)); }, `${cnt} part${cnt > 1 ? 's' : ''} added to ${it.code}`);
  };
  return (
    <Modal title={`Split ${it.code} into parts`} sub="Adds parts that join it, scheduled to finish before it starts." onClose={close} footer={<Foot close={close} ok={ok} label={<><Icon k="split" />Add parts</>} />}>
      <div className="fgrid3">
        <div className="field"><label htmlFor="spN">How many parts</label><input id="spN" type="number" min={1} max={40} value={n} onChange={e => setN(e.target.value)} /></div>
        <div className="field"><label htmlFor="spC">Codes start with</label><input id="spC" value={pre} onChange={e => setPre(e.target.value)} /><span className="hint">Numbered 1, 2, 3…</span></div>
        <div className="field"><label htmlFor="spNm">Names</label><input id="spNm" value={nm} onChange={e => setNm(e.target.value)} /></div>
        <div className="field"><label htmlFor="spT">Type</label><select id="spT" value={type} onChange={e => setType(e.target.value)}><Options list={P.S.types} /></select></div>
        <div className="field"><label htmlFor="spA">Built in</label><select id="spA" value={area} onChange={e => setArea(e.target.value)}><Options list={P.areasSorted()} blank="Not assigned" /></select></div>
        <div className="field"><label htmlFor="spD">Days each</label><input id="spD" type="number" min={1} value={D} onChange={e => setD(e.target.value)} /></div>
        <div className="field"><label htmlFor="spG">Stagger (days)</label><input id="spG" type="number" min={0} value={G} onChange={e => setG(e.target.value)} /><span className="hint">0 = all built side by side</span></div>
      </div>
      <label className="chk"><input type="checkbox" checked={std} onChange={e => setStd(e.target.checked)} /> Add the type's standard stages</label>
      {it.start ? null : <div className="note">This item has no dates, so the parts start today.</div>}
    </Modal>
  );
}

/* ---------- new vessel ---------- */
export function newVesselDialog() { app.openModal(close => <NewVessel close={close} />); }
function NewVessel({ close }: { close: () => void }) {
  const P = app.P, AS = P.areasSorted();
  const tFind = (re: RegExp, fb: string) => (P.S.types.find(t => re.test(t.name)) || P.S.types.find(t => t.id === fb) || P.S.types[0])?.id || '';
  const aFind = (re: RegExp) => (P.S.areas.find(a => re.test(a.name)) || AS[0])?.id || '';
  const [f, setF] = useState({
    code: String(Math.max(0, ...P.S.projects.map(p => parseInt(p.code) || 0)) + 1), name: '', units: '2, 2, 3, 2', start: ds(monday(TODAY) + 14), gap: '7', ud: '21', bd: '28', hd: '90',
    tu: tFind(/^unit/i, 'tunit'), tb: tFind(/^block/i, 'tblk'), th: tFind(/hull/i, 'thull'), au: aFind(/fab/i), ab: aFind(/block/i), ah: aFind(/berth|slip|dock/i), wh: true
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });
  const match = P.S.projects.find(p => p.code === f.code.trim());
  const [projSel, setProjSel] = useState<string | null>(null);
  const proj = projSel ?? (match ? match.id : '+');
  const opts = (): VesselOpts => {
    const raw = f.units.split(/[,\s;]+/).map(x => parseInt(x)).filter(n => n >= 0 && n < 60);
    return { units: raw.length === 1 ? Array(raw[0] > 0 ? 4 : 0).fill(raw[0]) : raw, start: dn(f.start) ?? TODAY, gap: Math.max(0, n0(f.gap)), unitDays: Math.max(1, n0(f.ud)), blockDays: Math.max(1, n0(f.bd)), hullDays: Math.max(1, n0(f.hd)), code: f.code.trim() || 'NEW', name: f.name.trim(), types: { hull: f.th, block: f.tb, unit: f.tu }, areas: { hull: f.ah, block: f.ab, unit: f.au }, proj: 'tmp', wheelhouse: f.wh };
  };
  const o = opts(); const L = o.units.length ? buildVessel(o, app.S) : [];
  const exists = !!L.length && P.S.items.some(i => i.code === L[0].code);
  const rng = (A: Item[]) => (A.length ? `${fd(Math.min(...A.map(s0)))} – ${fd(Math.max(...A.map(s1)))}` : '');
  const h = L[0], b = L.filter(x => h && x.parent === h.id && x.shape !== 'deckhouse'), u = L.filter(x => b.some(y => y.id === x.parent));
  const ok = () => {
    if (!L.length || exists) return;
    const np = proj === '+' ? { id: uid('p'), code: o.code, name: o.name ? o.name.replace(/\s*–.*/, '') : 'Hull ' + o.code, color: PAL[P.S.projects.length % PAL.length] } : null;
    const pid = np ? np.id : proj;
    const items = buildVessel({ ...o, proj: pid }, app.S);
    close();
    app.commit(d => { if (np) d.projects.push(np); items.forEach(it => d.items.push(it)); }, `Created ${items[0].code}: ${items.length} items – give them footprints on the floor plan`);
    app.setView({ vroot: items[0].id, date: s0(items[items.length - 1]), hide: app.V.hide.filter(x => x !== pid) });
    app.go('vessel');
  };
  return (
    <Modal wide title="New vessel" sub="Builds the hull, its blocks and their units in one go, linked into a build tree and scheduled so each block starts when its units are done." onClose={close}
      footer={<Foot close={close} ok={ok} disabled={!L.length || exists} label={<><Icon k="ship" />Create vessel</>} />}>
      <div className="fgrid3">
        <div className="field"><label htmlFor="nvP">Project</label><select id="nvP" value={proj} onChange={e => setProjSel(e.target.value)}><option value="+">New project…</option><Options list={P.S.projects.map(p => ({ id: p.id, name: p.name }))} /></select></div>
        <div className="field"><label htmlFor="nvC">Hull number</label><input id="nvC" value={f.code} onChange={e => { setProjSel(null); set('code')(e); }} /></div>
        <div className="field"><label htmlFor="nvN">Name</label><input id="nvN" value={f.name} onChange={set('name')} placeholder="e.g. Hull 805 – ferry" /></div>
      </div>
      <div className="field"><label htmlFor="nvU">Units in each block</label><input id="nvU" value={f.units} onChange={set('units')} /><span className="hint">One number per block, stern first. “2, 2, 3, 2” = 4 blocks made of 9 units. A single number gives every block the same.</span></div>
      <div className="fgrid3">
        <div className="field"><label htmlFor="nvS">First unit starts</label><input id="nvS" type="date" value={f.start} onChange={set('start')} /></div>
        <div className="field"><label htmlFor="nvG">A new unit every (days)</label><input id="nvG" type="number" min={0} value={f.gap} onChange={set('gap')} /></div>
        <div className="field"><label htmlFor="nvUD">Days for each unit</label><input id="nvUD" type="number" min={1} value={f.ud} onChange={set('ud')} /></div>
        <div className="field"><label htmlFor="nvBD">Days for each block</label><input id="nvBD" type="number" min={1} value={f.bd} onChange={set('bd')} /></div>
        <div className="field"><label htmlFor="nvHD">Days for the hull</label><input id="nvHD" type="number" min={1} value={f.hd} onChange={set('hd')} /></div>
        <div />
      </div>
      <div className="fgrid3">
        <div className="field"><label htmlFor="nvTU">Units are</label><select id="nvTU" value={f.tu} onChange={set('tu')}><Options list={P.S.types} /></select></div>
        <div className="field"><label htmlFor="nvTB">Blocks are</label><select id="nvTB" value={f.tb} onChange={set('tb')}><Options list={P.S.types} /></select></div>
        <div className="field"><label htmlFor="nvTH">Hull is</label><select id="nvTH" value={f.th} onChange={set('th')}><Options list={P.S.types} /></select></div>
        <div className="field"><label htmlFor="nvAU">Units built in</label><select id="nvAU" value={f.au} onChange={set('au')}><Options list={AS.map(a => ({ id: a.id, name: a.name }))} /></select></div>
        <div className="field"><label htmlFor="nvAB">Blocks built in</label><select id="nvAB" value={f.ab} onChange={set('ab')}><Options list={AS.map(a => ({ id: a.id, name: a.name }))} /></select></div>
        <div className="field"><label htmlFor="nvAH">Hull built on</label><select id="nvAH" value={f.ah} onChange={set('ah')}><Options list={AS.map(a => ({ id: a.id, name: a.name }))} /></select></div>
      </div>
      <label className="chk"><input type="checkbox" checked={f.wh} onChange={set('wh')} /> Add a wheelhouse (shown above the deck, joins the hull half way through)</label>
      <div className="note">
        {!L.length ? 'Enter how many units each block has.' : <><Icon k="ship" /><span><b>1 hull, {b.length} blocks, {u.length} units = {L.length} items.</b> Units {rng(u)} · blocks {rng(b)} · hull {rng([h])}.{exists ? <> <b style={{ color: 'var(--late)' }}>{h.code} already exists – pick another hull number.</b></> : null}</span></>}
      </div>
    </Modal>
  );
}

/* ---------- add many (paste from Excel) ---------- */
export function addManyDialog() { app.openModal(close => <AddMany close={close} />); }
function AddMany({ close }: { close: () => void }) {
  const P = app.P, V = app.V;
  const [txt, setTxt] = useState(''), [proj, setProj] = useState(P.S.projects.find(p => !V.hide.includes(p.id))?.id || ''), [type, setType] = useState(P.S.types[0]?.id || '');
  const [area, setArea] = useState(V.focus !== 'all' ? V.focus : P.areasSorted()[0]?.id || ''), [start, setStart] = useState(ds(V.date)), [D, setD] = useState('28'), [G, setG] = useState('7'), [join, setJoin] = useState(''), [std, setStd] = useState(true);
  const rows = txt.split(/\r?\n/).map(l => l.split(/\t|;/).map(c => c.trim())).filter(c => c[0]);
  const ok = () => {
    if (!rows.length) return;
    const s = dn(start) ?? V.date, dd = Math.max(1, n0(D)), gg = n0(G), parent = join ? P.S.items.find(i => i.code === join.trim())?.id || '' : '';
    const add = rows.map((c, i) => {
      const a = dn(c[2]) ?? s + i * gg, b = dn(c[3]) ?? a + dd - 1;
      const it = blankItem({ code: c[0], name: c[1] || '', proj, type, area, wt: nN(c[4]), l: nN(c[5]), w: nN(c[6]), start: ds(a), finish: ds(Math.max(a, b)), parent });
      if (std) fillStages(it, app.S);
      return it;
    });
    close();
    app.commit(d => { add.forEach(it => d.items.push(it)); }, `${add.length} items added – give them footprints on the floor plan`);
  };
  return (
    <Modal wide title="Add many items" sub="Paste rows from Excel: Code, Name, Start, Finish, Weight t, Length m, Width m. Only Code is needed; blanks use the settings below." onClose={close} footer={<Foot close={close} ok={ok} label="Add" disabled={!rows.length} />}>
      <textarea className="ctl" style={{ width: '100%', minHeight: 170, fontFamily: 'var(--f-mono)', fontSize: 12.5 }} placeholder={'802-B201\tBlock 201\t2027-02-01\t2027-03-08\t32'} aria-label="Rows to add" value={txt} onChange={e => setTxt(e.target.value)} />
      <div className="fgrid3">
        <div className="field"><label htmlFor="amP">Project</label><select id="amP" value={proj} onChange={e => setProj(e.target.value)}><Options list={P.S.projects} /></select></div>
        <div className="field"><label htmlFor="amY">Type</label><select id="amY" value={type} onChange={e => setType(e.target.value)}><Options list={P.S.types} /></select></div>
        <div className="field"><label htmlFor="amA">Area</label><select id="amA" value={area} onChange={e => setArea(e.target.value)}><Options list={P.areasSorted()} blank="Not assigned" /></select></div>
        <div className="field"><label htmlFor="amS">First start</label><input id="amS" type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
        <div className="field"><label htmlFor="amD">Days each</label><input id="amD" type="number" value={D} onChange={e => setD(e.target.value)} /></div>
        <div className="field"><label htmlFor="amG">Stagger days</label><input id="amG" type="number" value={G} onChange={e => setG(e.target.value)} /></div>
        <div className="field"><label htmlFor="amJ">They join into</label><input id="amJ" list="dlCodes" placeholder="optional item code" value={join} onChange={e => setJoin(e.target.value)} /></div>
      </div>
      <label className="chk"><input type="checkbox" checked={std} onChange={e => setStd(e.target.checked)} /> Add the type's standard stages</label>
      <div className="small muted">{rows.length} rows</div>
    </Modal>
  );
}

/* ---------- standard stages for a type ---------- */
export function stdDialog(t: ItemType) { app.openModal(close => <StdStages t={t} close={close} />); }
function StdStages({ t, close }: { t: ItemType; close: () => void }) {
  const P = app.P;
  const [rows, setRows] = useState<StdStage[]>(t.std.map(x => ({ ...x })));
  const [apply, setApply] = useState(false);
  const upd = (i: number, x: Partial<StdStage>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...x } : r)));
  const n = P.S.items.filter(i => i.type === t.id).length;
  const ok = () => {
    close();
    app.commit(d => { const tt = d.types.find(x => x.id === t.id)!; tt.std = rows.filter(x => x.st); if (apply) d.items.filter(i => i.type === t.id).forEach(i => fillStages(i, d)); }, apply ? `Stages reset on every ${t.name.toLowerCase()}` : 'Standard stages saved');
  };
  return (
    <Modal title={`Standard stages – ${t.name}`} onClose={close}
      footer={<><button className="btn sm" onClick={() => setRows([...rows, { st: P.S.stypes[0]?.id, pct: 25 }])}><Icon k="plus" />Add stage</button><span className="grow" /><label className="chk"><input type="checkbox" checked={apply} onChange={e => setApply(e.target.checked)} /> Apply to its {n} items now</label><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={ok}>Save</button></>}>
      <p className="small muted" style={{ margin: 0 }}>Stages run one after another across the item's time in its area. Shares are rescaled if they don't add up to 100.</p>
      <table className="t"><thead><tr><th>Stage</th><th className="r">Share %</th><th /></tr></thead><tbody>
        {rows.length ? rows.map((x, i) => (
          <tr key={i}>
            <td><select className="cell" aria-label="Stage" value={x.st} onChange={e => upd(i, { st: e.target.value })}><Options list={P.S.stypes} /></select></td>
            <td className="r"><input className="cell n" type="number" min={1} aria-label="Share" value={x.pct} onChange={e => upd(i, { pct: Math.max(1, n0(e.target.value)) })} /></td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button className="btn icon" disabled={!i} aria-label="Earlier" onClick={() => { const r = [...rows]; [r[i - 1], r[i]] = [r[i], r[i - 1]]; setRows(r); }}>↑</button>
              <button className="btn icon" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon k="x" /></button>
            </td>
          </tr>
        )) : <tr><td colSpan={3} className="muted small">No stages.</td></tr>}
      </tbody></table>
      <div className="small muted">Total {rows.reduce((s, x) => s + (+x.pct || 0), 0)}%</div>
    </Modal>
  );
}

/* ---------- Excel import ---------- */
export async function importFile(file: File) {
  let book: Book;
  try {
    book = /\.csv$/i.test(file.name) ? { Items: parseCsv(await file.text()) } : await readXlsx(await file.arrayBuffer());
  } catch (e) { app.toast('Could not read that file: ' + (e as Error).message); return; }
  const r = importBook(book, app.S);
  app.openModal(close => <ImportPreview file={file.name} r={r} close={close} />);
}
function ImportPreview({ file, r, close }: { file: string; r: ImportResult; close: () => void }) {
  const [rm, setRm] = useState(false);
  const ok = () => {
    close();
    app.commit(d => {
      let N = r.next;
      if (rm) { const gone = new Set(r.missing); N = { ...N, items: N.items.filter(i => !gone.has(i.id)) }; N.items.forEach(i => (i.pred = (i.pred || []).filter(p => !gone.has(p)))); }
      const S = normalise(JSON.parse(JSON.stringify({ ...N, drawing: { ...N.drawing, src: null } })));
      S.drawing.src = N.drawing.src;
      Object.assign(d, S, { _meta: d._meta });
    }, `Imported ${r.total} changes`);
  };
  const lines = r.report.flatMap(x => x.lines.map(l => [x.name, l])).slice(0, 400);
  return (
    <Modal wide title="Import from Excel" sub={`${file} · nothing is saved until you click Import changes`} onClose={close} footer={<Foot close={close} ok={ok} label="Import changes" disabled={!r.total && !(rm && r.missing.length)} />}>
      <table className="t"><thead><tr><th>Sheet</th><th className="r">New</th><th className="r">Changed</th><th className="r">No change</th></tr></thead>
        <tbody>{r.report.map(x => <tr key={x.name}><td>{x.name}</td><td className="r num">{x.nw}</td><td className="r num">{x.ch}</td><td className="r num">{x.same}</td></tr>)}</tbody></table>
      {r.warn.length ? <div className="warnbox">{r.warn.slice(0, 30).map((w, i) => <span key={i} className="chip warn"><Icon k="warn" />{w}</span>)}{r.warn.length > 30 ? <span className="small muted">and {r.warn.length - 30} more</span> : null}</div> : null}
      <div className="prev-tbl"><table className="t"><tbody>{lines.length ? lines.map(([n, l], i) => <tr key={i}><td className="muted" style={{ width: 110 }}>{n}</td><td>{l}</td></tr>) : <tr><td className="muted">No changes found.</td></tr>}</tbody></table></div>
      {r.missing.length ? <label className="chk"><input type="checkbox" checked={rm} onChange={e => setRm(e.target.checked)} /> Also remove the {r.missing.length} items that are not in the file</label> : null}
    </Modal>
  );
}

/* ---------- print / PDF ---------- */
const LSP = 'fmarea_print';
let logoData = logo;
fetch(logo).then(r => r.blob()).then(b => new Promise<string>(res => { const f = new FileReader(); f.onload = () => res(f.result as string); f.readAsDataURL(b); })).then(d => (logoData = d)).catch(() => {});

export function vesselRoot() {
  const P = app.P, R = P.treeRoots().filter(P.shown);
  let r = P.item(app.V.vroot);
  if (!r || r.parent || !P.kidsOf(r.id).length) r = R.find(x => P.shapeOf(x) === 'hull') || R[0];
  return r || null;
}
export function printDialog() { app.openModal(close => <PrintDialog close={close} />); }
function PrintDialog({ close }: { close: () => void }) {
  const P = app.P, V = app.V;
  const init = (): PrintOpts => {
    let p: Partial<PrintOpts> = {};
    try { p = JSON.parse(localStorage.getItem(LSP) || '{}'); } catch { /* ignore */ }
    const what = V.page === 'plan' ? 'plan' : V.page === 'cap' ? 'cap' : V.page === 'vessel' ? 'vessel' : 'floor';
    const o: PrintOpts = { paper: 'A3', orient: 'L', text: 1, dates: 'one', scope: 'site', stages: true, ...p, what, from: ds(V.date), to: ds(V.date + 56), gFrom: ds(P.R.d0), gTo: ds(P.R.d1) };
    if (o.scope === 'focus' && V.focus === 'all') o.scope = 'site';
    return o;
  };
  const [PR, setPR] = useState<PrintOpts>(init);
  const set = (x: Partial<PrintOpts>) => setPR({ ...PR, ...x });
  useEffect(() => { try { localStorage.setItem(LSP, JSON.stringify({ paper: PR.paper, orient: PR.orient, text: PR.text, dates: PR.dates, scope: PR.scope, stages: PR.stages })); } catch { /* ignore */ } }, [PR]);
  const root = vesselRoot();
  const pages = useMemo(() => buildPrint(P, V, PR, { logo: logoData, vroot: root }), [P, V, PR, root]);
  const go = () => {
    const [w, h] = pageMM(PR), el = document.getElementById('printRoot')!;
    el.innerHTML = `<style>@page{size:${w}mm ${h}mm;margin:0}</style>` + pages.map(s => `<div class="pg" style="width:${w}mm;height:${h}mm">${s}</div>`).join('');
    close();
    setTimeout(() => window.print(), 50);
  };
  return (
    <Modal wide title="Print / PDF" sub="Choose Save as PDF in the print window for a PDF at the true paper size – ready for the plotter at A1 or A0." onClose={close}
      footer={<><span className="small muted">{pages.length} page{pages.length > 1 ? 's' : ''} · {PR.paper} {PR.orient === 'L' ? 'landscape' : 'portrait'}</span><span className="grow" /><button className="btn" onClick={close}>Close</button><button className="btn primary" onClick={go}><Icon k="print" />Print / Save as PDF</button></>}>
      <div className="fgrid3">
        <div className="field"><label htmlFor="prW">Print</label><select id="prW" value={PR.what} onChange={e => set({ what: e.target.value as PrintOpts['what'] })}><option value="floor">Floor plan</option><option value="plan">Plan (Gantt by area)</option><option value="cap">Capacity charts</option><option value="vessel">Vessel build ({root?.code || 'none'})</option></select></div>
        <div className="field"><label htmlFor="prP">Paper</label><select id="prP" value={PR.paper} onChange={e => set({ paper: e.target.value })}>{Object.keys(PAPER).map(k => <option key={k}>{k}</option>)}</select></div>
        <div className="field"><label htmlFor="prO">Orientation · text</label><div className="row" style={{ flexWrap: 'nowrap' }}>
          <select id="prO" value={PR.orient} onChange={e => set({ orient: e.target.value as 'L' | 'P' })}><option value="L">Landscape</option><option value="P">Portrait</option></select>
          <select aria-label="Text size" value={PR.text} onChange={e => set({ text: +e.target.value })}><option value={0.85}>Small</option><option value={1}>Normal</option><option value={1.2}>Large</option></select>
        </div></div>
      </div>
      {PR.what === 'floor' || PR.what === 'vessel' ? (
        <div className="fgrid3">
          <div className="field"><label htmlFor="prD">Dates</label><select id="prD" value={PR.dates} onChange={e => set({ dates: e.target.value as 'one' | 'weeks' })}><option value="one">{fd(V.date)} only</option><option value="weeks">One page a week</option></select></div>
          <div className="field"><label htmlFor="prF">From · to</label><div className="row" style={{ flexWrap: 'nowrap' }}><input type="date" id="prF" value={PR.from} onChange={e => set({ from: e.target.value })} /><input type="date" aria-label="To" value={PR.to} onChange={e => set({ to: e.target.value })} /></div></div>
          {PR.what === 'floor' ? <div className="field"><label htmlFor="prS">Show</label><select id="prS" value={PR.scope} onChange={e => set({ scope: e.target.value as PrintOpts['scope'] })}><option value="site">Whole yard</option>{V.focus !== 'all' ? <option value="focus">{P.area(V.focus)?.name || ''}</option> : null}<option value="each">Each area on its own page</option></select></div> : <div />}
        </div>
      ) : null}
      {PR.what === 'plan' ? (
        <div className="fgrid3">
          <div className="field"><label htmlFor="prGF">From · to</label><div className="row" style={{ flexWrap: 'nowrap' }}><input type="date" id="prGF" value={PR.gFrom} onChange={e => set({ gFrom: e.target.value })} /><input type="date" aria-label="To" value={PR.gTo} onChange={e => set({ gTo: e.target.value })} /></div></div>
          <div className="field"><label>&nbsp;</label><div className="row"><button className="btn sm" onClick={() => set({ gFrom: ds(P.R.d0), gTo: ds(P.R.d1) })}>Whole plan</button><label className="chk"><input type="checkbox" checked={PR.stages} onChange={e => set({ stages: e.target.checked })} /> Stages</label></div></div>
          <div className="small muted" style={{ alignSelf: 'end' }}>Uses the Plan page's grouping and filters, every group opened.</div>
        </div>
      ) : null}
      {PR.what === 'cap' ? <div className="small muted">Each area's chart, then all areas combined, for the Capacity page's period and colours.</div> : null}
      <div style={{ background: 'var(--sunk)', borderRadius: 8, padding: 12, display: 'flex', gap: 12, overflow: 'auto', alignItems: 'flex-start', minHeight: 200 }}>
        {pages.slice(0, 3).map((s, i) => <div key={i} style={{ background: '#fff', boxShadow: 'var(--shadow-lg)', flex: 'none', width: PR.orient === 'L' ? 420 : 300 }} dangerouslySetInnerHTML={{ __html: s.replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%"') }} />)}
        {pages.length > 3 ? <div className="small muted" style={{ alignSelf: 'center' }}>+ {pages.length - 3} more</div> : null}
      </div>
    </Modal>
  );
}

/** used by the Items table's bulk "joins into" */
export function setParentMany(ids: Set<string>, code: string) {
  const P = app.P, p = P.S.items.find(i => i.code === code.trim());
  if (!p) { app.toast('Pick an item code from the list'); return; }
  let bad = 0;
  app.commit(d => d.items.filter(i => ids.has(i.id)).forEach(it => { if (it.id === p.id || P.isUnder(p.id, it.id)) { bad++; return; } itemIn(d, it.id).parent = p.id; }), `Now joining ${p.code}${bad ? ` (${bad} skipped – it is one of their parts)` : ''}`);
}
