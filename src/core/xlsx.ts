/* .xlsx written and read in the browser with no add-ins: a stored (uncompressed) zip on the way out,
   and the browser's own DecompressionStream on the way in. */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();

export function zipStore(files: [string, string | Uint8Array][]) {
  const enc = new TextEncoder(); const parts: Uint8Array[] = [], cen: Uint8Array[] = []; let off = 0;
  files.forEach(([name, data]) => {
    const nb = enc.encode(name), db = typeof data === 'string' ? enc.encode(data) : data, crc = CRC(db);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true); h.setUint32(14, crc, true); h.setUint32(18, db.length, true); h.setUint32(22, db.length, true); h.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(h.buffer), nb, db);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true); c.setUint32(20, db.length, true); c.setUint32(24, db.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + db.length;
  });
  const cs = cen.reduce((s, b) => s + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(e.buffer)] as BlobPart[], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const xesc = (s: unknown) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
const colL = (i: number) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

/** a cell: text, a number, a date as a day number, or empty */
export type Cell = string | number | { d: number } | null | undefined;
export interface Sheet { name: string; widths?: number[]; rows: Cell[][] }

function sheetXml(rows: Cell[][], widths?: number[]) {
  const cols = widths ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = colL(ci) + (ri + 1), st = ri === 0 ? ' s="1"' : '';
    if (v == null || v === '') return '';
    if (typeof v === 'object' && v.d != null) return `<c r="${ref}" s="2"><v>${v.d + 25569}</v></c>`;
    if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xesc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${body}</sheetData></worksheet>`;
}

export function buildXlsx(sheets: Sheet[]) {
  const f: [string, string][] = [];
  f.push(['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`]);
  f.push(['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`]);
  f.push(['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xesc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`]);
  f.push(['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
  f.push(['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F2F4C"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`]);
  sheets.forEach((s, i) => f.push([`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows, s.widths)]));
  return zipStore(f);
}

/* ---------- reading ---------- */
async function unzip(buf: ArrayBuffer) {
  const dv = new DataView(buf);
  let e = buf.byteLength - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not an .xlsx file');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const out: Record<string, () => Promise<string>> = {}; const dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    const meth = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nl)); p += 46 + nl + xl + cl;
    const lnl = dv.getUint16(lo + 26, true), lxl = dv.getUint16(lo + 28, true);
    const data = new Uint8Array(buf, lo + 30 + lnl + lxl, csz);
    out[name] = async () => {
      if (meth === 0) return dec.decode(data);
      const s = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(s).text();
    };
  }
  return out;
}

export type Book = Record<string, (string | number | boolean)[][]>;

export async function readXlsx(buf: ArrayBuffer): Promise<Book> {
  const z = await unzip(buf); const P = new DOMParser();
  const xml = async (n: string) => (z[n] ? P.parseFromString(await z[n](), 'application/xml') : null);
  const wb = await xml('xl/workbook.xml'), rels = await xml('xl/_rels/workbook.xml.rels'), ssx = await xml('xl/sharedStrings.xml');
  if (!wb || !rels) throw new Error('not an .xlsx file');
  const ss = ssx ? [...ssx.getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
  const relMap: Record<string, string> = {};
  [...rels.getElementsByTagName('Relationship')].forEach(r => (relMap[r.getAttribute('Id')!] = r.getAttribute('Target')!));
  const out: Book = {};
  for (const sh of [...wb.getElementsByTagName('sheet')]) {
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || '';
    let t = relMap[rid] || '';
    t = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
    const doc = await xml(t); if (!doc) continue;
    const rows: (string | number | boolean)[][] = [];
    for (const r of [...doc.getElementsByTagName('row')]) {
      const ri = +r.getAttribute('r')! - 1; const row: (string | number | boolean)[] = [];
      for (const c of [...r.getElementsByTagName('c')]) {
        const ref = c.getAttribute('r');
        const ci = ref ? ref.replace(/\d+/g, '').split('').reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1 : row.length;
        const ty = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]?.textContent;
        let val: string | number | boolean;
        if (ty === 's') val = ss[+v!];
        else if (ty === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
        else if (ty === 'b') val = v === '1';
        else if (ty === 'str' || ty === 'e') val = v ?? '';
        else val = v == null ? '' : +v;
        row[ci] = val;
      }
      rows[ri] = row;
    }
    out[sh.getAttribute('name')!] = rows.filter(Boolean).map(r => Array.from(r, v => v ?? ''));
  }
  return out;
}

export function parseCsv(t: string) {
  const rows: string[][] = []; let row: string[] = [], f = '', q = false;
  const semi = !t.includes(',');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',' || (c === ';' && semi)) { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
