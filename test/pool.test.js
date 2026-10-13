import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ControllerPool } from '../src/client/pool.js';
const providers = [{ id: 'xiaomi', kind: 'mimo', label: '小米 MiMo' }, { id: 'moonshot', kind: 'kimi-cn', label: 'Kimi' }];
const data = (provider, total) => ({ provider, status: 'ready', balance: { currency: 'CNY', total }, updatedAt: Date.now(), nextRefreshAt: Date.now() + 300000 });
test('changing providers retains separate cached values and stops the previous timer', async () => {
  let finish; const calls = [];
  const pool = new ControllerPool({ transport: async (path, options) => {
    calls.push(path); if (path === 'state') return { providers };
    const id = new URL('http://local/' + path).searchParams.get('provider');
    if (path.startsWith('refresh') && id === 'xiaomi') return new Promise(r => { finish = r; });
    return data(providers.find(p => p.id === id), id === 'xiaomi' ? '1' : '2');
  } });
  try {
    await pool.bootstrap(); const mimo = pool.forProvider('xiaomi'), kimi = pool.forProvider('moonshot');
    await mimo.bootstrap(); await kimi.bootstrap();
    mimo.activate('composer'); const pending = mimo.refresh({ force: true }); await new Promise(r => setImmediate(r));
    mimo.deactivate('composer'); kimi.activate('composer'); finish(data(providers[0], '3')); await pending;
    assert.equal(kimi.getSnapshot().balance.total, '2'); assert.equal(mimo.getSnapshot().balance.total, '3');
    assert.equal(mimo.active.size, 0); assert.equal(pool.forProvider('xiaomi'), mimo); assert.equal(pool.forProvider('openai'), null);
    assert.ok(calls.filter(p => p.startsWith('refresh')).every(p => p.includes('provider=xiaomi')));
  } finally { pool.dispose(); }
});

test('reactivation checks local identity before reusing a fresh balance', async () => {
  let payload = data(providers[0], '1'), reads = 0;
  const pool = new ControllerPool({ transport: async path => path === 'state' ? { providers } : (reads++, payload) });
  try {
    await pool.bootstrap(); const c = pool.forProvider('xiaomi'); c.activate('composer');
    await new Promise(r => setImmediate(r)); c.deactivate('composer');
    payload = { provider: providers[0], status: 'needs_login', balance: null, nextRefreshAt: Date.now() + 300000 };
    c.activate('composer'); await new Promise(r => setImmediate(r));
    assert.equal(c.getSnapshot().balance, null); assert.equal(c.getSnapshot().status, 'needs_login'); assert.equal(reads, 2);
  } finally { pool.dispose(); }
});
test('catalog revisions replace controllers even when provider ID and kind stay the same', async () => {
  let revision = 'a';
  const pool = new ControllerPool({ transport: async () => ({ providers: [{ ...providers[0], revision }] }) });
  try {
    await pool.bootstrap(); const first = pool.forProvider('xiaomi'); revision = 'b';
    await pool.bootstrap({ reload: true }); const next = pool.forProvider('xiaomi');
    assert.notEqual(first, next); assert.equal(first.disposed, true);
  } finally { pool.dispose(); }
});
test('MiMo logout clears both cash and plan controllers immediately', async () => {
  const rows = [providers[0], { id: 'plan', kind: 'mimo-plan', label: '小米 MiMo' }];
  const pool = new ControllerPool({ transport: async path => path === 'state' ? { providers: rows }
    : path.startsWith('logout') ? { provider: rows[1], status: 'needs_login', balance: null }
    : data(rows.find(p => path.endsWith(p.id)), '3') });
  try {
    await pool.bootstrap(); const cash = pool.forProvider('xiaomi'), plan = pool.forProvider('plan');
    await cash.bootstrap(); await plan.bootstrap(); await plan.logout('plan');
    assert.equal(cash.getSnapshot().balance, null); assert.equal(cash.getSnapshot().status, 'needs_login');
  } finally { pool.dispose(); }
});

test('switching between MiMo providers during logout releases the busy state on completion', async () => {
  const rows = [providers[0], { id: 'plan', kind: 'mimo-plan', label: '小米 MiMo' }];
  let busy = false, finish;
  const pool = new ControllerPool({ transport: async path => {
    if (path === 'state') return { providers: rows };
    const provider = rows.find(p => new URL('https://local/' + path).searchParams.get('provider') === p.id);
    if (path.startsWith('logout')) { busy = true; await new Promise(r => { finish = r; }); busy = false; }
    return { provider, status: 'needs_login', balance: null, sessionBusy: busy, nextRefreshAt: Date.now() + 300000 };
  } });
  try {
    await pool.bootstrap(); const cash = pool.forProvider('xiaomi'), plan = pool.forProvider('plan');
    const pending = plan.logout('plan'); await new Promise(r => setImmediate(r));
    cash.activate('composer'); await new Promise(r => setImmediate(r)); assert.equal(cash.getSnapshot().sessionBusy, true);
    finish(); await pending; await new Promise(r => setImmediate(r));
    assert.equal(cash.getSnapshot().sessionBusy, false); assert.ok(cash.timer);
  } finally { pool.dispose(); }
});
