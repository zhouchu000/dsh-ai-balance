import React from 'react';
import { createPortal } from 'react-dom';
import { formatMoney, REFRESH_MS } from '../api.js';
import { isMiMoCurrent } from './provider.js';
import { useBalancePopover } from './popover.js';
import { quoteUsage } from '../usage.js';
const h = React.createElement;
const STATUS_TEXT = { needs_login: '需要登录小米账号', expired: '登录已过期', network: '余额获取失败',
  timeout: '余额获取失败（请求超时）', unreadable: '无法读取余额', credential_storage_unavailable: '凭据不可用', browser_unavailable: '登录组件未就绪', needs_key: '请在模型设置中配置密钥', invalid_key: '密钥无效或无查询权限', needs_account: '请登录 DeepSeek 账号' };

export function BalanceCard({ state, controller, onSizeChange, provider }) {
  React.useLayoutEffect(() => { onSizeChange(); }, [state, onSizeChange]);
  const stale = state.balance !== null && (state.stale || Date.now() - state.updatedAt >= REFRESH_MS);
  const timestamp = state.updatedAt ? new Date(state.updatedAt) : null;
  const time = timestamp?.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const datedTime = timestamp ? `${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} ${time}` : '';
  const balance = state.balance, label = state.provider?.label || '小米 MiMo';
  const consoleLogin = !state.provider || ['mimo', 'mimo-plan'].includes(state.provider.kind);
  const plan = state.provider?.kind?.includes('plan');
  const accounts = balance?.type === 'quota' ? [] : balance ? balance.accounts || [balance] : [];
  return h('section', { className: 'ai-balance', 'data-ai-balance': '', role: 'group', 'aria-label': label + (plan ? '套餐额度' : '账户余额'),
    onMouseDown: event => { event.stopPropagation(); if (event.target.closest('button')) event.preventDefault(); },
    onClick: event => event.stopPropagation(), onKeyDown: event => { if (event.key !== 'Escape') event.stopPropagation(); } },
    h('div', { className: 'ai-balance__header' },
      h('span', { className: 'ai-balance__brand' }, label, h('span', { className: 'ai-balance__kind' }, plan ? '套餐' : '按量付费')),
      h('button', { type: 'button', className: 'ai-balance__button', 'aria-label': '刷新' + label + ' 余额', title: '刷新余额',
        disabled: state.refreshing || state.sessionBusy, onClick: () => { void controller.refresh({ force: true }); } },
        h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true },
          h('path', { d: 'M20 8a8 8 0 1 0 0 8M20 3v5h-5' })))),
    accounts.map(account => h('div', { key: account.currency },
      h('div', { className: 'ai-balance__amount' }, '账户余额：', formatMoney(account.total, account.currency)),
      account.cash !== undefined && Number(account.cash) !== 0 && h('div', { className: 'ai-balance__details' }, '现金余额：', formatMoney(account.cash, account.currency)),
      account.gift !== undefined && Number(account.gift) !== 0 && h('div', { className: 'ai-balance__details' }, state.provider?.kind?.startsWith('kimi') ? '代金券：' : '赠金余额：', formatMoney(account.gift, account.currency)))),
    balance?.type === 'quota' && balance.windows.map((w, i) => h('div', { key: i, className: 'ai-balance__details' },
      `${w.label}：剩余 ${w.remainingPercent}%`, w.resetAt ? h('div', { className: 'ai-balance__time' }, '重置于 ', new Date(w.resetAt).toLocaleString('zh-CN')) : null)),
    STATUS_TEXT[state.status] && h('div', { className: 'ai-balance__status', role: 'status' }, STATUS_TEXT[state.status]),
    !balance && !STATUS_TEXT[state.status] && h('div', { className: 'ai-balance__status', role: 'status' }, '正在获取余额…'),
    timestamp && h('div', { className: 'ai-balance__time', title: timestamp.toLocaleString('zh-CN') },
      stale ? `缓存于：${datedTime}` : `更新于：${time}`, state.refreshing ? ' · 刷新中…' : ''),
    consoleLogin && h('div', { className: 'ai-balance__session' },
      h('button', { type: 'button', className: 'ai-balance__button ai-balance__login',
        disabled: state.loginPending || state.sessionBusy, onClick: () => { void controller.login(provider); } },
      state.loginPending ? '等待本机登录…' : balance || state.status === 'ready' ? '重新登录' : '登录小米账号'),
      (balance || state.loginPending || state.sessionBusy || !['idle', 'needs_login'].includes(state.status)) && h('button', { type: 'button', className: 'ai-balance__button',
        disabled: state.sessionBusy, onClick: () => { void controller.logout(provider); } }, state.sessionBusy ? '正在退出…' : '退出登录')));
}

/** Compact balance beside the native model selector; detail is rendered only after clicking. */
export function MenuContribution({ directory, controller }) {
  const anchor = React.useRef(null), panel = React.useRef(null), token = React.useRef({});
  const [open, setOpen] = React.useState(false);
  const id = 'ai-balance-' + React.useId();
  const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const subscribe = React.useCallback(callback => directory.store.subscribe(callback), [directory]);
  const getDirectory = React.useCallback(() => directory.store.getSnapshot(), [directory]);
  const selected = React.useSyncExternalStore(subscribe, getDirectory);
  const enabled = state.provider ? selected?.current?.provider === state.provider.id : isMiMoCurrent(selected, state.providerIds);
  React.useEffect(() => { void controller.bootstrap(); }, [controller]);
  React.useLayoutEffect(() => { if (!enabled) setOpen(false); }, [enabled]);
  React.useEffect(() => {
    if (enabled) controller.activate(token.current); else controller.deactivate(token.current);
    return () => controller.deactivate(token.current);
  }, [enabled, controller]);
  const popover = useBalancePopover(open && enabled, setOpen, anchor, panel);
  if (!enabled) return null;
  const plan = state.provider?.kind?.includes('plan');
  const total = state.balance?.type === 'quota' ? `${state.balance.windows[0].label} ${state.balance.windows[0].remainingPercent}%`
    : state.balance ? (state.balance.accounts || [state.balance]).map(b => formatMoney(b.total, b.currency)).join(' / ') : plan ? '额度 —' : '余额 —';
  const brand = state.provider?.label || '小米 MiMo';
  const cache = state.balance && (state.stale || Date.now() - state.updatedAt >= REFRESH_MS);
  const label = `${brand} ${plan ? '剩余额度' : '剩余总余额'} ${total}` + (cache ? '（缓存）' : '');
  return h(React.Fragment, null,
    h('button', { ref: anchor, type: 'button', className: 'ai-balance-total', 'data-ai-balance-total': '',
      'aria-label': label, 'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-controls': open ? id : undefined,
      title: cache ? `缓存于 ${new Date(state.updatedAt).toLocaleString('zh-CN')}；点击查看详情` : '点击查看详情',
      onMouseDown: event => event.preventDefault(), onClick: () => { setOpen(!open); if (!open) void controller.ensureFresh(); } }, total, cache ? ' *' : ''),
    open ? createPortal(h('div', { id, ref: panel, role: 'dialog', 'aria-label': brand + '余额详情',
      className: 'ai-balance-popover', style: popover.position },
      h(BalanceCard, { state, controller, provider: selected.current.provider, onSizeChange: popover.measure })), anchor.current.ownerDocument.body) : null);
}

/** The standard composer dock already shares the native bottom statistics row. */
export function UsageContribution({ directory, controller, useProjection }) {
  const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const subscribe = React.useCallback(callback => directory.store.subscribe(callback), [directory]);
  const getDirectory = React.useCallback(() => directory.store.getSnapshot(), [directory]);
  const selected = React.useSyncExternalStore(subscribe, getDirectory);
  const usage = useProjection('aiConversationUsage');
  if (state.provider ? selected?.current?.provider !== state.provider.id : !isMiMoCurrent(selected, state.providerIds)) return null;
  if (state.provider?.kind?.includes('plan')) {
    const windows = state.balance?.type === 'quota' ? state.balance.windows : [];
    const stale = windows.length && (state.stale || Date.now() - state.updatedAt >= REFRESH_MS);
    const text = windows.length ? windows.map(w => `${w.label} ${Math.round((100 - w.remainingPercent) * 10) / 10}%`).join(' · ') : '—';
    return h('span', { className: 'ai-usage-pill', 'data-ai-conversation-usage': '',
      title: '账号套餐已用额度：' + text + (stale && state.updatedAt ? `；缓存于 ${new Date(state.updatedAt).toLocaleString('zh-CN')}` : '') },
      '套餐已用 ', text, stale ? ' *' : '');
  }
  const quote = quoteUsage(usage, state.provider ? [state.provider] : state.providerIds, state.balance?.currency);
  return h('span', { className: 'ai-usage-pill', 'data-ai-conversation-usage': '',
    title: '本对话当前供应商 · 按官方 Token 价格估算' }, '预估用量 ', quote.text);
}
