/* Geometry in drawing units: polygons for areas and footprints, and a footprint's own frame for turned shapes. */
import type { Pt } from './types';
import { r1 } from './util';

export interface Box { x: number; y: number; w: number; h: number }
export interface Frame { cx: number; cy: number; L: number; W: number; a: number }

export function bbox(pts: Pt[] | null | undefined): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  (pts || []).forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  return isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
export const polyD = (pts: Pt[]) => 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';

export function inPoly([x, y]: Pt, pts: Pt[]) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function polyArea(pts: Pt[]) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
}
/** where to put a label: the centroid, or the middle of the widest row when the centroid falls outside (L shapes) */
export function labelPt(pts: Pt[]): Pt {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    A += f; cx += (pts[j][0] + pts[i][0]) * f; cy += (pts[j][1] + pts[i][1]) * f;
  }
  if (Math.abs(A) > 1e-6) { cx /= 3 * A; cy /= 3 * A; if (inPoly([cx, cy], pts)) return [cx, cy]; }
  const b = bbox(pts)!;
  let best: { w: number; p: Pt } | null = null;
  for (let k = 1; k < 10; k++) {
    const y = b.y + (b.h * k) / 10, xs: number[] = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y)) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
    }
    xs.sort((a, c) => a - c);
    for (let i = 0; i + 1 < xs.length; i += 2) if (!best || xs[i + 1] - xs[i] > best.w) best = { w: xs[i + 1] - xs[i], p: [(xs[i] + xs[i + 1]) / 2, y] };
  }
  return best ? best.p : [b.x + b.w / 2, b.y + b.h / 2];
}
export const rectPts = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** a footprint's own frame: centre, length along its longest edge, width across it, angle of that edge */
export function frameOf(pts: Pt[] | null | undefined): Frame | null {
  if (!pts || pts.length < 3) return null;
  let best = -1, a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], d = dist(p, q);
    if (d > best + 1e-6) { best = d; a = Math.atan2(q[1] - p[1], q[0] - p[0]); }
  }
  while (a > Math.PI / 2 + 1e-9) a -= Math.PI;
  while (a <= -Math.PI / 2 + 1e-9) a += Math.PI;
  const rot = (x: number, y: number, t: number): Pt => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
  const b = bbox(pts.map(([x, y]) => rot(x, y, -a)))!;
  let L = b.w, W = b.h;
  const [cx, cy] = rot(b.x + b.w / 2, b.y + b.h / 2, a);
  if (W > L + 1e-6) { [L, W] = [W, L]; a += a > 0 ? -Math.PI / 2 : Math.PI / 2; }
  return { cx, cy, L, W, a };
}
export const rotPts = (pts: Pt[], a: number, cx: number, cy: number): Pt[] => {
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [r1(cx + (x - cx) * c - (y - cy) * s), r1(cy + (x - cx) * s + (y - cy) * c)]);
};
export const rotRect = (cx: number, cy: number, L: number, W: number, a: number) =>
  rotPts([[cx - L / 2, cy - W / 2], [cx + L / 2, cy - W / 2], [cx + L / 2, cy + W / 2], [cx - L / 2, cy + W / 2]], a, cx, cy);
export const isRect = (pts: Pt[]) =>
  pts.length === 4 &&
  [0, 1, 2, 3].every(i => {
    const p = pts[i], q = pts[(i + 1) % 4], r = pts[(i + 2) % 4];
    const v1 = [q[0] - p[0], q[1] - p[1]], v2 = [r[0] - q[0], r[1] - q[1]];
    return Math.abs(v1[0] * v2[0] + v1[1] * v2[1]) < 1e-2 * (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]) + 1);
  });
/** footprint angle in degrees, 0–180 */
export const ptsDeg = (pts: Pt[]) => {
  const F = frameOf(pts)!;
  return Math.round(((((F.a * 180) / Math.PI) % 180) + 180) % 180 * 10) / 10;
};
/** SVG transform into a footprint's own frame */
export const fTx = (F: Frame) => `translate(${F.cx.toFixed(1)} ${F.cy.toFixed(1)}) rotate(${((F.a * 180) / Math.PI).toFixed(2)})`;
/** a box in the footprint's frame, inset by ins */
export const fBox = (F: Frame, ins: number): Box => ({ x: -F.L / 2 + ins, y: -F.W / 2 + ins, w: F.L - 2 * ins, h: F.W - 2 * ins });
export const movePts = (pts: Pt[], dx: number, dy: number): Pt[] => pts.map(([a, b]) => [r1(a + dx), r1(b + dy)]);
