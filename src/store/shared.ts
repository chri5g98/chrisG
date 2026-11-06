/* The shared file: FMAREA-data.json in a SharePoint library synced by OneDrive, so everyone plans on the same data.
   Saves shortly after each change, checks for colleagues' changes every 15 seconds, and merges record by record. */
import { app } from './app';
import { idb } from './idb';
import { normalise } from '../core/normalise';
import { mergeStates } from '../core/merge';
import type { PlanState } from '../core/types';

/* File System Access API (Edge and Chrome) */
interface FSHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>;
  queryPermission(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(o: { mode: 'readwrite' }): Promise<PermissionState>;
}
type PickerOpts = { types: { description: string; accept: Record<string, string[]> }[]; suggestedName?: string };
declare global {
  interface Window {
    showOpenFilePicker?: (o: PickerOpts) => Promise<FSHandle[]>;
    showSaveFilePicker?: (o: PickerOpts) => Promise<FSHandle>;
  }
}

export type ShareStatus = 'local' | 'shared' | 'reconnect';

class SharedFile {
  handle: FSHandle | null = null;
  status: ShareStatus = 'local';
  lastCheck: Date | null = null;
  private base: PlanState | null = null;
  private timer = 0;
  private busy = false;
  private perm = false;
  private poll = 0;
  /** asks the person to reconnect (set by the UI) */
  onReconnectNeeded: (() => void) | null = null;

  fsOK = () => typeof window !== 'undefined' && 'showOpenFilePicker' in window;
  get name() { return this.handle?.name || ''; }

  private async read(): Promise<PlanState | null> {
    const t = await (await this.handle!.getFile()).text();
    return t.trim() ? normalise(JSON.parse(t)) : null;
  }
  private async write(st: PlanState) {
    const w = await this.handle!.createWritable();
    await w.write(JSON.stringify(st));
    await w.close();
  }

  async init() {
    app.onChange = () => this.queue();
    if (!this.fsOK()) return;
    try { this.handle = await idb<FSHandle | undefined>('readonly', s => s.get('file')) || null; } catch { this.handle = null; }
    if (!this.handle) return;
    this.status = 'reconnect';
    try { this.perm = (await this.handle.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch { this.perm = false; }
    if (this.perm) await this.connected();
    else this.onReconnectNeeded?.();
    app.emit();
  }
  async reconnect() {
    if (!this.handle) return false;
    try { this.perm = (await this.handle.requestPermission({ mode: 'readwrite' })) === 'granted'; } catch { this.perm = false; }
    if (this.perm) await this.connected();
    return this.perm;
  }
  workLocally() { this.status = 'local'; app.emit(); }

  private startPolling() {
    clearInterval(this.poll);
    this.poll = window.setInterval(() => this.check(), 15000);
    window.removeEventListener('focus', this.onFocus);
    window.addEventListener('focus', this.onFocus);
  }
  private onFocus = () => this.check();

  private async connected() {
    this.status = 'shared';
    try {
      const st = await this.read();
      if (st) { this.base = JSON.parse(JSON.stringify(st)); app.replace(st, { quiet: true }); app.dirty = false; }
      else await this.save(true);
    } catch (e) { app.toast('Could not read the shared file: ' + (e as Error).message); }
    this.startPolling();
    app.emit();
  }

  async pick(create: boolean) {
    if (!this.fsOK()) { app.toast('Shared files need Edge or Chrome on a PC'); return; }
    const opts: PickerOpts = { types: [{ description: 'FMAREA data', accept: { 'application/json': ['.json'] } }] };
    try {
      this.handle = create ? await window.showSaveFilePicker!({ ...opts, suggestedName: 'FMAREA-data.json' }) : (await window.showOpenFilePicker!(opts))[0];
    } catch { return; } // cancelled
    await idb('readwrite', s => s.put(this.handle, 'file'));
    this.perm = true;
    if (create) {
      this.base = null; await this.save(true); this.status = 'shared'; this.startPolling(); app.emit();
      app.toast('Shared file created – everyone else opens it from Settings');
    } else {
      await this.connected();
      app.toast('Opened ' + this.handle.name);
    }
  }
  async disconnect() {
    this.handle = null; this.status = 'local'; clearInterval(this.poll);
    try { await idb('readwrite', s => s.delete('file')); } catch { /* ignore */ }
    app.emit();
  }
  queue() {
    if (this.status !== 'shared') { app.dirty = false; return; }
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.save(), 700);
  }
  async save(force = false) {
    if (!this.handle || this.busy) { if (this.busy) { clearTimeout(this.timer); this.timer = window.setTimeout(() => this.save(), 600); } return; }
    this.busy = true;
    try {
      const theirs = force ? null : await this.read().catch(() => null);
      let S = app.S;
      if (theirs && this.base && (theirs._meta?.rev || 0) > (this.base._meta?.rev || 0)) {
        const m = mergeStates(this.base, S, theirs); S = normalise(m.state);
        if (m.conflicts) app.toast(`${theirs._meta.by || 'A colleague'} changed ${m.conflicts} of the same records – yours were kept`);
      }
      S = { ...S, _meta: { rev: Math.max(theirs?._meta?.rev || 0, S._meta?.rev || 0) + 1, by: app.V.name || 'Someone', at: new Date().toISOString() } };
      await this.write(S);
      this.base = JSON.parse(JSON.stringify(S));
      this.lastCheck = new Date();
      app.S = S; app.saveLocal(); app.setDirty(false);
    } catch (e) { app.toast('Could not save to the shared file: ' + (e as Error).message); }
    this.busy = false;
    app.emit();
  }
  async check() {
    if (this.status !== 'shared' || !this.handle || this.busy || !this.perm) return;
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('#page,.drawer')) return; // never pull the rug from under someone typing
    try {
      const theirs = await this.read(); this.lastCheck = new Date();
      if (theirs && (theirs._meta?.rev || 0) > (this.base?._meta?.rev || 0)) {
        if (app.dirty) { await this.save(); return; }
        const m = mergeStates(this.base, app.S, theirs);
        const S = normalise(m.state); S._meta = theirs._meta;
        this.base = JSON.parse(JSON.stringify(theirs));
        app.S = S; app.saveLocal();
        app.toast(`Updated with ${theirs._meta.by || 'a colleague'}'s changes`);
      }
    } catch { /* the file may be mid-sync; try again next time */ }
    app.emit();
  }
}

export const shared = new SharedFile();
