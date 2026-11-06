/* The floor plan's drawing layer, as SVG markup in drawing units. Used on screen and in print. */
import type { Item } from './types';
import type { Box } from './geometry';
import { bbox, fBox, frameOf, fTx, labelPt, polyD } from './geometry';
import { Plan, s0 } from './plan';
import { shapeSVG } from './shapes';
import { esc, fd, trimTo } from './util';

export const LIGHT = { surface: '#ffffff', sunk: '#f1eef3', fg: '#303036', fg2: '#4a4952', muted: '#6c6a74', late: '#b8321f', risk: '#b57b08', ok: '#2f8a55', accent: '#0f2f4c', soft: '#eaeff5' };

export interface FloorOpts {
  /** drawing units per screen pixel */
  k: number;
  edit?: boolean;
  print?: boolean;
  sel?: string | null;
  ghost?: boolean;
  label?: string;
  colour: string;
  /** only these areas */
  areas?: string[] | null;
  /** selected area or footprint while editing the layout */
  esel?: { kind: 'fp' | 'area'; id: string } | null;
  /** id prefix so several plans can sit in one document (print) */
  idp?: string;
}

/** an item made from parts shows a seam for each part; parts not yet joined are hatched */
function joinSeams(P: Plan, it: Item, b: Box, d: number, k: number) {
  const kids = P.kidsOf(it.id);
  if (kids.length < 2) return '';
  const horiz = b.w >= b.h, n = kids.length, L = horiz ? b.w : b.h;
  let s = '';
  const order = it.ori & 1 ? [...kids].reverse() : kids;
  order.forEach((c, j) => {
    const a0 = (j / n) * L, a1 = ((j + 1) / n) * L;
    if (j) s += horiz
      ? `<line x1="${b.x + a0}" x2="${b.x + a0}" y1="${b.y}" y2="${b.y + b.h}" stroke="#fff" stroke-width="${2.2 * k}" stroke-dasharray="${5 * k} ${3 * k}"/>`
      : `<line y1="${b.y + a0}" y2="${b.y + a0}" x1="${b.x}" x2="${b.x + b.w}" stroke="#fff" stroke-width="${2.2 * k}" stroke-dasharray="${5 * k} ${3 * k}"/>`;
    const jd = P.joinDate(c);
    if (jd != null && d >= jd) return;
    s += horiz
      ? `<rect x="${b.x + a0}" y="${b.y}" width="${a1 - a0}" height="${b.h}" fill="url(#jh)"/>`
      : `<rect x="${b.x}" y="${b.y + a0}" width="${b.w}" height="${a1 - a0}" fill="url(#jh)"/>`;
  });
  return s;
}

export function floorBody(P: Plan, d: number, o: FloorOpts) {
  const k = o.k, C = LIGHT, look = P.S.set.look || 14, U = P.fpUse(d), idp = o.idp || '';
  const only = o.areas ? new Set(o.areas) : null;
  let h = `<pattern id="jh" width="${8 * k}" height="${8 * k}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${8 * k}" height="${8 * k}" fill="#fff" fill-opacity=".35"/><rect width="${3 * k}" height="${8 * k}" fill="#fff" fill-opacity=".7"/></pattern>`;
  let top = '';
  const fs = (n: number) => n * k;
  P.areasSorted().forEach(a => {
    if ((only && !only.has(a.id)) || a.pts.length < 3) return;
    const b = bbox(a.pts)!, x = P.occAt(a.id, d), sel = o.edit && o.esel?.kind === 'area' && o.esel.id === a.id;
    h += `<path class="fl-area" data-a="${a.id}" d="${polyD(a.pts)}" fill="${a.color}" fill-opacity="${o.edit ? 0.1 : 0.05}" stroke="${sel ? C.accent : a.color}" stroke-width="${(sel ? 3 : 2) * k}"/>`;
    top += `<text x="${b.x}" y="${b.y - fs(8)}" style="font:600 ${fs(14)}px var(--f-body,Arial);fill:#050401" paint-order="stroke" stroke="${C.surface}" stroke-width="${fs(4)}" pointer-events="none">${esc(a.name)}<tspan dx="${fs(8)}" style="font:700 ${fs(13)}px var(--f-mono,monospace);fill:${x.n > x.cap ? C.late : x.n === x.cap && x.n ? C.risk : C.ok}">${x.n}/${x.cap}</tspan></text>`;
  });
  P.S.footprints.forEach(f => {
    if ((only && !only.has(f.area)) || f.pts.length < 3) return;
    const sel = o.edit && o.esel?.kind === 'fp' && o.esel.id === f.id, its = U.now[f.id] || [], b = bbox(f.pts)!;
    const clash = its.length > 1, lay = f.kind === 'Laydown', cp = `${idp}cp-${f.id}`;
    h += `<clipPath id="${cp}"><path d="${polyD(f.pts)}"/></clipPath>`;
    h += `<path class="fl-fp" data-f="${f.id}" d="${polyD(f.pts)}" fill="${C.surface}" fill-opacity="${o.edit ? 0.55 : 0.7}" stroke="${clash ? C.late : sel ? C.accent : C.fg2}" stroke-width="${(clash || sel ? 2.4 : 1.1) * k}" stroke-dasharray="${lay ? `${2 * k} ${3 * k}` : `${6 * k} ${4 * k}`}"/>`;
    const lp = labelPt(f.pts);
    if (!its.length || o.edit) {
      const nx = U.next[f.id];
      if (!o.edit && o.ghost && nx && s0(nx) <= d + look) {
        const F = frameOf(f.pts)!;
        h += `<g clip-path="url(#${cp})" pointer-events="none"><g transform="${fTx(F)}">${shapeSVG(P.shapeOf(nx), fBox(F, F.W * 0.07), nx.ori, 'none', k, { ghost: true, stroke: C.fg2 })}</g></g>`;
        const z = Math.min(fs(11), b.h * 0.2, b.w / 12);
        if (z / k >= 6) top += `<text x="${lp[0]}" y="${lp[1]}" text-anchor="middle" dominant-baseline="middle" style="font:500 ${z}px var(--f-body,Arial);fill:${C.fg2}" paint-order="stroke" stroke="${C.surface}" stroke-width="${z * 0.3}" pointer-events="none">${esc(nx.code)} · ${fd(s0(nx))}</text>`;
      }
      const z = Math.min(fs(10.5), b.h * 0.22, (b.w / Math.max(5, f.code.length)) * 1.5);
      const tl = f.pts.reduce((m, q) => (q[1] < m[1] - 1e-6 || (Math.abs(q[1] - m[1]) < 1e-6 && q[0] < m[0]) ? q : m), f.pts[0]);
      if (z / k >= 5.5) top += `<text x="${tl[0] + fs(4)}" y="${tl[1] + z + fs(3)}" style="font:600 ${z}px var(--f-mono,monospace);fill:${C.muted}" pointer-events="none">${esc(f.code)}</text>`;
    }
    if (o.edit) return;
    its.forEach((it, i) => {
      const F = frameOf(f.pts)!, bx = fBox(F, F.W * (0.05 + i * 0.08));
      const isSel = it.id === o.sel, warn = P.hasK(it.id, 'heavy') || P.hasK(it.id, 'size');
      h += `<g class="it ${isSel ? 'sel' : ''}" data-i="${it.id}" clip-path="url(#${cp})"><g transform="${fTx(F)}">${shapeSVG(P.shapeOf(it), bx, it.ori, P.colourOf(it, o.colour), k, { sw: isSel ? 2.6 : 1, stroke: i ? C.late : isSel ? '#050401' : warn ? C.risk : undefined })}${i ? '' : joinSeams(P, it, bx, d, k)}</g></g>`;
      if (i === 0 && o.label !== 'none') {
        const z = Math.min(fs(13), bx.h * 0.26, (bx.w / Math.max(4, (it.code || '').length)) * 1.55);
        if (z / k >= 6) {
          const sg = o.label === 'stage' ? P.stageOn(it, d) : null;
          const sub = o.label === 'name' ? it.name : sg ? P.stype(sg.st).name : '';
          const two = !!sub && bx.h > z * 2.6, y0 = lp[1] - (two ? z * 0.45 : 0);
          top += `<text x="${lp[0]}" y="${y0}" text-anchor="middle" dominant-baseline="middle" class="it-t" style="font:700 ${z}px var(--f-body,Arial)" fill="#fff" paint-order="stroke" stroke="rgba(5,4,1,.6)" stroke-width="${z * 0.28}" pointer-events="none">${esc(it.code)}${clash ? ' ⚠' : ''}</text>`;
          if (two) { const z2 = z * 0.74; top += `<text x="${lp[0]}" y="${y0 + z * 1.1}" text-anchor="middle" dominant-baseline="middle" style="font:500 ${z2}px var(--f-body,Arial)" fill="#fff" paint-order="stroke" stroke="rgba(5,4,1,.6)" stroke-width="${z2 * 0.28}" pointer-events="none">${esc(trimTo(sub, bx.w / (z2 * 0.52)))}</text>`; }
        }
      }
    });
  });
  return h + top;
}

/** the zoom box for the whole yard or one area */
export function focusBox(P: Plan, focus: string, edit: boolean): Box {
  const D = P.S.drawing;
  if (focus !== 'all' && !edit) {
    const a = P.area(focus);
    const b = a ? bbox([...a.pts, ...P.fpsIn(a.id).flatMap(f => f.pts)]) : null;
    if (b) return { x: b.x - b.w * 0.04, y: b.y - b.h * 0.08 - 30, w: b.w * 1.08, h: b.h * 1.16 + 30 };
  }
  return { x: 0, y: 0, w: D.w, h: D.h };
}
