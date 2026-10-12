import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BalanceService } from '../src/balance-service.js';

const balance = { total: '28.56', currency: 'CNY', cash: '18.56', gift: '10.00' };
const auth = { load: async () => ({ cookie: 'fixture-secret', identity: 'fixture-account' }) };
function options(extra = {}) { return { auth, query: async () => balance, now: () => 1_000_000, ...extra }; }

test('automatic attempts are globally limited to five minutes, manual refresh bypasses only the time gate', async () => {
  let now = 1_000_000, calls = 0;
  const service = new BalanceService(options({ now: () => now, query: async () => { calls++; return balance; } }));
  assert.equal((await service.refresh()).balance.total, '28.56');
  await service.refresh(); now += 299_999; await service.refresh(); assert.equal(calls, 1);
  now++; await service.refresh(); assert.equal(calls, 2);
  await service.refresh({ force: true }); assert.equal(calls, 3);
});

test('concurrent manual/automatic refreshes share one request and retain last successful timestamp on failure', async () => {
  let resolve, calls = 0, now = 1_000_000;
  const service = new BalanceService(options({ now: () => now, query: () => { calls++; return new Promise(r => { resolve = r; }); } }));
  const first = service.refresh(); const second = service.refresh({ force: true });
  await new Promise(r => setImmediate(r)); resolve(balance);
  assert.deepEqual(await first, await second); assert.equal(calls, 1);
  service.query = async () => { throw Object.assign(new Error('fixture-secret'), { code: 'network' }); };
  now += 300_000; const state = await service.refresh();
  assert.equal(state.status, 'network'); assert.equal(state.balance.total, '28.56');
  assert.equal(state.updatedAt, 1_000_000); assert.equal(state.stale, true);
  assert.ok(!JSON.stringify(state).includes('fixture-secret'));
});

test('missing or expired login never yields an invented balance', async () => {
  for (const code of ['needs_login', 'expired']) {
    const service = new BalanceService(options({ auth: { load: async () => { throw Object.assign(new Error('private'), { code }); } } }));
    const state = await service.refresh();
    assert.equal(state.status, code); assert.equal(state.balance, null); assert.equal(state.updatedAt, null);
  }
});

test('restart restores validated cache, but a different authenticated account clears old amounts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mimo-cache-')); const cacheFile = join(dir, 'balance.json');
  try {
    const first = new BalanceService(options({ cacheFile })); await first.refresh();
    const disk = await readFile(cacheFile, 'utf8'); assert.ok(!disk.includes('fixture-secret'));
    const second = new BalanceService(options({ cacheFile })); await second.initialize();
    assert.equal(second.snapshot().balance.total, '28.56');
    second.auth = { load: async () => ({ cookie: 'other-fixture', identity: 'other-account' }) };
    second.query = async () => { throw Object.assign(new Error('offline'), { code: 'network' }); };
    const changed = await second.refresh({ force: true });
    assert.equal(changed.balance, null); assert.equal(changed.updatedAt, null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('startup never publishes disk amounts until the console identity is verified', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mimo-unverified-cache-')); const cacheFile = join(dir, 'balance.json');
  try {
    const first = new BalanceService(options({ cacheFile })); await first.refresh();
    for (const code of ['needs_login', 'expired', 'credential_storage_unavailable']) {
      const restarted = new BalanceService(options({ cacheFile, auth: { load: async () => { throw Object.assign(new Error('fixture-only'), { code }); } } }));
      await restarted.initialize(); const state = restarted.snapshot();
      assert.equal(state.status, code); assert.equal(state.balance, null); assert.equal(state.updatedAt, null);
    }
    const verified = new BalanceService(options({ cacheFile })); await verified.initialize();
    assert.equal(verified.snapshot().balance.total, '28.56');
    // Previously verified in-memory amounts can still be shown as stale with a clear failure state.
    first.auth = { load: async () => { throw Object.assign(new Error('fixture-only'), { code: 'expired' }); } };
    const stale = await first.refresh({ force: true });
    assert.equal(stale.balance.total, '28.56'); assert.equal(stale.status, 'expired'); assert.equal(stale.stale, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
