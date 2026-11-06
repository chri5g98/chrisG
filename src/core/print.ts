/* Print / PDF: A4 to A0 at true page sizes. Each page is one SVG in millimetres. */
import type { Item, ViewState } from './types';
import { bbox } from './geometry';
import { Plan, heatCol, onDay, s0, s1 } from './plan';
import { floorBody } from './floorSvg';
import { capChart, capWeeks, weekStack } from './capacity';
import { buildRows, type Row } from './rows';
import { DEF_PROF, profOf, vesselProfile, vesselTreeSVG } from './vesselSvg';
import { clamp, DAY, dn, esc, fd, fdl, MON, monday, TODAY, trimTo, weekNo } from './util';

export const PAPER: Record<string, [number, number, number]> = { A4: [297, 210, 0.88], A3: [420, 297, 1], A1: [841, 594, 1.35], A0: [1189, 841, 1.7] };
export interface PrintOpts {
  what: 'floor' | 'plan' | 'cap' | 'vessel';
  paper: string; orient: 'L' | 'P'; text: number;
  dates: 'one' | 'weeks'; from: string; to: string;
  scope: 'site' | 'focus' | 'each';
  gFrom: string; gTo: string; stages: boolean;
}
export const pageMM = (PR: PrintOpts): [number, number] => { const [a, b] = PAPER[PR.paper]; return PR.orient === 'L' ? [a, b] : [b, a]; };

export function buildPrint(P: Plan, V: ViewState, PR: PrintOpts, ctx: { logo: string; vroot: Item | null }) {
  const [W, H] = pageMM(PR), k = PAPER[PR.paper][2] * PR.text, pages: string[] = [];
  const shownP = P.shownProjects().map(p => p.name).join(', ');
  const frame = (title: string, sub: string, body: string, legend: string) => {
    const hh = 16 * k, m = 8;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="IBM Plex Sans, Segoe UI, Arial, sans-serif">
      <rect width="${W}" height="${H}" fill="#fff"/>
      <image href="${ctx.logo}" x="${m}" y="${m}" width="${hh * 2.3}" height="${hh}" preserveAspectRatio="xMinYMid meet"/>
      <text x="${m + hh * 2.6}" y="${m + hh * 0.48}" font-size="${6.2 * k}" font-weight="700" font-style="italic" fill="#0f2f4c" font-family="Barlow Semi Condensed, Arial Narrow, Arial">${esc(title)}</text>
      <text x="${m + hh * 2.6}" y="${m + hh * 0.86}" font-size="${3 * k}" fill="#4a4952">${esc(sub)}</text>
      <text x="${W - m}" y="${m + hh * 0.48}" font-size="${3 * k}" fill="#4a4952" text-anchor="end">FMAREA · ${esc(shownP)}</text>
      <text x="${W - m}" y="${m + hh * 0.86}" font-size="${2.6 * k}" fill="#6c6a74" text-anchor="end">Printed ${fd(TODAY)}${V.name ? ' by ' + esc(V.name) : ''} · page {P} of {N}</text>
      <line x1="${m}" y1="${m + hh + 2}" x2="${W - m}" y2="${m + hh + 2}" stroke="#0f2f4c" stroke-width=".5"/><line x1="${m}" y1="${m + hh + 3}" x2="${W - m}" y2="${m + hh + 3}" stroke="#8fb0d0" stroke-width=".8"/>
      ${body}
      <g transform="translate(${m} ${H - m - 3 * k})">${legend}</g></svg>`;
  };
  const legend = (items: [string, string, boolean?][]) => {
    let x = 0, s = '';
    items.forEach(([c, l, dash]) => {
      s += `<rect x="${x}" y="${-2.4 * k}" width="${3 * k}" height="${3 * k}" rx=".5" fill="${dash ? 'none' : c}" ${dash ? `stroke="${c}" stroke-dasharray="1 .6" stroke-width=".5"` : ''}/><text x="${x + 4 * k}" y="${0.3 * k}" font-size="${2.8 * k}" fill="#303036">${esc(l)}</text>`;
      x += 8 * k + l.length * 1.55 * k;
    });
    return s;
  };
  const legItems = (): [string, string, boolean?][] => [...(V.colour === 'type' ? P.S.types : P.shownProjects()).map(x => [x.color, x.name] as [string, string]), ['#4a4952', 'Free footprint', true], ['#b8321f', 'Double-booked', true]];
  const dayList = () => {
    const days: number[] = [];
    if (PR.dates === 'one') days.push(V.date);
    else { const a = dn(PR.from) ?? V.date, b = dn(PR.to) ?? a; for (let d = a; d <= b && days.length < 104; d += 7) days.push(d); }
    return days;
  };
  if (PR.what === 'floor') {
    const fa = P.area(V.focus);
    const scopes = PR.scope === 'each' ? P.areasSorted().map(a => [a.id]) : PR.scope === 'focus' && fa ? [[fa.id]] : [null];
    dayList().forEach(d => scopes.forEach(A => pages.push(frame(`Floor plan · ${fdl(d)}`, `Week ${weekNo(d)} · ${A ? P.area(A[0])!.name : 'Whole yard'}`, floorPrint(P, V, PR, d, A ? A[0] : null, W, H, k), legend(legItems())))));
  } else if (PR.what === 'vessel') {
    const root = ctx.vroot;
    if (root) dayList().forEach(d => {
      const top = 8 + 16 * k + 6, bottom = H - 8 - 9 * k, ph = (bottom - top) * 0.46;
      const pr = profOf(P, root), Wc = pr?.w || DEF_PROF.w, Hc = pr?.h || DEF_PROF.h, sc0 = Math.min((W - 16) / Wc, ph / (Hc * 1.15));
      const Pr = vesselProfile(P, root, d, { fs: (0.3 * k) / sc0, print: true, id: 'p' + d });
      const sc = Math.min((W - 16) / Pr.w, ph / (Pr.h - Pr.y0));
      let body = `<g transform="translate(${8 + (W - 16 - Pr.w * sc) / 2} ${top - Pr.y0 * sc}) scale(${sc})">${Pr.svg}</g>`;
      const T = vesselTreeSVG(P, root, d, { print: true }), ty = top + ph + 6 * k, bh = bottom - ty, bw = W - 16, tsc = Math.min(bw / T.w, bh / T.h, 0.38 * k);
      body += `<text x="8" y="${ty - 1.5 * k}" font-size="${3.2 * k}" font-weight="700" fill="#050401">Assembly tree</text><g transform="translate(8 ${ty}) scale(${tsc})">${T.svg}</g>`;
      pages.push(frame(`Vessel build · ${root.code}`, `${fdl(d)} · week ${weekNo(d)}`, body, legend([['#efecf1', 'Not started', true], [P.proj(root.proj).color, 'Finished or joined']])));
    });
  } else if (PR.what === 'plan') {
    const a = dn(PR.gFrom) ?? P.R.d0, b = Math.max(a + 7, dn(PR.gTo) ?? P.R.d1);
    const rows = buildRows(P, V, { all: true, stages: PR.stages }).rows.filter(r => !r.sg || (dn(r.sg.finish)! >= a && dn(r.sg.start)! <= b));
    const top = 8 + 16 * k + 6, bottom = H - 8 - 8 * k, rh = 5.2 * k, sh = 3.9 * k, hh = 9 * k;
    let i = 0; const L = rows.length;
    while (i < L || !pages.length) {
      let used = 0; const chunk: Row[] = [];
      if (i && i < L && !rows[i].grp) { const g = [...rows.slice(0, i)].reverse().find(r => r.grp && r.lvl === 0); if (g) { chunk.push({ ...g, cont: true }); used += rh; } }
      while (i < L) { const r = rows[i], hgt = r.sg ? sh : rh; if (used + hgt > bottom - top - hh && chunk.length) break; chunk.push(r); used += hgt; i++; }
      pages.push(frame('Plan by area', `${fd(a)} – ${fd(b)}`, ganttPrint(P, V, chunk, a, b, W, top, rh, sh, hh, k), legend([...legItems().slice(0, -2), ...(PR.stages ? P.S.stypes.map(x => [x.color, x.name] as [string, string]) : [])])));
      if (!L) break;
    }
  } else {
    const AS = P.areasSorted();
    const charts = [...AS.map(a => ({ t: a.name, aids: [a.id], by: V.capBy as string, cap: P.capOf(a.id) })), { t: 'All areas combined', aids: AS.map(a => a.id), by: 'area', cap: P.S.footprints.length }];
    const top = 8 + 16 * k + 8, bottom = H - 8 - 9 * k, per = PR.orient === 'L' ? (PR.paper === 'A4' ? 2 : 3) : 4, ch = (bottom - top) / per;
    for (let i = 0; i < charts.length; i += per) {
      let body = '';
      charts.slice(i, i + per).forEach((c, j) => {
        const y0 = top + j * ch, data = capWeeks(P, V.capWeeks).map(w => weekStack(P, c.aids, w, c.by)), short = data.filter(d => d.n > c.cap).length;
        body += `<text x="8" y="${y0 + 4 * k}" font-size="${3.6 * k}" font-weight="700" fill="#050401">${esc(c.t)}</text><text x="${8 + (c.t.length * 1.9 + 3) * k}" y="${y0 + 4 * k}" font-size="${2.8 * k}" fill="#6c6a74">${c.cap} footprints${short ? ` · ${short} week${short > 1 ? 's' : ''} short` : ''}</text>`;
        body += `<g transform="translate(8 ${y0 + 6 * k})">${capChart(data, c.cap, W - 16, ch - 9 * k, { print: true, fs: 0.3 * k, id: 'ph' + i + j })}</g>`;
      });
      const legs = V.capBy === 'type' ? P.S.types : P.shownProjects();
      pages.push(frame('Capacity', `Footprints needed each week · ${V.capWeeks ? V.capWeeks + ' weeks from ' + fd(monday(TODAY)) : 'whole plan'}`, body, legend([...legs.map(x => [x.color, x.name] as [string, string]), ['#b8321f', 'Short of footprints', true]])));
    }
  }
  return pages.map((s, i) => s.replace('{P}', String(i + 1)).replace('{N}', String(pages.length)));
}

function floorPrint(P: Plan, V: ViewState, PR: PrintOpts, d: number, A: string | null, W: number, H: number, k: number) {
  const m = 8, top = m + 16 * k + 8, side = 60 * k, bot = H - m - 9 * k, bw = W - m * 2 - side - 6, bh = bot - top - 4 * k;
  const D = P.S.drawing; let b;
  if (A) {
    const a = P.area(A)!; const bb = bbox([...a.pts, ...P.fpsIn(a.id).flatMap(f => f.pts)]) || { x: 0, y: 0, w: D.w, h: D.h };
    b = { x: bb.x - bb.w * 0.04, y: bb.y - bb.h * 0.1 - 30, w: bb.w * 1.08, h: bb.h * 1.14 + 30 };
  } else b = { x: 0, y: 0, w: D.w, h: D.h };
  const sc = Math.min(bw / b.w, bh / b.h), ox = m + (bw - b.w * sc) / 2 - b.x * sc, oy = top + (bh - b.h * sc) / 2 - b.y * sc;
  const kk = (0.35 / sc) * PR.text * PAPER[PR.paper][2]; // drawing units per print "pixel"
  let s = `<defs><clipPath id="pcl${d}${A || ''}"><rect x="${m}" y="${top}" width="${bw}" height="${bh}"/></clipPath></defs><g clip-path="url(#pcl${d}${A || ''})"><g transform="translate(${ox} ${oy}) scale(${sc})">`;
  if (D.src) s += `<image href="${D.src}" x="0" y="0" width="${D.w}" height="${D.h}" opacity="${D.op}" preserveAspectRatio="none"/>`;
  s += floorBody(P, d, { k: kk, print: true, ghost: V.ghost, label: V.label, colour: V.colour, areas: A ? [A] : null, idp: `p${d}${A || ''}` });
  s += `</g></g><rect x="${m}" y="${top}" width="${bw}" height="${bh}" fill="none" stroke="#cfcad1" stroke-width=".3"/>`;
  const mp = P.mpu();
  if (mp) { const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200]; const L = nice.find(n => (n / mp) * sc >= 25) || 200; const px = (L / mp) * sc; s += `<g transform="translate(${m + bw - px - 3} ${bot - 3})"><rect width="${px}" height="1.4" fill="#4a4952"/><rect width="${px / 2}" height="1.4" fill="#fff" stroke="#4a4952" stroke-width=".25"/><text x="${px}" y="-1.2" font-size="${2.4 * k}" text-anchor="end" fill="#6c6a74">${L} m</text></g>`; }
  const sx = W - m - side; let sy = top + 4 * k;
  const aids = new Set(A ? [A] : P.S.areas.map(a => a.id));
  s += `<text x="${sx}" y="${sy}" font-size="${3.4 * k}" font-weight="600" fill="#050401">Footprints on ${fd(d)}</text>`; sy += 5 * k;
  P.areasSorted().filter(a => aids.has(a.id)).forEach(a => { const o = P.occAt(a.id, d); s += `<text x="${sx}" y="${sy}" font-size="${2.6 * k}" fill="#303036">${esc(a.name)}</text><text x="${W - m}" y="${sy}" font-size="${2.6 * k}" text-anchor="end" font-weight="700" fill="${o.n > o.cap ? '#b8321f' : '#303036'}">${o.n} / ${o.cap}</text>`; sy += 3.8 * k; });
  sy += 3 * k; s += `<text x="${sx}" y="${sy}" font-size="${3.4 * k}" font-weight="600" fill="#050401">On site</text>`; sy += 5 * k;
  const list = P.S.items.filter(it => P.shown(it) && onDay(it, d) && aids.has(it.area)).sort((a, b) => (P.fpOf(a.fp)?.code || '~').localeCompare(P.fpOf(b.fp)?.code || '~', 'en', { numeric: true }));
  const maxN = Math.floor((bot - sy - 6 * k) / (3.6 * k));
  list.slice(0, maxN).forEach(it => { const sg = P.stageOn(it, d); s += `<rect x="${sx}" y="${sy - 2.2 * k}" width="${2.6 * k}" height="${2.6 * k}" fill="${P.colourOf(it, V.colour)}"/><text x="${sx + 3.6 * k}" y="${sy}" font-size="${2.4 * k}" fill="#303036"><tspan font-weight="600">${esc(it.code)}</tspan> ${esc(P.fpOf(it.fp)?.code || 'no footprint')}${sg ? ' · ' + esc(trimTo(P.stype(sg.st).name, 18)) : ''}</text><text x="${W - m}" y="${sy}" font-size="${2.2 * k}" fill="#6c6a74" text-anchor="end">to ${fd(s1(it))}</text>`; sy += 3.6 * k; });
  if (list.length > maxN) s += `<text x="${sx}" y="${sy}" font-size="${2.4 * k}" fill="#6c6a74">and ${list.length - maxN} more</text>`;
  return s;
}

function ganttPrint(P: Plan, V: ViewState, rows: Row[], a: number, b: number, W: number, top: number, rh: number, sh: number, hh: number, k: number) {
  const m = 8, cw = { code: 22 * k, name: 52 * k, fp: 14 * k, st: 15 * k, fi: 15 * k }, left = m + cw.code + cw.name + cw.fp + cw.st + cw.fi, tw = W - m - left, ppd = tw / (b - a + 1);
  const x = (d: number) => left + (clamp(d, a, b + 1) - a) * ppd;
  let y = top + hh; const total = rows.reduce((s, r) => s + (r.sg ? sh : rh), 0);
  let s = `<rect x="${m}" y="${top}" width="${W - 2 * m}" height="${hh}" fill="#f1eef3"/>`;
  ([['Code', 0], ['Item · stage', cw.code], ['Footprint', cw.code + cw.name], ['Start', cw.code + cw.name + cw.fp], ['Finish', cw.code + cw.name + cw.fp + cw.st]] as [string, number][]).forEach(([t, o]) => (s += `<text x="${m + o + 1.5}" y="${top + hh - 2 * k}" font-size="${2.5 * k}" font-weight="600" fill="#4a4952">${t}</text>`));
  let dd = new Date(a * DAY); dd = new Date(Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), 1));
  while (+dd / DAY <= b) {
    const n = +dd / DAY;
    if (n >= a) s += `<line x1="${x(n)}" y1="${top}" x2="${x(n)}" y2="${top + hh + total}" stroke="#d6d1da" stroke-width=".25"/>`;
    s += `<text x="${Math.max(left, x(n)) + 1}" y="${top + hh * 0.42}" font-size="${2.4 * k}" font-weight="600" fill="#4a4952">${MON[dd.getUTCMonth()]} ${String(dd.getUTCFullYear()).slice(2)}</text>`;
    dd = new Date(Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 1));
  }
  if (ppd * 7 > 9 * k) for (let w = monday(a) + (monday(a) < a ? 7 : 0); w <= b; w += 7) s += `<text x="${x(w) + 0.5}" y="${top + hh - 2 * k}" font-size="${2 * k}" fill="#6c6a74">${new Date(w * DAY).getUTCDate()}</text>`;
  rows.forEach(r => {
    const h = r.sg ? sh : rh;
    if (r.grp) {
      s += `<rect x="${m}" y="${y}" width="${W - 2 * m}" height="${h}" fill="${r.lvl ? '#f6f4f7' : '#efecf1'}"/><rect x="${m + 1 + r.lvl * 4 * k}" y="${y + h * 0.3}" width="${h * 0.4}" height="${h * 0.4}" fill="${r.color}"/><text x="${m + 1 + r.lvl * 4 * k + h * 0.6}" y="${y + h * 0.68}" font-size="${2.7 * k}" font-weight="700" fill="#050401">${esc(r.label)}${r.cont ? ' (continued)' : ''}${r.area ? ` · ${P.capOf(r.area.id)} footprints` : ''}</text>`;
      if (r.area) for (let w = monday(a); w <= b; w += 7) {
        const o = P.occWeek(r.area.id, w); if (!o.n) continue;
        const x0 = x(Math.max(w, a)), x1 = x(Math.min(w + 7, b + 1));
        s += `<rect x="${x0}" y="${y + h * 0.2}" width="${Math.max(0.2, x1 - x0 - 0.2)}" height="${h * 0.6}" fill="${heatCol(o.n, o.cap).replace('var(--sunk)', '#f1eef3')}"/>`;
        if (x1 - x0 > 7 * k) s += `<text x="${(x0 + x1) / 2}" y="${y + h * 0.65}" font-size="${1.9 * k}" text-anchor="middle" fill="${o.n / (o.cap || 1) > 0.45 ? '#fff' : '#303036'}">${o.n}/${o.cap}</text>`;
      }
      y += h; return;
    }
    if (r.sg) {
      const t = P.stype(r.sg.st);
      s += `<text x="${m + 5 * k + 1.5}" y="${y + h * 0.7}" font-size="${2.1 * k}" fill="#6c6a74">${esc(t.name)}</text><text x="${m + cw.code + cw.name + cw.fp + 1.5}" y="${y + h * 0.7}" font-size="${2 * k}" fill="#6c6a74">${r.sg.start ? fd(dn(r.sg.start)) : ''}</text><text x="${m + cw.code + cw.name + cw.fp + cw.st + 1.5}" y="${y + h * 0.7}" font-size="${2 * k}" fill="#6c6a74">${r.sg.finish ? fd(dn(r.sg.finish)) : ''}</text>`;
      if (r.sg.start && r.sg.finish && dn(r.sg.finish)! >= a && dn(r.sg.start)! <= b) { const bx = x(dn(r.sg.start)!), bx2 = x(dn(r.sg.finish)! + 1); s += `<rect x="${bx}" y="${y + h * 0.22}" width="${Math.max(0.3, bx2 - bx)}" height="${h * 0.56}" rx=".4" fill="${t.color}"/>`; }
      y += h; return;
    }
    const it = r.it!;
    s += `<line x1="${m}" y1="${y + h}" x2="${W - m}" y2="${y + h}" stroke="#efecf1" stroke-width=".2"/>`;
    s += `<text x="${m + 1.5}" y="${y + h * 0.66}" font-size="${2.4 * k}" fill="#4a4952" font-family="IBM Plex Mono, Consolas, monospace">${esc(it.code)}</text><text x="${m + cw.code + 1.5}" y="${y + h * 0.66}" font-size="${2.4 * k}" fill="#303036">${esc(trimTo(it.name, cw.name / (1.25 * k)))}</text><text x="${m + cw.code + cw.name + 1.5}" y="${y + h * 0.66}" font-size="${2.3 * k}" fill="${P.placed(it) ? '#4a4952' : '#b57b08'}">${P.placed(it) ? esc(P.fpOf(it.fp)!.code) : 'none'}</text><text x="${m + cw.code + cw.name + cw.fp + 1.5}" y="${y + h * 0.66}" font-size="${2.3 * k}" fill="#4a4952">${it.start ? fd(s0(it)) : ''}</text><text x="${m + cw.code + cw.name + cw.fp + cw.st + 1.5}" y="${y + h * 0.66}" font-size="${2.3 * k}" fill="#4a4952">${it.finish ? fd(s1(it)) : ''}</text>`;
    if (it.start && s1(it) >= a && s0(it) <= b) {
      const bx = x(s0(it)), bx2 = x(s1(it) + 1), bad = P.hasK(it.id, 'clash');
      s += `<rect x="${bx}" y="${y + h * 0.2}" width="${Math.max(0.4, bx2 - bx)}" height="${h * 0.6}" rx=".5" fill="${P.colourOf(it, V.colour)}" stroke="${bad ? '#b8321f' : 'none'}" stroke-width=".5" ${bad ? 'stroke-dasharray="1 .5"' : ''}/>`;
      const lab = esc(trimTo(it.code + ' ' + (it.name || ''), 40)), lw = lab.length * 1.15 * k;
      if (bx2 + 1 + lw < W - m) s += `<text x="${bx2 + 1}" y="${y + h * 0.66}" font-size="${2.2 * k}" fill="#6c6a74">${lab}</text>`;
      else if (bx - 1 - lw > left) s += `<text x="${bx - 1}" y="${y + h * 0.66}" font-size="${2.2 * k}" fill="#6c6a74" text-anchor="end">${lab}</text>`;
    }
    y += h;
  });
  if (TODAY >= a && TODAY <= b) s += `<line x1="${x(TODAY)}" y1="${top}" x2="${x(TODAY)}" y2="${top + hh + total}" stroke="#8d1902" stroke-width=".5"/>`;
  return s;
}
