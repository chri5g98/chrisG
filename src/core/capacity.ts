/* Capacity: footprints needed each week against footprints available. */
import { Plan } from './plan';
import { DAY, MON, monday, TODAY } from './util';

export interface Seg { key: string; label: string; color: string; n: number; unp: number }
export interface WeekData { w: number; d: number; n: number; segs: Seg[] }

export function capWeeks(P: Plan, weeks: number) {
  const R = P.R, wk0 = monday(TODAY), out: number[] = [];
  for (let w = weeks === 0 ? monday(R.d0) : wk0; w < (weeks === 0 ? R.d1 : wk0 + weeks * 7); w += 7) out.push(w);
  return out;
}
/** busiest day of the week across the given areas, with its breakdown */
export function weekStack(P: Plan, aids: string[], w: number, by: string): WeekData {
  let best = { n: -1, d: w };
  for (let d = w; d < w + 7; d++) { let n = 0; aids.forEach(id => (n += P.occAt(id, d).n)); if (n > best.n) best = { n, d }; }
  const segs: Seg[] = [];
  if (by === 'area') aids.forEach(id => { const o = P.occAt(id, best.d); if (o.n) { const a = P.area(id)!; segs.push({ key: id, label: a.name, color: a.color, n: o.n, unp: o.unp }); } });
  else {
    const m: Record<string, { n: number; unp: number }> = {};
    aids.forEach(id => { const b = P.breakdown(id, best.d, by); for (const k in b) { m[k] ||= { n: 0, unp: 0 }; m[k].n += b[k].n; m[k].unp += b[k].unp; } });
    const keys = by === 'type' ? P.S.types.map(t => t.id) : P.S.projects.map(p => p.id);
    keys.forEach(k => { if (m[k]) { const o = by === 'type' ? P.typ(k) : P.proj(k); segs.push({ key: k, label: o.name, color: o.color, n: m[k].n, unp: m[k].unp }); } });
  }
  return { w, d: best.d, n: Math.max(0, best.n), segs };
}

export function capChart(data: WeekData[], cap: number, W: number, H: number, o: { print?: boolean; fs?: number; id?: string } = {}) {
  const C = o.print
    ? { ink: '#303036', muted: '#6c6a74', line: '#e4e0e7', surf: '#ffffff', late: '#b8321f', today: '#8d1902' }
    : { ink: 'var(--fg-2)', muted: 'var(--muted)', line: 'var(--line)', surf: 'var(--surface)', late: 'var(--late)', today: 'var(--today)' };
  const fs = o.fs || 1, L = 34 * fs, Rm = 88 * fs, T = 12 * fs, B = 22 * fs, pw = W - L - Rm, ph = H - T - B;
  const max = Math.max(cap, ...data.map(d => d.n), 1);
  const steps = [1, 2, 5, 10, 20, 50, 100]; let step = 1;
  while (max / step > 5) step = steps[steps.indexOf(step) + 1] || step * 2;
  const top = Math.ceil((max * 1.08) / step) * step || 1;
  const y = (v: number) => T + ph - (v / top) * ph, bw = pw / Math.max(1, data.length), gap = Math.min(2 * fs, bw * 0.2);
  const pid = o.id || 'hw';
  let s = `<defs><pattern id="${pid}" width="${6 * fs}" height="${6 * fs}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${6 * fs}" height="${6 * fs}" fill="transparent"/><line x1="0" y1="0" x2="0" y2="${6 * fs}" stroke="#fff" stroke-width="${2.2 * fs}" stroke-opacity=".75"/></pattern></defs>`;
  for (let v = 0; v <= top; v += step) s += `<line x1="${L}" x2="${L + pw}" y1="${y(v)}" y2="${y(v)}" stroke="${C.line}" stroke-width="${v ? 0.6 * fs : 1 * fs}"/><text x="${L - 6 * fs}" y="${y(v) + 3.5 * fs}" text-anchor="end" style="font:500 ${10.5 * fs}px var(--f-mono,monospace);fill:${C.muted}">${v}</text>`;
  let lastM = -1;
  data.forEach((d, i) => {
    const x0 = L + i * bw + gap / 2, w = Math.max(1, bw - gap); let acc = 0;
    d.segs.forEach((g, j) => {
      const yt = y(acc + g.n), yb = y(acc), hgt = Math.max(0, yb - yt - (j ? 1.5 * fs : 0));
      s += `<rect x="${x0}" y="${yt}" width="${w}" height="${hgt}" fill="${g.color}" ${j === d.segs.length - 1 ? `rx="${Math.min(3 * fs, w / 3)}"` : ''}/>`;
      if (g.unp) { const uy = y(acc + g.n), uh = Math.max(0, y(acc + g.n - g.unp) - uy - (j ? 1.5 * fs : 0)); s += `<rect x="${x0}" y="${uy}" width="${w}" height="${uh}" fill="url(#${pid})"/>`; }
      acc += g.n;
    });
    if (d.n > cap) s += `<rect x="${x0 - 0.5 * fs}" y="${y(d.n) - 0.5 * fs}" width="${w + fs}" height="${y(cap) - y(d.n) + fs}" fill="none" stroke="${C.late}" stroke-width="${1.6 * fs}" rx="${2 * fs}"/>`;
    const dt = new Date(d.w * DAY), m = dt.getUTCMonth();
    if (m !== lastM && (i === 0 || dt.getUTCDate() <= 7)) {
      s += `<text x="${x0}" y="${H - 6 * fs}" style="font:500 ${10 * fs}px var(--f-mono,monospace);fill:${C.muted}">${MON[m]}${m === 0 || i === 0 ? ' ' + String(dt.getUTCFullYear()).slice(2) : ''}</text><line x1="${x0 - gap / 2}" x2="${x0 - gap / 2}" y1="${T + ph}" y2="${T + ph + 4 * fs}" stroke="${C.muted}" stroke-width="${fs}"/>`;
      lastM = m;
    }
    if (!o.print) s += `<rect class="cw" data-i="${i}" x="${L + i * bw}" y="${T}" width="${bw}" height="${ph}" fill="transparent" style="cursor:pointer"/>`;
  });
  const ti = data.findIndex(d => d.w <= TODAY && TODAY < d.w + 7);
  if (ti >= 0) { const tx = L + ti * bw + ((TODAY - data[ti].w + 0.5) / 7) * bw; s += `<line x1="${tx}" x2="${tx}" y1="${T}" y2="${T + ph}" stroke="${C.today}" stroke-width="${1.2 * fs}" stroke-dasharray="${3 * fs} ${2 * fs}" pointer-events="none"/>`; }
  s += `<line x1="${L}" x2="${L + pw}" y1="${y(cap)}" y2="${y(cap)}" stroke="${C.ink}" stroke-width="${1.8 * fs}" pointer-events="none"/><text x="${L + pw + 6 * fs}" y="${y(cap) + 4 * fs}" style="font:600 ${11 * fs}px var(--f-body,Arial);fill:${C.ink}">${cap} footprint${cap === 1 ? '' : 's'}</text>`;
  return s;
}
