export const CSS = `
.ai-balance{padding:10px 12px 9px;color:var(--dsw-alias-label-primary,inherit);font-size:12px;line-height:1.65;text-align:left;font-family:inherit}
.ai-balance-total{flex:none;white-space:nowrap;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,inherit);padding:4px 6px;font:inherit;font-size:12px;font-variant-numeric:tabular-nums;cursor:pointer}
.ai-balance-total:hover,.ai-balance-total[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary,inherit)}
.ai-balance-total:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d93f8);outline-offset:1px}
.ai-balance-popover{position:fixed;z-index:1100;box-sizing:border-box;width:min(270px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-specific-menu,#fff);backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-prominent,0 6px 24px rgba(0,0,0,.18));--dsw-elevation-stroke-color:var(--dsw-alias-border-l1)}
.ai-usage-pill{display:inline-flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;padding:1px 8px;border-radius:999px;color:var(--dsw-alias-label-tertiary,inherit);font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));font-variant-numeric:tabular-nums}
.ai-balance__header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:2px}
.ai-balance__brand{font-weight:600}.ai-balance__kind{margin-left:6px;font-size:10px;font-weight:400;color:var(--dsw-alias-label-secondary,inherit)}
.ai-balance__button{display:inline-flex;align-items:center;justify-content:center;gap:3px;min-height:24px;border:0;border-radius:5px;padding:1px 5px;background:transparent;color:var(--dsw-alias-label-secondary,inherit);font:inherit;cursor:pointer}
.ai-balance__button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary,inherit)}
.ai-balance__button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d93f8);outline-offset:1px}.ai-balance__button:disabled{opacity:.55;cursor:default}
.ai-balance__amount{font-variant-numeric:tabular-nums;font-weight:500}.ai-balance__details{font-size:11px;color:var(--dsw-alias-label-secondary,inherit)}
.ai-balance__time{font-size:10px;color:var(--dsw-alias-label-secondary,inherit);margin-top:3px;font-variant-numeric:tabular-nums}
.ai-balance__status{font-size:11px;color:var(--dsw-alias-label-secondary,inherit)}.ai-balance__login{margin:2px -5px 0;color:var(--dsw-alias-state-business-primary,#4d93f8)}
.ai-balance__session{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:3px}
`;

export function installStyles(ctx) {
  ctx.effect(() => {
    const style = document.createElement('style'); style.setAttribute('data-plugin-css', 'dsh-ai-balance');
    style.textContent = CSS; document.head.appendChild(style); return () => style.remove();
  });
}
