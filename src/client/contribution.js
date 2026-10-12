import React from 'react';
import { createPortal } from 'react-dom';
import { formatMoney, REFRESH_MS } from '../api.js';
import { isMiMoCurrent } from './provider.js';
import { useBalancePopover } from './popover.js';
import { quoteUsage, PRICE_CHECKED_AT } from '../usage.js';
const h = React.createElement;
const STATUS_TEXT = { needs_login: '需要登录小米账号', expired: '登录已过期', network: '余额获取失败',
  timeout: '余额获取失败（请求超时）', unreadable: '无法读取余额', credential_storage_unavailable: 'DSH 凭据配置不可用', browser_unavailable: '本机登录组件未就绪' };

export function BalanceCard({ state, controller, onSizeChange, provider }) {
  React.useLayoutEffect(() => { onSizeChange(); }, [state, onSizeChange]);
  const stale = state.balance !== null && (state.stale || Date.now() - state.updatedAt >= REFRESH_MS);
  const timestamp = state.updatedAt ? new Date(state.updatedAt) : null;
  const time = timestamp?.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const datedTime = timestamp ? `${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} ${time}` : '';
  const balance = state.balance;
  return h('section', { className: 'mimo-balance', 'data-mimo-balance': '', role: 'group', 'aria-label': '小米 MiMo 按量付费账户余额',
    onMouseDown: event => { event.stopPropagation(); if (event.target.closest('button')) event.preventDefault(); },
    onClick: event => event.stopPropagation(), onKeyDown: event => { if (event.key !== 'Escape') event.stopPropagation(); } },
    h('div', { className: 'mimo-balance__header' },
      h('span', { className: 'mimo-balance__brand' }, '小米 MiMo', h('span', { className: 'mimo-balance__kind' }, '按量付费')),
      h('button', { type: 'button', className: 'mimo-balance__button', 'aria-label': '刷新小米 MiMo 余额', title: '刷新余额',
        disabled: state.refreshing || state.sessionBusy, onClick: () => { void controller.refresh({ force: true }); } },
        h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true },
          h('path', { d: 'M20 8a8 8 0 1 0 0 8M20 3v5h-5' })))),
    balance && h('div', { className: 'mimo-balance__amount' }, '账户余额：', formatMoney(balance.total, balance.currency)),
    balance?.cash !== undefined && h('div', { className: 'mimo-balance__details' }, '├─ 现金余额：', formatMoney(balance.cash, balance.currency)),
    balance?.gift !== undefined && h('div', { className: 'mimo-balance__details' }, '└─ 赠送余额：', formatMoney(balance.gift, balance.currency)),
    STATUS_TEXT[state.status] && h('div', { className: 'mimo-balance__status', role: 'status' }, STATUS_TEXT[state.status]),
    !balance && !STATUS_TEXT[state.status] && h('div', { className: 'mimo-balance__status', role: 'status' }, '正在获取余额…'),
    timestamp && h('div', { className: 'mimo-balance__time', title: timestamp.toLocaleString('zh-CN') },
      stale ? `缓存于：${datedTime}` : `更新于：${time}`, state.refreshing ? ' · 刷新中…' : ''),
    h('div', { className: 'mimo-balance__session' },
      h('button', { type: 'button', className: 'mimo-balance__button mimo-balance__login',
        disabled: state.loginPending || state.sessionBusy, onClick: () => { void controller.login(provider); } },
      state.loginPending ? '等待本机登录…' : balance || state.status === 'ready' ? '重新登录' : '登录小米账号'),
      (balance || state.loginPending || state.sessionBusy || !['idle', 'needs_login'].includes(state.status)) && h('button', { type: 'button', className: 'mimo-balance__button',
        disabled: state.sessionBusy, onClick: () => { void controller.logout(provider); } }, state.sessionBusy ? '正在退出…' : '退出登录')));
}

/** Compact balance beside the native model selector; detail is rendered only after clicking. */
export function MenuContribution({ directory, controller }) {
  const anchor = React.useRef(null), panel = React.useRef(null), token = React.useRef({});
  const [open, setOpen] = React.useState(false);
  const id = 'mimo-balance-' + React.useId();
  const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const subscribe = React.useCallback(callback => directory.store.subscribe(callback), [directory]);
  const getDirectory = React.useCallback(() => directory.store.getSnapshot(), [directory]);
  const selected = React.useSyncExternalStore(subscribe, getDirectory);
  const enabled = isMiMoCurrent(selected, state.providerIds);
  React.useEffect(() => { void controller.bootstrap(); }, [controller]);
  React.useLayoutEffect(() => { if (!enabled) setOpen(false); }, [enabled]);
  React.useEffect(() => {
    if (enabled) controller.activate(token.current); else controller.deactivate(token.current);
    return () => controller.deactivate(token.current);
  }, [enabled, controller]);
  const popover = useBalancePopover(open && enabled, setOpen, anchor, panel);
  if (!enabled) return null;
  const total = state.balance ? formatMoney(state.balance.total, state.balance.currency) : '余额 —';
  const cache = state.balance && (state.stale || Date.now() - state.updatedAt >= REFRESH_MS);
  const label = `小米 MiMo 剩余总余额 ${total}` + (cache ? '（缓存）' : '');
  return h(React.Fragment, null,
    h('button', { ref: anchor, type: 'button', className: 'mimo-balance-total', 'data-mimo-balance-total': '',
      'aria-label': label, 'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-controls': open ? id : undefined,
      title: cache ? `缓存于 ${new Date(state.updatedAt).toLocaleString('zh-CN')}；点击查看详情` : '点击查看小米 MiMo 余额详情',
      onMouseDown: event => event.preventDefault(), onClick: () => { setOpen(!open); if (!open) void controller.ensureFresh(); } }, total, cache ? ' *' : ''),
    open ? createPortal(h('div', { id, ref: panel, role: 'dialog', 'aria-label': '小米 MiMo 余额详情',
      className: 'mimo-balance-popover', style: popover.position },
      h(BalanceCard, { state, controller, provider: selected.current.provider, onSizeChange: popover.measure })), anchor.current.ownerDocument.body) : null);
}

/** The standard composer dock already shares the native bottom statistics row. */
export function UsageContribution({ directory, controller, useProjection }) {
  const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const subscribe = React.useCallback(callback => directory.store.subscribe(callback), [directory]);
  const getDirectory = React.useCallback(() => directory.store.getSnapshot(), [directory]);
  const selected = React.useSyncExternalStore(subscribe, getDirectory);
  const usage = useProjection('mimoConversationUsage');
  if (!isMiMoCurrent(selected, state.providerIds)) return null;
  const quote = quoteUsage(usage, state.providerIds, state.balance?.currency);
  return h('span', { className: 'mimo-usage-pill', 'data-mimo-conversation-usage': '',
    title: `仅此对话的 MiMo 模型 Token 用量，按 ${PRICE_CHECKED_AT} 核对的官方价格估算；不含联网插件费用，实际以小米账单为准。` + (quote.partial ? ' 用量记录或计价信息不完整。' : '') },
    '预估用量 ', quote.text);
}
