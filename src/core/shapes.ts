/* Vessel-section shapes, drawn as SVG markup in a box along its long axis. */
import type { Box } from './geometry';

export const PAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const SHAPES: [string, string][] = [
  ['box', 'Plain'], ['dbottom', 'Double bottom block'], ['side', 'Side shell block'], ['bow', 'Bow block'], ['stern', 'Stern block'],
  ['deckhouse', 'Deckhouse / superstructure'], ['panel', 'Flat panel / deck panel'], ['unit', 'Outfit unit / module'], ['laydown', 'Laydown stack'], ['hull', 'Hull']
];
export const shapeLabel = (k: string) => SHAPES.find(s => s[0] === k)?.[1] || 'Plain';

export interface ShapeOpt { sw?: number; ghost?: boolean; stroke?: string }

type UV = [number, number];
export function shapeSVG(kind: string, b: Box, ori: number, fill: string, k: number, opt: ShapeOpt = {}) {
  const horiz = b.w >= b.h, fu = ori & 1, fv = ori & 2;
  const P = (u: number, v: number): [number, number] => {
    u = fu ? 1 - u : u; v = fv ? 1 - v : v;
    return horiz ? [b.x + u * b.w, b.y + v * b.h] : [b.x + v * b.w, b.y + u * b.h];
  };
  const f = (p: [number, number]) => p[0].toFixed(1) + ' ' + p[1].toFixed(1);
  const path = (c: (string | UV)[]) => c.map(x => (typeof x === 'string' ? x : f(P(x[0], x[1])))).join(' ');
  const line = (u1: number, v1: number, u2: number, v2: number) => `M${f(P(u1, v1))}L${f(P(u2, v2))}`;
  const R = (u0: number, v0: number, u1: number, v1: number) => path(['M', [u0, v0], 'L', [u1, v0], 'L', [u1, v1], 'L', [u0, v1], 'Z']);
  const sw = (opt.sw || 1) * k, det = opt.ghost ? 'none' : 'rgba(255,255,255,.5)';
  const st = opt.ghost
    ? `fill="none" stroke="${opt.stroke || 'var(--fg-2)'}" stroke-width="${1.4 * k}" stroke-dasharray="${5 * k} ${3.5 * k}"`
    : `fill="${fill}" stroke="${opt.stroke || 'rgba(5,4,1,.6)'}" stroke-width="${sw}"`;
  let out = '', d = '';
  const outline = (o: string) => (out += `<path d="${o}" ${st}/>`);
  switch (kind) {
    case 'dbottom': outline(R(0, 0, 1, 1)); [0.2, 0.4, 0.6, 0.8].forEach(u => (d += line(u, 0.06, u, 0.94))); d += line(0.04, 0.5, 0.96, 0.5); break;
    case 'side': outline(path(['M', [0, 0], 'L', [1, 0], 'L', [1, 0.62], 'Q', [0.5, 1.02], [0, 0.62], 'Z'])); [0.2, 0.4, 0.6, 0.8].forEach(u => (d += line(u, 0.05, u, 0.62 + 0.8 * u * (1 - u) - 0.05))); d += line(0.03, 0.3, 0.97, 0.3); break;
    case 'bow': outline(path(['M', [0, 0], 'L', [0.5, 0], 'Q', [0.93, 0.04], [1, 0.5], 'Q', [0.93, 0.96], [0.5, 1], 'L', [0, 1], 'Z'])); d += line(0.04, 0.5, 0.9, 0.5); [0.2, 0.4].forEach(u => (d += line(u, 0.06, u, 0.94))); d += line(0.62, 0.14, 0.62, 0.86); break;
    case 'stern': outline(path(['M', [0.2, 0], 'L', [1, 0], 'L', [1, 1], 'L', [0.2, 1], 'Q', [0, 0.92], [0, 0.5], 'Q', [0, 0.08], [0.2, 0], 'Z'])); d += line(0.08, 0.5, 0.96, 0.5); [0.45, 0.7].forEach(u => (d += line(u, 0.06, u, 0.94))); d += R(0.12, 0.42, 0.2, 0.58); break;
    case 'deckhouse': outline(R(0, 0, 1, 1)); d += R(0.1, 0.14, 0.9, 0.86) + R(0.3, 0.32, 0.7, 0.68); for (let u = 0.14; u < 0.88; u += 0.08) d += line(u, 0.14, u, 0.2); break;
    case 'panel': outline(R(0, 0, 1, 1)); [0.2, 0.4, 0.6, 0.8].forEach(v => (d += line(0.03, v, 0.97, v))); d += line(0.5, 0.05, 0.5, 0.95); break;
    case 'unit': {
      outline(R(0, 0, 1, 1)); d += R(0.06, 0.08, 0.94, 0.92) + line(0.06, 0.26, 0.94, 0.26);
      const r = Math.min(b.w, b.h) * 0.14;
      ([[0.32, 0.58], [0.6, 0.58]] as UV[]).forEach(([u, v]) => {
        const [x, y] = P(u, v);
        d += `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0`;
      });
      d += line(0.8, 0.4, 0.8, 0.8);
      break;
    }
    case 'laydown': ([[0, 0.32, 0.9, 1], [0.05, 0.16, 0.95, 0.84], [0.1, 0, 1, 0.68]] as [number, number, number, number][]).forEach(r => outline(R(...r))); d += line(0.14, 0.34, 0.96, 0.34) + line(0.14, 0.5, 0.96, 0.5); break;
    case 'hull': outline(path(['M', [0, 0.08], 'L', [0.74, 0.03], 'Q', [0.97, 0.18], [1, 0.5], 'Q', [0.97, 0.82], [0.74, 0.97], 'L', [0, 0.92], 'Z'])); d += line(0.03, 0.5, 0.92, 0.5); d += R(0.2, 0.3, 0.45, 0.7); for (let u = 0.1; u < 0.8; u += 0.1) d += line(u, 0.1, u, 0.16) + line(u, 0.84, u, 0.9); break;
    default: outline(R(0, 0, 1, 1));
  }
  if (d && !opt.ghost) out += `<path d="${d}" fill="none" stroke="${det}" stroke-width="${sw}"/>`;
  return out;
}

/** small picture of a shape, for lists and the side panel */
export const shapeIconSVG = (kind: string, col = 'var(--fg-2)') =>
  `<svg viewBox="0 0 44 26" width="44" height="26" aria-hidden="true">${shapeSVG(kind, { x: 2, y: 3, w: 40, h: 20 }, 0, col, 1, { sw: 0.8 })}</svg>`;
