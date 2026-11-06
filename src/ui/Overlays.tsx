/* Things that float over the page: modals, the toast, popovers and the hover tip. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { app, useApp } from '../store/app';
import { Icon } from './Icon';

export function Modal({ title, sub, children, footer, wide, onClose }: { title: string; sub?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('input:not([type=checkbox]),select,textarea,button.primary');
    setTimeout(() => el?.focus(), 20);
  }, []);
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header>
          <div><h2>{title}</h2>{sub ? <p>{sub}</p> : null}</div>
          <button className="btn icon" onClick={onClose} aria-label="Close"><Icon k="x" /></button>
        </header>
        <div className="mbody">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </div>
    </div>
  );
}

export function ModalHost() {
  const a = useApp();
  return <>{a.modals.map(m => <div key={m.id}>{m.node(() => app.closeModal(m.id))}</div>)}</>;
}

export function confirmBox(title: string, text: ReactNode, okLabel: string, ok: () => void, danger = false) {
  app.openModal(close => (
    <Modal title={title} onClose={close} footer={<><span className="grow" /><button className="btn" onClick={close}>Cancel</button><button className={`btn primary ${danger ? 'danger' : ''}`} onClick={() => { close(); ok(); }}>{okLabel}</button></>}>
      <p style={{ margin: 0 }}>{text}</p>
    </Modal>
  ));
}

export function Toast() {
  const a = useApp();
  const t = a.toastMsg;
  if (!t) return null;
  return (
    <div className="toast" role="status" key={t.id}>
      <span>{t.msg}</span>
      {t.act ? <button onClick={() => { app.closeToast(); t.act!.fn(); }}>{t.act.label}</button> : null}
      {t.undo ? <button onClick={() => { app.closeToast(); app.undo(); }}>Undo</button> : null}
    </div>
  );
}

export function PopoverHost() {
  const a = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const p = a.popover;
  useLayoutEffect(() => {
    if (!p || !ref.current) { setPos(null); return; }
    const h = ref.current.offsetHeight, w = ref.current.offsetWidth;
    setPos({ left: Math.max(8, Math.min(p.x, innerWidth - w - 10)), top: Math.max(8, Math.min(p.y, innerHeight - h - 10)) });
  }, [p]);
  useEffect(() => {
    if (!p) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) app.closePopover(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') app.closePopover(); };
    const t = setTimeout(() => { document.addEventListener('mousedown', down); document.addEventListener('keydown', key); }, 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [p]);
  if (!p) return null;
  return <div className="popover" ref={ref} style={pos ? { left: pos.left, top: pos.top } : { left: p.x, top: p.y, visibility: 'hidden' }}>{p.node(() => app.closePopover())}</div>;
}

/* The hover tip is moved directly in the DOM: it follows the mouse far too often to go through React. */
let tipEl: HTMLDivElement | null = null;
export function tip(e: { clientX: number; clientY: number } | null, html?: string | null) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; document.body.appendChild(tipEl); }
  if (!e || !html) { tipEl.hidden = true; return; }
  tipEl.hidden = false; tipEl.innerHTML = html;
  const r = tipEl.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
}
