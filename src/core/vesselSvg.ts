/* Vessel build drawings: the side profile (a picture or the standard hull with each part in its place)
   and the assembly tree. Both are SVG markup, shared by the screen and print. */
import type { Item, Profile, Pt } from './types';
import type { Box } from './geometry';
import { bbox, labelPt, polyD } from './geometry';
import { Plan, s0, s1 } from './plan';
import { esc, fd, r1, trimTo } from './util';

export const DEF_PROF = { w: 1000, h: 410 };
const qpts = (a: Pt, c: Pt, b: Pt, n = 10): Pt[] => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return [0, 1].map(j => Math.round((1 - t) * (1 - t) * a[j] + 2 * (1 - t) * t * c[j] + t * t * b[j])) as Pt; });
export const DEF_HULL: Pt[] = [[30, 205], [975, 165], ...qpts([975, 165], [948, 318], [860, 400]).slice(1), [130, 400], ...qpts([130, 400], [44, 398], [38, 330]).slice(1), [30, 330]];
export const deckY = (x: number) => 205 + ((x - 30) / 945) * (165 - 205);
export const isSuper = (P: Plan, it: Item) => P.shapeOf(it) === 'deckhouse' || /wheel ?house|deck ?house|superstructure|bridge|accommodation|funnel/i.test(`${it.name || ''} ${it.code || ''}`);
export const profOf = (P: Plan, root: Item): Profile | null => (P.S.profiles || []).find(p => p.root === root.id) || null;

export interface Region { r: Box; poly: Pt[] | null; own: boolean }
export interface ProfileOpts { fs?: number; regs?: Map<string, Region>; edit?: boolean; print?: boolean; id?: string; sel?: string | null }

export function vesselSpan(P: Plan, root: Item, today: number) {
  let a = Infinity, b = -Infinity;
  const walk = (it: Item) => { if (it.start) { a = Math.min(a, s0(it)); b = Math.max(b, s1(it)); } P.kidsOf(it.id).forEach(walk); };
  walk(root);
  return isFinite(a) ? { a: a - 7, b: b + 7 } : { a: today - 30, b: today + 90 };
}

export function vesselProfile(P: Plan, root: Item, d: number, o: ProfileOpts = {}) {
  const pr = profOf(P, root), W = pr?.w || DEF_PROF.w, H = pr?.h || DEF_PROF.h, fs = o.fs || W / 1000;
  const C = { ink: '#303036', muted: '#6c6a74', line: '#cfcad1', wait: '#efecf1', paper: '#ffffff', accent: '#0f2f4c' };
  const gap = 3.2 * fs, fo = pr ? 0.82 : 1; // parts let a picture show through a little
  const rootPoly = root.zone || (pr ? null : DEF_HULL);
  const rootReg: Region = { r: rootPoly ? bbox(rootPoly)! : { x: 0, y: 0, w: W, h: H }, poly: rootPoly, own: !!root.zone };
  const desc = P.descendants(root);
  const anyZone = desc.some(k => k.zone);
  const drawnHull = P.kidsOf(root.id).some(k => k.zone && !isSuper(P, k));
  let defs = '', body = '', labels = '', n = 0;
  const clips = new Map<Pt[], string>(), pats = new Map<string, string>(), undrawn: Item[] = [];
  const clipOf = (poly: Pt[] | null) => {
    if (!poly) return '';
    if (!clips.has(poly)) { const id = `vc${o.id || ''}_${n++}`; clips.set(poly, id); defs += `<clipPath id="${id}"><path d="${polyD(poly)}"/></clipPath>`; }
    return `clip-path="url(#${clips.get(poly)})"`;
  };
  const pat = (c: string) => {
    const id = 'vs' + c.replace('#', '') + (o.id || '');
    if (!pats.has(id)) pats.set(id, `<pattern id="${id}" width="${7 * fs}" height="${7 * fs}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${7 * fs}" height="${7 * fs}" fill="${c}"/><rect width="${2.6 * fs}" height="${7 * fs}" fill="#fff" fill-opacity=".55"/></pattern>`);
    return `url(#${id})`;
  };
  const base = (root.code || '').replace(/-HULL$/, '');
  const short = (it: Item) => ((it.code || '').startsWith(base + '-') ? it.code.slice(base.length + 1) : it.code);
  const joined = (k: Item) => { const j = P.joinDate(k); return j != null && d >= j; };
  const shapeTag = (reg: Region) => (reg.own ? `<path d="${polyD(reg.poly!)}"` : `<rect x="${reg.r.x.toFixed(1)}" y="${reg.r.y.toFixed(1)}" width="${Math.max(0.5, reg.r.w).toFixed(1)}" height="${Math.max(0.5, reg.r.h).toFixed(1)}" ${clipOf(reg.poly)}`);
  const piece = (it: Item, reg: Region, joinedIn: boolean, st: string) => {
    const col = P.proj(it.proj).color;
    let fill: string, stroke = '#4a4952', dash = '', op = fo;
    if (st === 'done' || joinedIn) { fill = col; stroke = joinedIn ? col : '#050401'; }
    else if (st === 'build') fill = pat(col);
    else { fill = C.wait; dash = `stroke-dasharray="${3 * fs} ${2.5 * fs}"`; stroke = C.muted; op = pr ? 0.55 : 1; }
    const sel = !o.print && it.id === o.sel;
    if (reg.own && !joinedIn) body += `<path d="${polyD(reg.poly!)}" fill="none" stroke="#fff" stroke-width="${gap * 1.8}" pointer-events="none"/>`;
    body += `${shapeTag(reg)} data-vi="${it.id}" fill="${fill}" fill-opacity="${op}" stroke="${sel ? C.accent : stroke}" stroke-width="${(sel ? 3 : 0.9) * fs}" ${dash}/>`;
    const t = short(it), r = reg.r, z = Math.min(11 * fs, r.h * 0.42, (r.w / Math.max(3, t.length)) * 1.7);
    const [lx, ly] = reg.own ? labelPt(reg.poly!) : [r.x + r.w / 2, r.y + r.h / 2];
    const quiet = st === 'wait' || st === 'none';
    if (z >= 6.5 * fs) body += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" style="font:700 ${z}px IBM Plex Sans,Arial" fill="${quiet ? C.muted : '#fff'}" ${quiet ? '' : `paint-order="stroke" stroke="rgba(5,4,1,.45)" stroke-width="${z * 0.25}"`} pointer-events="none">${esc(t)}</text>`;
  };
  const split = (list: Item[], reg: Region, lvl: number): [Item, Box][] => {
    const tot = list.reduce((s2, k) => s2 + P.leafCount(k), 0) || 1;
    let acc = 0; const r = reg.r, vert = lvl % 2 === 0;
    return list.map(k => {
      const f0 = acc / tot, f1 = (acc + P.leafCount(k)) / tot; acc += P.leafCount(k);
      return [k, vert ? { x: r.x + r.w * f0, y: r.y, w: r.w * (f1 - f0), h: r.h } : { x: r.x, y: r.y + r.h * f0, w: r.w, h: r.h * (f1 - f0) }];
    });
  };
  const node = (it: Item, reg: Region, lvl: number, joinedIn: boolean) => {
    o.regs?.set(it.id, reg);
    const kids = P.kidsOf(it.id), st = P.stateOn(it, d);
    let free = kids.filter(k => !k.zone); const drawn = kids.filter(k => k.zone); let sup: Item[] = [];
    if (it === root) {
      sup = free.filter(k => isSuper(P, k)); free = free.filter(k => !isSuper(P, k));
      if (pr || drawnHull) { undrawn.push(...free); free = []; }
      if (pr) { undrawn.push(...sup); sup = []; } // on a picture only drawn parts show
    }
    if (kids.length && it !== root && (st === 'build' || st === 'done') && kids.every(joined)) { // every part has joined: one piece with faint seams
      piece(it, reg, joinedIn, st);
      split(free, reg, lvl).forEach(([, kr], i) => { if (i) body += `<line ${lvl % 2 === 0 ? `x1="${kr.x}" x2="${kr.x}" y1="${reg.r.y}" y2="${reg.r.y + reg.r.h}"` : `y1="${kr.y}" y2="${kr.y}" x1="${reg.r.x}" x2="${reg.r.x + reg.r.w}"`} ${clipOf(reg.poly)} stroke="#fff" stroke-opacity=".6" stroke-width="${1.2 * fs}" stroke-dasharray="${4 * fs} ${3 * fs}" pointer-events="none"/>`; });
      drawn.forEach(k => (body += `<path d="${polyD(k.zone!)}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="${1.2 * fs}" stroke-dasharray="${4 * fs} ${3 * fs}" pointer-events="none"/>`));
      return;
    }
    if (!kids.length) { piece(it, reg, joinedIn, st); return; }
    if (it !== root && st !== 'wait' && st !== 'none') body += `${shapeTag(reg)} fill="${P.proj(it.proj).color}" fill-opacity=".12" pointer-events="none"/>`;
    split(free, reg, lvl).forEach(([k, kr]) => { const j = joined(k); const rr = j ? kr : { x: kr.x + gap, y: kr.y + gap, w: Math.max(1, kr.w - gap * 2), h: Math.max(1, kr.h - gap * 2) }; node(k, { r: rr, poly: reg.poly, own: false }, lvl + 1, j); });
    sup.forEach((k, i) => { const x0 = 80 + i * 225, w = 205, tp = 108; const pts: Pt[] = [[x0, tp], [x0 + w, tp], [x0 + w, r1(deckY(x0 + w))], [x0, r1(deckY(x0))]]; node(k, { r: bbox(pts)!, poly: pts, own: true }, lvl + 1, joined(k)); }); // superstructure sits on the deck
    drawn.forEach(k => node(k, { r: bbox(k.zone)!, poly: k.zone!, own: true }, lvl + 1, joined(k)));
    if (it !== root) body += `${shapeTag(reg)} fill="none" stroke="${st === 'build' ? C.accent : C.muted}" stroke-width="${(st === 'build' ? 2 : 0.8) * fs}" ${st === 'wait' || st === 'none' ? `stroke-dasharray="${4 * fs} ${3 * fs}"` : ''} pointer-events="none"/>`;
  };
  node(root, rootReg, 0, false);
  const bottom = Math.max(rootReg.r.y + rootReg.r.h, ...desc.filter(k => k.zone).map(k => { const b = bbox(k.zone)!; return b.y + b.h; }));
  P.kidsOf(root.id).forEach(k => {
    const reg = o.regs?.get(k.id) || (k.zone ? { r: bbox(k.zone)! } : null);
    if (!reg || isSuper(P, k)) return;
    const cx = reg.r.x + reg.r.w / 2, jd = P.joinDate(k), j = joined(k);
    labels += `<text x="${cx}" y="${bottom + 16 * fs}" text-anchor="middle" style="font:600 ${11 * fs}px IBM Plex Sans,Arial" fill="${C.ink}">${esc(short(k))}</text><text x="${cx}" y="${bottom + 29 * fs}" text-anchor="middle" style="font:500 ${9.5 * fs}px IBM Plex Mono,monospace" fill="${j ? C.ink : C.muted}">${jd == null ? '' : (j ? 'joined ' : 'joins ') + fd(jd)}</text>`;
  });
  const rs = P.stateOn(root, d);
  const outline = rootPoly ? `<path d="${polyD(rootPoly)}" fill="none" stroke="${rs === 'build' || rs === 'done' ? C.accent : C.ink}" stroke-width="${(rs === 'build' ? 2.6 : 1.8) * fs}" pointer-events="none"/>` : '';
  const water = !pr && !root.zone ? `<line x1="40" x2="900" y1="330" y2="330" stroke="#4f86c0" stroke-width="${1.2 * fs}" stroke-dasharray="${8 * fs} ${5 * fs}" opacity=".7" pointer-events="none"/>` : '';
  const img = pr && pr.src ? `<image href="${pr.src}" x="0" y="0" width="${W}" height="${H}" opacity="${pr.op}" preserveAspectRatio="none"/>` : '';
  const hgt = Math.max(H, bottom + 38 * fs), y0 = pr ? 0 : 92; // the standard hull has no picture above it to show
  return { y0, svg: `<defs>${defs}${[...pats.values()].join('')}</defs><rect width="${W}" height="${hgt}" fill="${C.paper}"/>${img}${water}${body}${outline}${labels}`, w: W, h: hgt, undrawn, anyZone };
}

/* ---------- assembly tree ---------- */
export const VT = { NW: 196, NH: 46, ROW: 54, GAP: 64 };
function vTreeLayout(P: Plan, root: Item) {
  const pos = new Map<string, { x: number; y: number }>(); let leafI = 0; const maxD = P.treeDepth(root);
  const place = (it: Item, depth: number): number => {
    const k = P.kidsOf(it.id); let y: number;
    if (k.length) { const ys = k.map(c => place(c, depth + 1)); y = (ys[0] + ys[ys.length - 1]) / 2; } else y = leafI++ * VT.ROW;
    pos.set(it.id, { x: (maxD - depth) * (VT.NW + VT.GAP), y });
    return y;
  };
  place(root, 0);
  return { pos, w: (maxD + 1) * (VT.NW + VT.GAP), h: leafI * VT.ROW };
}
export function vesselTreeSVG(P: Plan, root: Item, d: number, o: { print?: boolean; sel?: string | null } = {}) {
  const L = vTreeLayout(P, root), P0 = 16; let lines = '', boxes = '';
  const C = o.print
    ? { surf: '#fff', line: '#cfcad1', ink: '#303036', strong: '#050401', muted: '#6c6a74', accent: '#0f2f4c', wait: '#f1eef3', late: '#b8321f' }
    : { surf: 'var(--surface)', line: 'var(--line)', ink: 'var(--fg)', strong: 'var(--fg-strong)', muted: 'var(--muted)', accent: 'var(--accent)', wait: 'var(--sunk)', late: 'var(--late)' };
  const walk = (it: Item) => {
    const p = L.pos.get(it.id)!, x = P0 + p.x, y = P0 + p.y, st = P.stateOn(it, d), col = P.proj(it.proj).color;
    P.kidsOf(it.id).forEach(k => {
      const q = L.pos.get(k.id)!, cx = P0 + q.x + VT.NW, cy = P0 + q.y + VT.NH / 2, py = y + VT.NH / 2, mid = x - VT.GAP / 2;
      const jd = P.joinDate(k), j = jd != null && d >= jd, late = P.hasK(k.id, 'join');
      lines += `<path d="M${cx} ${cy}H${mid}V${py}H${x}" fill="none" stroke="${late ? C.late : j ? C.ink : C.muted}" stroke-width="${j ? 1.8 : 1.2}" ${j ? '' : 'stroke-dasharray="4 3"'}/>`;
      if (jd != null) lines += `<text x="${cx + 5}" y="${cy - 5}" style="font:500 10px var(--f-mono,monospace)" fill="${late ? C.late : C.muted}">${fd(jd)}</text>`;
      walk(k);
    });
    const sel = it.id === o.sel && !o.print, f = P.fpOf(it.fp), quiet = st === 'wait' || st === 'none';
    boxes += `<g class="vn" data-vn="${it.id}" transform="translate(${x} ${y})"><rect width="${VT.NW}" height="${VT.NH}" rx="7" fill="${quiet ? C.wait : C.surf}" stroke="${sel ? C.accent : st === 'build' ? col : C.line}" stroke-width="${sel || st === 'build' ? 2 : 1}" ${st === 'wait' ? 'stroke-dasharray="4 3"' : ''}/><rect width="6" height="${VT.NH}" rx="3" fill="${col}" ${quiet ? 'fill-opacity=".35"' : ''}/>
      <text x="14" y="17" style="font:700 12.5px var(--f-body,Arial)" fill="${C.strong}">${esc(trimTo(it.code, 16))}</text><text x="${VT.NW - 8}" y="17" text-anchor="end" style="font:600 10px var(--f-mono,monospace)" fill="${st === 'build' ? C.accent : C.muted}">${{ wait: 'not started', build: 'building', done: 'finished', none: 'no dates' }[st]}</text>
      <text x="14" y="31" style="font:500 11px var(--f-body,Arial)" fill="${C.muted}">${esc(trimTo(it.name, 26))}</text><text x="14" y="42" style="font:500 9.5px var(--f-mono,monospace)" fill="${C.muted}">${it.start ? fd(s0(it)) + ' – ' + fd(s1(it)) : ''}${f ? ' · ' + esc(f.code) : it.area ? ' · no footprint' : ''}</text>
      ${o.print ? '' : `<g class="vadd" data-vadd="${it.id}" transform="translate(${VT.NW - 13} ${VT.NH - 13})"><title>Split into parts</title><circle r="9" fill="${C.surf}" stroke="${C.line}"/><path d="M-4 0h8M0 -4v8" stroke="${C.accent}" stroke-width="1.6"/></g>`}</g>`;
  };
  walk(root);
  return { svg: lines + boxes, w: L.w + P0 * 2, h: L.h + P0 * 2 - (VT.ROW - VT.NH) };
}
