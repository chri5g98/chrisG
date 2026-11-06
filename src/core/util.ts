/* Small helpers shared by every part of FMAREA. Dates are whole day numbers (days since 1 Jan 1970, UTC). */

export const DAY = 864e5;
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'];

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const uid = (p = 'x') => p + Math.random().toString(36).slice(2, 9);
export const r1 = (v: number) => Math.round(v * 10) / 10;

/** "2027-02-01", "1/2/2027" or a day number → day number */
export function dn(s: string | number | null | undefined): number | null {
  if (s == null || s === '') return null;
  if (typeof s === 'number') return s;
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s);
  if (m) return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY);
  const u = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (u) return Math.round(Date.UTC(+u[3], +u[2] - 1, +u[1]) / DAY);
  return null;
}
/** day number → "2027-02-01" */
export const ds = (n: number | null | undefined) => (n == null ? '' : new Date(n * DAY).toISOString().slice(0, 10));
/** "1 Feb 27" */
export const fd = (n: number | null | undefined) => {
  if (n == null) return '–';
  const d = new Date(n * DAY);
  return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + String(d.getUTCFullYear()).slice(2);
};
/** "Mon 1 Feb 2027" */
export const fdl = (n: number) => {
  const d = new Date(n * DAY);
  return DOW[((n % 7) + 7) % 7] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
};
/** 0 = Monday */
export const dow = (n: number) => (((n + 3) % 7) + 7) % 7;
export const monday = (n: number) => n - dow(n);
export const weekNo = (n: number) => {
  const d = new Date(n * DAY);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((+t - +y0) / DAY + 1) / 7);
};
export const todayNum = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / DAY);
export const TODAY = todayNum();
/** first of the month after day n */
export const nextMonth = (n: number) => {
  const d = new Date(n * DAY);
  return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY);
};
export const monthStart = (n: number) => {
  const d = new Date(n * DAY);
  return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY);
};

export const n0 = (v: unknown) => {
  const x = parseFloat(String(v));
  return isFinite(x) ? x : 0;
};
export const nN = (v: unknown): number | null => {
  if (v === '' || v == null) return null;
  const x = parseFloat(String(v));
  return isFinite(x) ? x : null;
};
export const trimTo = (s: string | null | undefined, n: number) => {
  s = s || '';
  n = Math.max(3, Math.floor(n));
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
export const byCodeCmp = (a: { code?: string }, b: { code?: string }) =>
  (a.code || '').localeCompare(b.code || '', 'en', { numeric: true });
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}
