# FMAREA – footprint & area planner

FMAREA plans what sits where in the yard: every hall and outdoor area, the footprints inside it, and the blocks, units and hulls that take those footprints over time. It shows double-bookings, capacity shortfalls, crane and size limits, and how each vessel comes together.

This is the React + TypeScript rebuild of the single-file HTML version. It does everything the HTML version did, and opens the same `FMAREA-data.json` files and backups.

## What's in it

| Page | What it does |
| --- | --- |
| **Floor plan** | The yard drawing with each footprint and what is in it on a chosen date. Drag blocks between footprints, scrub or play through the weeks, and switch to **Edit layout** to upload a drawing (PNG, JPG, SVG or PDF), set its scale and draw areas and footprints. |
| **Plan** | Gantt of each item's time in its area, with its work stages. Drag to move or stretch, drag into another group to change area or footprint, drag the ● to link items in sequence. |
| **Vessel build** | Side profile of each hull (standard hull or your own picture) showing units joining blocks and blocks joining the hull over time, plus the assembly tree. |
| **Capacity** | Footprints needed each week against footprints available, per area and combined. |
| **Items** | Spreadsheet-style table. Type into cells, Enter moves down, paste blocks of cells from Excel, bulk edit. |
| **Areas & footprints**, **Data**, **Settings** | Names, colours, crane limits, item types and their standard stages, Excel import/export, backups, the shared file. |

Print / PDF (A4 to A0 at true size) and Export to Excel are on the top bar.

## Sharing with colleagues

In **Settings → Shared file**, the first person creates `FMAREA-data.json` in a SharePoint library that is synced with OneDrive; everyone else opens it. Changes save automatically and colleagues' changes are merged in record by record about every 15 seconds. This needs Edge or Chrome on a PC. Without it, data is kept in the browser.

## Running it

You need [Node.js](https://nodejs.org) 20 or later.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the planning logic
npm run build      # production build in dist/
```

`dist/` is a static site: it can be hosted anywhere, including a SharePoint document library or GitHub Pages. The workflow in `.github/workflows/ci.yml` tests every push and publishes `master` or the `claude/fmarea-app-rebuild-1ep5wh` branch to GitHub Pages once Pages is turned on (Settings → Pages → Source: GitHub Actions). Once opened, Edge and Chrome offer to install it as an app, and it keeps working offline.

## How the code is laid out

```
src/
  core/      planning logic with no UI: data types, geometry, checks, capacity,
             Excel, shared-file merge, and the SVG drawings used on screen and in print
  store/     the app store (undo/redo, saving in the browser) and the shared file
  ui/        shell, side panel, dialogs, inputs, keyboard shortcuts
  pages/     one file per page
```

All data changes go through `app.commit()`, which records an undo step and saves. `core/plan.ts` works out everything derived from the data (problems, capacity, the build tree) once per change.
