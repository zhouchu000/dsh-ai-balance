import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { BalanceController } from '../src/client/controller.js';
import { MenuContribution, UsageContribution } from '../src/client/contribution.js';
import { isMiMoCurrent, discoverProviderIds } from '../src/client/provider.js';

const h = React.createElement;
function store(value) {
  let snapshot = value; const listeners = new Set();
  return { getSnapshot: () => snapshot, subscribe: f => { listeners.add(f); return () => listeners.delete(f); },
    update(next) { snapshot = next; listeners.forEach(f => f()); } };
}
const current = (provider, model = 'model-a') => ({ current: { provider, model }, groups: [], status: 'ready', pending: null, error: null });
const good = () => ({ status: 'ready', balance: { total: '28.56', currency: 'CNY', cash: '18.56', gift: '10.00' },
  updatedAt: Date.now(), lastAttemptAt: Date.now(), nextRefreshAt: Date.now() + 300_000,
  stale: false, refreshing: false, loginPending: false, providerIds: ['xiaomi', 'my-payg'] });

test('balance details render no model credential controls even if an older backend reports them', async () => {
  const env = await setup('xiaomi', { ...good(), keyStates: { xiaomi: { status: 'available', busy: false, canRestore: false } } });
  try {
    assert.equal(document.querySelectorAll('[data-mimo-balance] button').length, 3);
    assert.equal(document.querySelector('[data-mimo-balance] button').getAttribute('aria-label'), '刷新小米 MiMo 余额');
    assert.ok(!document.querySelector('[data-mimo-balance]').textContent.includes('Key'));
    assert.equal(env.requests.some(x => /key-/.test(x.path)), false);
    await env.settle(() => env.directory.store.update(current('openai'))); assert.equal(document.querySelector('[data-mimo-balance]'), null);
  } finally { await env.cleanup(); }
});
test('clicked details can logout and relogin without exposing model credential operations', async () => {
  const env = await setup();
  try {
    const logout = [...document.querySelectorAll('[data-mimo-balance] button')].find(x => x.textContent === '退出登录');
    assert.ok(logout);
    env.setPayload({ ...good(), status: 'needs_login', balance: null, updatedAt: null });
    await env.settle(() => logout.click());
    assert.ok(env.requests.some(x => x.path === 'logout?provider=xiaomi'));
    assert.equal(document.querySelector('[data-mimo-balance-total]').textContent, '余额 —');
    const signin = [...document.querySelectorAll('[data-mimo-balance] button')].find(x => x.textContent === '登录小米账号');
    assert.ok(signin); env.setPayload(good()); await env.settle(() => signin.click());
    assert.ok(env.requests.some(x => x.path === 'login?provider=xiaomi'));
    assert.equal(document.querySelector('[data-mimo-balance-total]').textContent, '¥28.56');
  } finally { await env.cleanup(); }
});

test('current Provider ID controls display; model names, hover and pending selections do not', () => {
  for (const provider of ['openai', 'anthropic', 'deepseek', 'openrouter']) {
    assert.equal(isMiMoCurrent(current(provider, 'xiaomi-mimo-v2'), ['xiaomi']), false);
  }
  assert.equal(isMiMoCurrent({ ...current('openai'), pending: { provider: 'xiaomi' } }, ['xiaomi']), false);
  assert.equal(isMiMoCurrent(current('xiaomi', 'custom-model-name'), ['xiaomi']), true);
  assert.equal(isMiMoCurrent(current('my-payg', 'no-mimo-in-name'), ['xiaomi', 'my-payg']), true);
  assert.equal(isMiMoCurrent(current('other'), ['xiaomi']), false);
});

test('custom Provider IDs are discovered from exact official pay-as-you-go endpoints, excluding Token Plan and lookalikes', () => {
  const settings = [{ ns: 'llm-pi-ai', value: { providers: {
    'my-payg': { baseURL: 'https://api.xiaomimimo.com/v1' },
    'my-anthropic-wire': { baseURL: 'https://api.xiaomimimo.com/anthropic' },
    'plan': { baseURL: 'https://token-plan-cn.xiaomimimo.com/v1' },
    'lookalike': { baseURL: 'https://api.xiaomimimo.com.evil.test/v1' },
    'unrelated': { displayName: 'MiMo', baseURL: 'https://api.openai.com/v1' },
  } } }];
  assert.deepEqual(discoverProviderIds(['xiaomi', 'explicit-alias'], settings), ['xiaomi', 'explicit-alias', 'my-payg', 'my-anthropic-wire']);
});

async function setup(provider = 'xiaomi', initialPayload = good(), { open = true } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div data-composer-card><button id="trigger" aria-label="选择模型，当前 MiMo" aria-haspopup="menu" aria-expanded="true" aria-controls="models-menu">选择模型</button><div id="root"></div></div><div id="models-menu" role="menu" aria-label="模型与推理等级"><button role="menuitem">模型</button><button role="menuitem">推理等级 High</button></div></body></html>', { pretendToBeVisual: true, url: 'https://local.test/' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, MutationObserver: dom.window.MutationObserver,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, IS_REACT_ACT_ENVIRONMENT: true });
  let payload = initialPayload; const requests = [];
  const controller = new BalanceController({ transport: async (path, options) => {
    requests.push({ path, method: options.method }); return typeof payload === 'function' ? payload(path, options) : payload;
  } });
  const directory = { store: store(current(provider)), load: async () => {} };
  const root = createRoot(document.getElementById('root'));
  await act(async () => { root.render(h(MenuContribution, { directory, controller })); await new Promise(r => setImmediate(r)); });
  const settle = async f => { await act(async () => { f?.(); await new Promise(r => setImmediate(r)); }); };
  const openDetails = () => { const button = document.querySelector('[data-mimo-balance-total]'); if (button?.getAttribute('aria-expanded') === 'false') button.click(); };
  if (open) await settle(openDetails);
  return { dom, controller, directory, requests, settle, openDetails, setPayload: p => { payload = p; },
    cleanup: async () => { await act(async () => root.unmount()); controller.dispose(); dom.window.close(); } };
}

test('real React portal hides immediately for other providers and restores cached balance for MiMo and custom routes', async () => {
  const env = await setup();
  try {
    assert.match(document.querySelector('[data-mimo-balance]').textContent, /账户余额：¥28.56/);
    assert.match(document.body.textContent, /现金余额：¥18.56/);
    const originalRows = [...document.querySelectorAll('button[role="menuitem"]')].map(n => n.textContent);
    for (const provider of ['openai', 'deepseek', 'anthropic']) {
      await env.settle(() => env.directory.store.update(current(provider, 'mimo-named-openai')));
      assert.equal(document.querySelector('[data-mimo-balance]'), null);
      const option = document.createElement('button'); option.textContent = 'MiMo hovered'; option.setAttribute('role', 'menuitemradio');
      document.getElementById('models-menu').appendChild(option);
      await env.settle(() => option.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })));
      assert.equal(document.querySelector('[data-mimo-balance]'), null); option.remove();
    }
    for (const provider of ['xiaomi', 'my-payg']) {
      await env.settle(() => env.directory.store.update(current(provider)));
      await env.settle(env.openDetails);
      assert.match(document.querySelector('[data-mimo-balance]').textContent, /¥28.56/);
    }
    await env.settle(() => env.directory.store.update(current('xiaomi', 'another-mimo-model')));
    assert.equal(document.querySelectorAll('[data-mimo-balance]').length, 1);
    assert.deepEqual([...document.querySelectorAll('button[role="menuitem"]')].map(n => n.textContent), originalRows);
    assert.equal(env.requests.filter(r => r.method === 'POST').length, 0); // Fresh persisted cache needs no upstream refresh.
  } finally { await env.cleanup(); }
});

test('an unverified or excluded Provider never activates refresh during initial bootstrap', async () => {
  const env = await setup('xiaomi', { ...good(), providerIds: [], balance: null, updatedAt: null, nextRefreshAt: null });
  try {
    assert.equal(document.querySelector('[data-mimo-balance]'), null);
    assert.equal(env.requests.filter(r => r.method === 'POST').length, 0);
  } finally { await env.cleanup(); }
});

test('transient initial backend failure recovers the real menu on a subsequent local state read', async () => {
  let attempts = 0;
  const env = await setup('xiaomi', async () => { if (++attempts === 1) throw new Error('host not ready'); return good(); });
  try {
    assert.equal(document.querySelector('[data-mimo-balance]'), null);
    await env.settle(() => { void env.controller.bootstrap(); });
    await env.settle(env.openDetails);
    assert.match(document.querySelector('[data-mimo-balance]')?.textContent ?? '', /¥28.56/);
    assert.equal(env.requests.filter(r => r.method === 'POST').length, 0);
  } finally { await env.cleanup(); }
});

test('inline balance defaults to total only and opens details exclusively on click', async () => {
  const env = await setup('xiaomi', good(), { open: false });
  try {
    const button = document.querySelector('[data-mimo-balance-total]');
    assert.equal(button.textContent, '¥28.56'); assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(document.querySelector('[data-mimo-balance]'), null);
    await env.settle(() => button.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })));
    assert.equal(document.querySelector('[data-mimo-balance]'), null);
    await env.settle(() => button.click()); assert.match(document.body.textContent, /现金余额：¥18.56/);
    assert.equal(document.querySelector('#models-menu [data-mimo-balance]'), null);
    await env.settle(() => document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true })));
    assert.equal(document.querySelector('[data-mimo-balance]'), null);
    await env.settle(env.openDetails);
    await env.settle(() => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(document.querySelector('[data-mimo-balance]'), null);
    await env.settle(env.openDetails); await env.settle(() => env.directory.store.update(current('deepseek')));
    assert.equal(document.querySelector('[data-mimo-balance-total]'), null); assert.equal(document.querySelector('[data-mimo-balance]'), null);
    await env.settle(() => env.directory.store.update(current('xiaomi')));
    assert.equal(document.querySelector('[data-mimo-balance-total]').textContent, '¥28.56');
    assert.equal(document.querySelector('[data-mimo-balance]'), null);
  } finally { await env.cleanup(); }
});
test('bottom row shows only the current conversation estimate and updates while keeping original statistics intact', async () => {
  const env = await setup('xiaomi', good(), { open: false });
  const holder = document.createElement('div'); holder.innerHTML = '<span data-original-stats>441K tok · 缓存命中 90%</span><div id="usage-seat"></div>'; document.body.appendChild(holder);
  const root = createRoot(document.getElementById('usage-seat'));
  let view = { routes: [{ provider: 'xiaomi', model: 'mimo-v2.6-pro', input: 1000000, output: 0, cacheRead: 0, cacheWrite: 0, samples: 1, missing: 0 }] };
  const render = () => root.render(h(UsageContribution, { directory: env.directory, controller: env.controller,
    useProjection: key => { assert.equal(key, 'mimoConversationUsage'); return view; } }));
  try {
    await env.settle(render); assert.equal(document.querySelector('[data-mimo-conversation-usage]').textContent, '预估用量 ¥3.00');
    assert.equal(document.querySelectorAll('[data-mimo-conversation-usage] svg').length, 0);
    view = { routes: [] }; await env.settle(render); assert.equal(document.querySelector('[data-mimo-conversation-usage]').textContent, '预估用量 ¥0.00');
    await env.settle(() => env.directory.store.update(current('openai'))); assert.equal(document.querySelector('[data-mimo-conversation-usage]'), null);
    assert.equal(document.querySelector('[data-original-stats]').textContent, '441K tok · 缓存命中 90%');
  } finally { await env.settle(() => root.unmount()); await env.cleanup(); }
});

test('manual refresh in clicked details updates time and stale/auth/network states keep original controls usable', async () => {
  const env = await setup();
  try {
    env.setPayload({ ...good(), balance: { total: '31.20', currency: 'CNY' } });
    await env.settle(() => document.querySelector('[aria-label="刷新小米 MiMo 余额"]').click());
    assert.match(document.querySelector('[data-mimo-balance]').textContent, /¥31.20/);
    assert.equal(env.requests.filter(r => r.method === 'POST').length, 1);
    assert.match(document.querySelector('[data-mimo-balance]').textContent, /更新于：/);
    for (const [status, text] of [['expired', '登录已过期'], ['network', '余额获取失败'], ['timeout', '余额获取失败']]) {
      env.setPayload({ ...good(), status, stale: true, updatedAt: Date.now() - 600_000 });
      await env.settle(() => document.querySelector('[aria-label="刷新小米 MiMo 余额"]').click());
      const card = document.querySelector('[data-mimo-balance]');
      assert.match(card.textContent, new RegExp(text)); assert.match(card.textContent, /缓存于：/);
      let selected = false; const original = document.querySelector('button[role="menuitem"]'); original.onclick = () => { selected = true; };
      original.click(); assert.equal(selected, true);
    }
    await env.settle(() => document.querySelector('[data-mimo-balance-total]').click());
    assert.equal(document.querySelector('[data-mimo-balance]'), null);
  } finally { await env.cleanup(); }
  assert.equal(document.querySelector?.('[data-mimo-balance]') ?? null, null);
});

test('selected-only automatic lifecycle refreshes once after five minutes and stops on release', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  let calls = 0;
  const controller = new BalanceController({ transport: async (path, options) => {
    if (options.method === 'POST') calls++;
    return good();
  } });
  try {
    await controller.bootstrap(); t.mock.timers.tick(600_000); await Promise.resolve(); assert.equal(calls, 0);
    controller.activate('selected-mimo'); await controller.ensureFresh();
    assert.equal(calls, 1); // The old cache expired while no MiMo was selected.
    t.mock.timers.tick(299_999); await Promise.resolve(); assert.equal(calls, 1);
    t.mock.timers.tick(1); await new Promise(r => setImmediate(r)); assert.equal(calls, 2);
    controller.deactivate('selected-mimo'); t.mock.timers.tick(900_000); await Promise.resolve(); assert.equal(calls, 2);
  } finally { controller.dispose(); }
});
