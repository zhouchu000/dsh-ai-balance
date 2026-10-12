import React from 'react';

/** Local click-open panel, positioned with the same viewport margins as native statistics dialogs. */
export function useBalancePopover(open, setOpen, anchor, panel) {
  const [position, setPosition] = React.useState(null);
  const measure = React.useCallback(() => {
    const a = anchor.current, p = panel.current; if (!a || !p) return;
    const win = a.ownerDocument.defaultView, box = a.getBoundingClientRect(), rect = p.getBoundingClientRect();
    const width = rect.width || 260, height = rect.height || 200, margin = 12;
    const left = Math.max(margin, Math.min(box.right - width, win.innerWidth - width - margin));
    const above = box.top - height - 8;
    const top = above >= margin ? above : Math.max(margin, Math.min(box.bottom + 8, win.innerHeight - height - margin));
    setPosition(previous => previous?.left === left && previous?.top === top ? previous : { left, top });
  }, [anchor, panel]);
  React.useLayoutEffect(() => {
    if (!open) { setPosition(null); return; }
    const doc = anchor.current?.ownerDocument; if (!doc) return;
    const win = doc.defaultView;
    const outside = event => { if (!anchor.current?.contains(event.target) && !panel.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); } };
    doc.addEventListener('pointerdown', outside, true); doc.addEventListener('keydown', escape, true);
    win.addEventListener('resize', measure); doc.addEventListener('scroll', measure, true);
    const observer = win.ResizeObserver ? new win.ResizeObserver(measure) : null;
    if (panel.current) observer?.observe(panel.current); if (anchor.current) observer?.observe(anchor.current);
    measure();
    return () => { observer?.disconnect(); doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('keydown', escape, true);
      win.removeEventListener('resize', measure); doc.removeEventListener('scroll', measure, true); };
  }, [open, setOpen, anchor, panel, measure]);
  return { measure, position: position || { visibility: 'hidden', left: 0, top: 0 } };
}
