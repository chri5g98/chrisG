/* The FMAREA data file (v2). Same shape as the HTML version, so existing FMAREA-data.json files and backups open as they are. */

export type Pt = [number, number];
export type ShapeKind = 'box' | 'dbottom' | 'side' | 'bow' | 'stern' | 'deckhouse' | 'panel' | 'unit' | 'laydown' | 'hull';

export interface Project { id: string; code: string; name: string; color: string }
export interface StageType { id: string; name: string; color: string }
export interface StdStage { st: string; pct: number }
export interface ItemType { id: string; name: string; color: string; shape: ShapeKind | string; std: StdStage[] }
export interface Area {
  id: string; code: string; name: string; kind: string; color: string;
  /** heaviest lift in tonnes; 0 = not checked */
  crane: number; ord: number;
  /** outline in drawing units */
  pts: Pt[];
}
export interface Footprint { id: string; code: string; area: string; kind: 'Build' | 'Laydown' | string; note: string; pts: Pt[] }
export interface Stage { id: string; st: string; start: string; finish: string }
export interface Item {
  id: string; code: string; name: string;
  proj: string; type: string; shape: string;
  area: string; fp: string;
  /** orientation 0–3: bit 1 flips along, bit 2 flips across */
  ori: number;
  l: number | null; w: number | null; wt: number | null;
  start: string; finish: string;
  /** ids of items this one comes after */
  pred: string[];
  note: string;
  stages: Stage[];
  /** id of the item this one joins (unit → block → hull) */
  parent: string;
  /** side-profile shape, in profile picture units */
  zone?: Pt[];
  _pc?: string;
  _same?: number;
}
export interface Drawing { id: string; src: string | null; w: number; h: number; mpu: number | null; name: string; op: number }
export interface Profile { id: string; root: string; src: string | null; w: number; h: number; op: number; name: string }
export interface Meta { rev: number; by?: string; at?: string }
export interface Settings { look: number }

export interface PlanState {
  v: 2;
  _meta: Meta;
  drawing: Drawing;
  projects: Project[];
  types: ItemType[];
  stypes: StageType[];
  areas: Area[];
  footprints: Footprint[];
  items: Item[];
  profiles: Profile[];
  set: Settings;
}

export type Page = 'floor' | 'plan' | 'vessel' | 'cap' | 'items' | 'areas' | 'data' | 'settings';

/** Per-browser view settings (kept in localStorage, not shared, not undone) */
export interface ViewState {
  page: Page;
  date: number;
  hide: string[];
  focus: string;
  colour: 'proj' | 'type' | 'area';
  ghost: boolean;
  label: 'stage' | 'code' | 'name' | 'none';
  gz: 'fit' | 'months' | 'weeks' | 'days' | 'custom';
  gGroup: 'area' | 'fp' | 'tree' | 'proj' | 'type' | 'none';
  gw: number;
  collapsed: string[];
  shut: string[];
  stages: boolean;
  f: { q?: string; type?: string; area?: string; only?: 'problems' | 'unplaced' | 'now' };
  tblSort: string;
  tblDir: number;
  itemsView: 'list' | 'tree';
  ishut: string[];
  name: string;
  capWeeks: number;
  capBy: 'proj' | 'type';
  tool: 'select' | 'fp' | 'area' | 'scale';
  toolShape: 'rect' | 'poly';
  drawArea: string;
  fpArea: string;
  vroot: string;
  sel: string | null;
}

export type ProblemKind = 'heavy' | 'size' | 'stage' | 'clash' | 'join' | 'seq';
export interface Problem { k: ProblemKind; t: string; sg?: string; o?: string }
export interface ClashPair { a: string; b: string; from: number; to: number; fp: string }
