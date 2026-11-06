/* FMAREA: the app shell and the page on screen. */
import { useState } from 'react';
import { useApp } from './store/app';
import { Rail, TopBar } from './ui/Shell';
import { Drawer } from './ui/Drawer';
import { ModalHost, PopoverHost, Toast } from './ui/Overlays';
import { FloorPlan } from './pages/FloorPlan';
import { PlanGantt } from './pages/PlanGantt';
import { VesselBuild } from './pages/VesselBuild';
import { Capacity } from './pages/Capacity';
import { Items } from './pages/Items';
import { Areas, Data, Settings } from './pages/Admin';

const PAGE = { floor: FloorPlan, plan: PlanGantt, vessel: VesselBuild, cap: Capacity, items: Items, areas: Areas, data: Data, settings: Settings };

export function App() {
  const a = useApp();
  const [menu, setMenu] = useState(false);
  if (!a.ready) return <div className="empty" style={{ height: '100vh', justifyContent: 'center' }}>Loading FMAREA…</div>;
  const Page = PAGE[a.V.page] || FloorPlan;
  return (
    <>
      <div className="app">
        <Rail open={menu} onNav={() => setMenu(false)} />
        {menu ? <div className="rail-scrim" onClick={() => setMenu(false)} /> : null}
        <main id="main">
          <TopBar onMenu={() => setMenu(!menu)} />
          <div id="page"><Page key={a.V.page} /></div>
        </main>
      </div>
      <Drawer />
      <ModalHost />
      <PopoverHost />
      <Toast />
    </>
  );
}
