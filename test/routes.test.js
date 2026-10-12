import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { makeHandler } from '../src/routes.js';
import { BalanceService } from '../src/balance-service.js';

test('real HTTP routes require local Host, official authentication and same-origin request marker', async () => {
  const service = new BalanceService({ auth: { load: async () => ({ cookie: 'fixture-credential', identity: 'fixture' }) },
    query: async () => ({ total: '28.56', currency: 'CNY' }) });
  const context = { connection: { requestRejection: req => req.headers.cookie === 'dsh=fixture' ? undefined : 401 } };
  const handler = makeHandler({ ctx: context, service, providerIds: () => ['xiaomi'], login: { start: async () => {} } });
  const server = createServer(handler); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/dsh-mimo-balance/`;
  const headers = { Cookie: 'dsh=fixture', 'X-DSH-MiMo-Request': '1' };
  try {
    assert.equal((await fetch(url + 'state')).status, 403);
    assert.equal((await fetch(url + 'state', { headers: { 'X-DSH-MiMo-Request': '1' } })).status, 401);
    // Node 24 fetch rewrites Host from the URL; raw HTTP exercises the actual malicious wire header.
    const maliciousHostStatus = await new Promise((resolve, reject) => {
      const req = request(url + 'state', { headers: { ...headers, Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(maliciousHostStatus, 403);
    assert.equal((await fetch(url + 'state', { headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await fetch(url + 'state', { headers, method: 'POST' })).status, 405);
    const response = await fetch(url + 'refresh', { method: 'POST', headers });
    assert.equal(response.status, 200); const body = await response.json();
    assert.equal(body.balance.total, '28.56'); assert.deepEqual(body.providerIds, ['xiaomi']);
    assert.ok(!JSON.stringify(body).includes('fixture-credential'));
    const state = await (await fetch(url + 'state', { headers })).json();
    assert.equal(state.balance.total, '28.56');
    context.connection = null;
    assert.equal((await fetch(url + 'state', { headers })).status, 503);
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); service.dispose(); }
});
test('removed credential-management endpoints return 404 and login still requires a MiMo Provider', async () => {
  const calls = [];
  const handler = makeHandler({ ctx: { connection: { requestRejection: () => undefined } },
    service: { initialize: async () => {}, snapshot: () => ({ status: 'ready' }) }, providerIds: () => ['xiaomi'],
    login: { start: async (...args) => { assert.deepEqual(args, []); calls.push('login'); },
      logout: async (...args) => { assert.deepEqual(args, []); calls.push('logout'); } },
    keys: { connect: async p => calls.push(['connect', p]), rollback: async p => calls.push(['rollback', p]),
      snapshot: async () => ({ xiaomi: { status: 'connected', connected: true } }) } });
  const server = createServer(handler); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/dsh-mimo-balance/`;
  const options = { method: 'POST', headers: { 'X-DSH-MiMo-Request': '1' } };
  try {
    for (const action of ['key-connect', 'key-rollback']) {
      for (const query of ['', '?provider=openai', '?provider=xiaomi']) {
        assert.equal((await fetch(base + action + query, options)).status, 404);
      }
    }
    assert.deepEqual(calls, []);
    assert.equal((await fetch(base + 'login', options)).status, 400);
    assert.equal((await fetch(base + 'login?provider=openai', options)).status, 400);
    assert.equal((await fetch(base + 'login?provider=xiaomi', options)).status, 200);
    assert.deepEqual(calls, ['login']);
    assert.equal((await fetch(base + 'logout?provider=openai', options)).status, 400);
    assert.equal((await fetch(base + 'logout?provider=xiaomi', { headers: options.headers })).status, 405);
    assert.equal((await fetch(base + 'logout?provider=xiaomi', options)).status, 200);
    assert.deepEqual(calls, ['login', 'logout']);
    const state = await (await fetch(base + 'state', { headers: options.headers })).json();
    assert.deepEqual(state, { status: 'ready', providerIds: ['xiaomi'] });
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});
