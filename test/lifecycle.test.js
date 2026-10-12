import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalLogin } from '../src/login.js';
import { BalanceController } from '../src/client/controller.js';
import { BalanceService } from '../src/balance-service.js';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('initial local state failure retries automatically without enabling unverified upstream queries', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  let calls = 0;
  const controller = new BalanceController({ transport: async (path, options) => {
    assert.equal(path, 'state'); assert.equal(options.method, 'GET');
    if (++calls === 1) throw new Error('temporary boot failure');
    return { status: 'needs_login', balance: null, providerIds: ['xiaomi'] };
  } });
  try {
    await controller.bootstrap(); assert.deepEqual(controller.getSnapshot().providerIds, []);
    t.mock.timers.tick(300); await new Promise(r => setImmediate(r));
    assert.equal(calls, 2); assert.deepEqual(controller.getSnapshot().providerIds, ['xiaomi']);
    controller.dispose(); t.mock.timers.tick(60_000); await Promise.resolve(); assert.equal(calls, 2);
  } finally { controller.dispose(); }
});

test('pending local browser login resumes polling after MiMo selection returns', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  let backend = { status: 'needs_login', balance: null, updatedAt: null, lastAttemptAt: 1_000_000,
    nextRefreshAt: 1_300_000, loginPending: false, providerIds: ['xiaomi'] };
  const controller = new BalanceController({ transport: async (path) => {
    if (path === 'login') backend = { ...backend, loginPending: true };
    return backend;
  } });
  try {
    controller.activate('mimo'); await controller.ensureFresh(); await controller.login();
    controller.deactivate('mimo');
    backend = { ...backend, status: 'ready', loginPending: false, balance: { total: '5.67', currency: 'CNY' }, updatedAt: Date.now() };
    controller.activate('mimo'); await new Promise(r => setImmediate(r));
    t.mock.timers.tick(1000); await new Promise(r => setImmediate(r));
    assert.equal(controller.getSnapshot().balance?.total, '5.67');
    assert.equal(controller.getSnapshot().loginPending, false);
  } finally { controller.dispose(); }
});

test('concurrent local login requests share a browser run and disposal closes only the owned browser', async () => {
  let finish; let calls = 0; let closed = 0;
  const auth = {};
  const service = { loginPending: false, status: 'needs_login' };
  const login = new LocalLogin(service, auth, { run: async ({ onBrowser }) => {
    calls++; onBrowser({ close: async () => { closed++; } }); await new Promise(r => { finish = r; });
  } });
  const a = login.start(), b = login.start();
  await Promise.all([a, b]); assert.equal(calls, 1); assert.equal(service.loginPending, true);
  login.dispose(); finish(); await login.starting; assert.equal(closed, 1);
});

test('changing authenticated account invalidates disk cache even when the new account query fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mimo-accounts-')); const cacheFile = join(directory, 'balance.json');
  const oldAuth = { load: async () => ({ cookie: 'fixture-a', identity: 'account-a' }) };
  const newAuth = { load: async () => ({ cookie: 'fixture-b', identity: 'account-b' }) };
  try {
    const service = new BalanceService({ cacheFile, auth: oldAuth, query: async () => ({ total: '1.23', currency: 'CNY' }) });
    await service.refresh(); service.auth = newAuth;
    service.query = async () => { throw Object.assign(new Error('offline'), { code: 'network' }); };
    await service.refresh({ force: true });
    assert.equal(service.snapshot().balance, null);
    await assert.rejects(access(cacheFile), { code: 'ENOENT' });
    const restarted = new BalanceService({ cacheFile, auth: newAuth }); await restarted.initialize();
    assert.equal(restarted.snapshot().balance, null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('startup checks stored account identity before publishing a fresh cache from another login', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mimo-start-account-')); const cacheFile = join(directory, 'balance.json');
  try {
    const service = new BalanceService({ cacheFile, auth: { load: async () => ({ cookie: 'a', identity: 'a' }) },
      query: async () => ({ total: '1.23', currency: 'CNY' }) }); await service.refresh();
    const restarted = new BalanceService({ cacheFile, auth: { load: async () => ({ cookie: 'b', identity: 'b' }) } });
    await restarted.initialize(); assert.equal(restarted.snapshot().balance, null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('logout cancels a pending login and late balance response cannot restore the signed-out account', async () => {
  let finishLogin, finishQuery;
  const service = new BalanceService({ auth: { load: async () => ({ cookie: 'fixture', identity: 'fixture' }) },
    query: async () => new Promise(resolve => { finishQuery = resolve; }) });
  const refresh = service.refresh(); await new Promise(r => setImmediate(r));
  const effects = [];
  const login = new LocalLogin(service, { clear: async () => effects.push('cleared console only') }, { run: async ({ signal, onBrowser }) => {
    onBrowser({ close: async () => { effects.push('browser closed'); finishLogin(); } });
    await new Promise(resolve => { finishLogin = resolve; }); assert.equal(signal.aborted, true);
  } });
  await login.start(); await login.logout();
  finishQuery({ total: '8.88', currency: 'CNY' }); await refresh;
  assert.equal(service.snapshot().balance, null); assert.equal(service.snapshot().status, 'needs_login');
  assert.deepEqual(effects, ['browser closed', 'cleared console only']);
  login.dispose(); service.dispose();
});
test('a pre-logout client response cannot resurrect the previous balance', async () => {
  let finish;
  const old = { status: 'ready', balance: { total: '8.88', currency: 'CNY' }, updatedAt: 1000, providerIds: ['xiaomi'] };
  const controller = new BalanceController({ transport: async path => path.startsWith('logout')
    ? { status: 'needs_login', balance: null, providerIds: ['xiaomi'] }
    : path.startsWith('refresh') ? new Promise(resolve => { finish = resolve; }) : old });
  try {
    await controller.bootstrap(); const refresh = controller.refresh(); await new Promise(r => setImmediate(r));
    await controller.logout('xiaomi'); finish(old); await refresh;
    assert.equal(controller.getSnapshot().balance, null); assert.equal(controller.getSnapshot().status, 'needs_login');
  } finally { controller.dispose(); }
});
test('logout serializes cache deletion after pending writes and allows a clean subsequent login', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mimo-signout-')); const cacheFile = join(directory, 'balance.json');
  let release;
  const service = new BalanceService({ cacheFile, auth: { load: async () => ({ cookie: 'fixture', identity: 'fixture' }) },
    query: async () => ({ total: '8.88', currency: 'CNY' }) });
  const login = new LocalLogin(service, { clear: async () => {} }, { run: async () => {} });
  try {
    await service.refresh(); service.cacheWrites = new Promise(resolve => { release = resolve; });
    const oldSave = service.saveCache(), logout = login.logout(); release(); await Promise.all([oldSave, logout]);
    await assert.rejects(access(cacheFile), { code: 'ENOENT' }); assert.equal(service.identity, null);
    await login.start(); await login.starting; assert.equal(service.snapshot().balance.total, '8.88');
  } finally { login.dispose(); service.dispose(); await rm(directory, { recursive: true, force: true }); }
});
