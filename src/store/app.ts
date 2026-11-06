/* The app's single store: the plan data (with undo), this browser's view settings, and passing UI state.
   Changes go through commit(), which uses Immer so edits read like plain assignments. */
import { produce, setAutoFreeze } from 'immer';
import { useSyncExternalStore, type ReactNode } from 'react';
import type { Item, PlanState, ViewState } from '../core/types';
import { Plan } from '../core/plan';
import { normalise } from '../core/normalise';
import { exampleState } from '../core/example';
import { TODAY } from '../core/util';
import { idb } from './idb';

setAutoFreeze(false);

const LSK = 'fmarea_state', LSV = 'fmarea_view';

export interface ToastMsg { id: number; msg: string; undo?: boolean; act?: { label: string; fn: () => void } }
export interface ModalEntry { id: number; node: (close: () => void) => ReactNode }
export interface PopoverEntry { x: number; y: number; node: (close: () => void) => ReactNode }
export type EditSel = { kind: 'fp' | 'area'; id: string } | null;

function defaultView(): ViewState {
  return {
    page: 'floor', date: TODAY, hide: [], focus: 'all', colour: 'proj', ghost: true, label: 'code', gz: 'weeks', gGroup: 'area', gw: 320,
    collapsed: [], shut: [], stages: true, f: {}, tblSort: 'start', tblDir: 1, itemsView: 'list', ishut: [], name: '', capWeeks: 26, capBy: 'proj',
    tool: 'select', toolShape: 'rect', drawArea: '', fpArea: '', vroot: '', sel: null
  };
}
function loadView(): ViewState {
  let v: Partial<ViewState> & { page?: string } = {};
  try { v = JSON.parse(localStorage.getItem(LSV) || '{}'); } catch { /* private window */ }
  const out = { ...defaultView(), ...v, sel: null } as ViewState;
  if ((out.page as string) === 'occ') out.page = 'cap';
  return out;
}

type Listener = () => void;

class AppStore {
  S: PlanState = normalise(exampleState());
  V: ViewState = loadView();
  undoStack: PlanState[] = [];
  redoStack: PlanState[] = [];
  dirty = false;
  ready = false;

  /* passing UI state */
  toastMsg: ToastMsg | null = null;
  modals: ModalEntry[] = [];
  popover: PopoverEntry | null = null;
  drawer: { id: string | null; focusStage?: string } = { id: null };
  editLayout = false;
  esel: EditSel = null;
  /** side-profile editing on the Vessel build page */
  vedit = false;

  private listeners = new Set<Listener>();
  private version = 0;
  private plan: { S: PlanState; hide: string[]; P: Plan } | null = null;
  private gestureBase: PlanState | null = null;
  private saveTimer = 0;
  private toastTimer = 0;
  private seq = 0;
  /** called after every change to the data (the shared file listens) */
  onChange: (() => void) | null = null;

  /* ---------- subscription ---------- */
  subscribe = (l: Listener) => { this.listeners.add(l); return () => this.listeners.delete(l); };
  getVersion = () => this.version;
  emit() { this.version++; this.listeners.forEach(l => l()); }

  /** the plan worked out from the data, rebuilt only when the data or the hidden projects change */
  get P(): Plan {
    if (!this.plan || this.plan.S !== this.S || this.plan.hide !== this.V.hide) this.plan = { S: this.S, hide: this.V.hide, P: new Plan(this.S, this.V.hide) };
    return this.plan.P;
  }

  /* ---------- loading and saving in this browser ---------- */
  async init() {
    try {
      const st = await idb('readonly', s => s.get('state'));
      if (st) this.S = normalise(st);
      else {
        const j = localStorage.getItem(LSK);
        if (j) this.S = normalise(JSON.parse(j));
      }
    } catch { /* first visit or storage blocked: keep the example */ }
    this.ready = true;
    this.emit();
  }
  saveLocal() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      idb('readwrite', s => s.put(JSON.parse(JSON.stringify(this.S)), 'state')).catch(() => {});
      try { localStorage.removeItem(LSK); } catch { /* ignore */ }
    }, 300);
  }

  /* ---------- changing the data ---------- */
  /** change the data; return false from fn to cancel. Adds an undo step and saves. */
  commit(fn: (d: PlanState) => void | false, msg?: string | null, act?: ToastMsg['act']) {
    let cancelled = false;
    const next = produce(this.S, d => { if (fn(d) === false) cancelled = true; });
    if (cancelled || next === this.S) { this.emit(); return false; }
    this.pushUndo(this.S);
    this.S = next;
    this.changed();
    if (msg) this.toast(msg, { undo: true, act });
    return true;
  }
  private pushUndo(prev: PlanState) {
    this.undoStack.push(prev);
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  private changed() { this.dirty = true; this.saveLocal(); this.onChange?.(); this.emit(); }
  /** live changes while dragging; endGesture() turns them into one undo step */
  beginGesture() { this.gestureBase = this.S; }
  preview(fn: (d: PlanState) => void) { this.S = produce(this.S, fn); this.emit(); }
  endGesture() {
    const base = this.gestureBase; this.gestureBase = null;
    if (base && base !== this.S) { this.pushUndo(base); this.changed(); return true; }
    return false;
  }
  cancelGesture() { if (this.gestureBase) { this.S = this.gestureBase; this.gestureBase = null; this.emit(); } }
  undo = () => {
    const prev = this.undoStack.pop(); if (!prev) return;
    this.redoStack.push(this.S); this.S = prev; this.changed(); this.toast('Undone');
  };
  redo = () => {
    const next = this.redoStack.pop(); if (!next) return;
    this.undoStack.push(this.S); this.S = next; this.changed(); this.toast('Redone');
  };
  /** replace everything (shared file read, restore): keeps undo unless told otherwise */
  replace(st: PlanState, opts: { keepUndo?: boolean; quiet?: boolean } = {}) {
    if (opts.keepUndo) this.pushUndo(this.S);
    else { this.undoStack.length = 0; this.redoStack.length = 0; }
    this.S = st;
    if (!opts.quiet) this.dirty = true;
    this.saveLocal();
    this.emit();
  }
  /** set by the shared file once it has saved */
  setDirty(v: boolean) { this.dirty = v; this.emit(); }

  /* ---------- view settings (this browser only) ---------- */
  setView(patch: Partial<ViewState>) {
    this.V = { ...this.V, ...patch };
    try { const v: Partial<ViewState> = { ...this.V }; delete v.sel; localStorage.setItem(LSV, JSON.stringify(v)); } catch { /* ignore */ }
    this.emit();
  }
  go(page: ViewState['page']) { this.drawer = { id: null }; this.popover = null; this.setView({ page }); document.getElementById('main')?.scrollTo(0, 0); }

  /* ---------- passing UI ---------- */
  toast(msg: string, o: { undo?: boolean; act?: ToastMsg['act'] } = {}) {
    this.toastMsg = { id: ++this.seq, msg, ...o };
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toastMsg = null; this.emit(); }, 4200);
    this.emit();
  }
  closeToast() { this.toastMsg = null; this.emit(); }
  openModal(node: ModalEntry['node']) { const id = ++this.seq; this.modals = [...this.modals, { id, node }]; this.emit(); return () => this.closeModal(id); }
  closeModal(id: number) { this.modals = this.modals.filter(m => m.id !== id); this.emit(); }
  openPopover(x: number, y: number, node: PopoverEntry['node']) { this.popover = { x, y, node }; this.emit(); }
  closePopover() { if (this.popover) { this.popover = null; this.emit(); } }
  openItem(id: string, focusStage?: string) { this.drawer = { id, focusStage }; this.V = { ...this.V, sel: id }; this.emit(); }
  closeDrawer() { this.drawer = { id: null }; this.emit(); }
  setEdit(on: boolean) { this.editLayout = on; this.esel = null; if (on) { this.drawer = { id: null }; this.V = { ...this.V, sel: null }; } this.emit(); }
  setEsel(s: EditSel) { this.esel = s; this.emit(); }
  setVedit(on: boolean) { this.vedit = on; this.emit(); }

  /* ---------- small helpers for commits ---------- */
  static item(d: PlanState, id: string): Item { const it = d.items.find(i => i.id === id); if (!it) throw new Error('item gone'); return it; }
}

export const app = new AppStore();
export const itemIn = AppStore.item;
/** re-render when anything in the store changes */
export function useApp() {
  useSyncExternalStore(app.subscribe, app.getVersion);
  return app;
}
