/* Reading a yard drawing or side-profile picture: an image, an SVG, or the first page of a PDF. */

const MAXPX = 4000;
export interface Picture { src: string; w: number; h: number }

function fileURL(file: File) {
  return new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
}
function loadImg(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('the image would not open')); i.src = src; });
}
/** PNG or JPEG, whichever is smaller */
function canvasOut(cv: HTMLCanvasElement) { const a = cv.toDataURL('image/png'), b = cv.toDataURL('image/jpeg', 0.88); return a.length <= b.length ? a : b; }

async function imageFile(file: File): Promise<Picture> {
  const img = await loadImg(await fileURL(file));
  const k = Math.min(1, MAXPX / Math.max(img.naturalWidth, img.naturalHeight));
  const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
  const c = cv.getContext('2d')!; c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(img, 0, 0, cv.width, cv.height);
  return { src: canvasOut(cv), w: cv.width, h: cv.height };
}
async function svgFile(file: File): Promise<Picture> {
  const txt = await file.text();
  const r = new DOMParser().parseFromString(txt, 'image/svg+xml').documentElement;
  let w = parseFloat(r.getAttribute('width') || ''), h = parseFloat(r.getAttribute('height') || '');
  const vb = (r.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if ((!w || !h) && vb.length === 4) { w = vb[2]; h = vb[3]; }
  if (!w || !h) { w = 2400; h = 1500; }
  const k = Math.max(1, 2000 / Math.max(w, h));
  return { src: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(txt))), w: Math.round(w * k), h: Math.round(h * k) };
}
async function pdfToImage(file: File): Promise<Picture> {
  // loaded only when someone opens a PDF, so the app itself stays small
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await pdf.getPage(1);
  const v1 = page.getViewport({ scale: 1 }), k = MAXPX / Math.max(v1.width, v1.height), vp = page.getViewport({ scale: k });
  const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const c = cv.getContext('2d')!; c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: c, viewport: vp, canvas: cv }).promise;
  return { src: canvasOut(cv), w: cv.width, h: cv.height };
}

export function readPicture(file: File): Promise<Picture> {
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return pdfToImage(file);
  if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') return svgFile(file);
  return imageFile(file);
}
