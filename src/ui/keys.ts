/* Keyboard: Ctrl+Z / Ctrl+Y undo and redo, Ctrl+K finds an item, Esc closes the panel,
   and the page on screen gets the rest (arrow keys, R, Delete…). */
import { app } from '../store/app';

type Handler = (e: KeyboardEvent) => boolean;
let pageKeys: Handler | null = null;
/** the page on screen registers its keys every time it draws */
export const setPageKeys = (h: Handler | null) => { pageKeys = h; };

let dirtyField: EventTarget | null = null;
export function installKeys() {
  document.addEventListener('input', e => { dirtyField = e.target; }, true);
  document.addEventListener('change', () => { dirtyField = null; }, true);
  document.addEventListener('focusin', () => { dirtyField = null; }, true);
  document.addEventListener('keydown', e => {
    const a = document.activeElement as HTMLElement | null;
    const typing = !!a && /INPUT|TEXTAREA|SELECT/.test(a.tagName);
    const fresh = typing && dirtyField !== a; // in a field you have not typed in yet: Ctrl+Z undoes the last change
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'k') { e.preventDefault(); document.getElementById('tFind')?.focus(); return; }
    if (mod && k === 'z' && (!typing || fresh)) { e.preventDefault(); if (e.shiftKey) app.redo(); else app.undo(); return; }
    if (mod && k === 'y' && (!typing || fresh)) { e.preventDefault(); app.redo(); return; }
    if (typing || app.modals.length) return;
    if (pageKeys && pageKeys(e)) return;
    if (e.key === 'Escape') app.closeDrawer();
  });
}
