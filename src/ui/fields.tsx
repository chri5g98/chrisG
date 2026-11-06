/* Inputs that save when you finish (Enter, Tab or leaving the field), and quietly follow outside changes
   while you are not in them. One edit = one undo step. */
import { useEffect, useRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type Commit = (v: string, el: HTMLInputElement | HTMLTextAreaElement) => void;

function useCommit<T extends HTMLInputElement | HTMLTextAreaElement>(value: unknown, onCommit: Commit) {
  const ref = useRef<T>(null);
  const cb = useRef(onCommit);
  cb.current = onCommit;
  useEffect(() => {
    const el = ref.current!;
    const h = () => cb.current(el.value, el);
    el.addEventListener('change', h);
    return () => el.removeEventListener('change', h);
  }, []);
  useEffect(() => {
    const el = ref.current, v = String(value ?? '');
    if (el && document.activeElement !== el && el.value !== v) el.value = v;
  });
  return ref;
}

export function In({ value, onCommit, ...rest }: { value: unknown; onCommit: Commit } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue'>) {
  const ref = useCommit<HTMLInputElement>(value, onCommit);
  return <input ref={ref} defaultValue={String(value ?? '')} autoComplete="off" {...rest} />;
}
export function Area({ value, onCommit, ...rest }: { value: unknown; onCommit: Commit } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue'>) {
  const ref = useCommit<HTMLTextAreaElement>(value, onCommit);
  return <textarea ref={ref} defaultValue={String(value ?? '')} {...rest} />;
}
