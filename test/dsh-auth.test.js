import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DshSession, SESSION_REF } from '../src/dsh-auth.js';
import { consoleSession } from '../src/console-session.js';

test('console session only changes its own DSH reference and preserves unrelated credentials', async () => {
  const values = new Map([['UNRELATED_CREDENTIAL', 'fixture-unrelated-value']]);
  const credentials = { resolve: async ref => values.has(ref) ? { value: values.get(ref) } : undefined,
    set: async (ref, value) => { assert.equal(ref, SESSION_REF); values.set(ref, value); } };
  const auth = new DshSession({ credentials, now: () => 1000 });
  await assert.rejects(auth.load(), e => e.code === 'needs_login');
  await auth.save({ cookie: 'api-platform_serviceToken=fixture-token; userId=fixture-user', expiresAt: 2000 });
  assert.equal((await auth.load()).cookie, 'api-platform_serviceToken=fixture-token; userId=fixture-user');
  assert.equal(values.get('UNRELATED_CREDENTIAL'), 'fixture-unrelated-value');
  const restarted = new DshSession({ credentials, now: () => 2100 });
  await assert.rejects(restarted.load(), e => e.code === 'expired');
  credentials.resolve = async () => { throw new Error('fixture-token raw-message'); };
  await assert.rejects(auth.load(), e => e.code === 'credential_storage_unavailable' && !String(e).includes('fixture-token'));
});

test('browser session accepts real console cookie scope without a Secure-flag assumption', () => {
  const row = (name, domain, path = '/', expires = 2) => ({ name, domain, path, expires, value: 'fixture' });
  const rows = [row('api-platform_serviceToken', '.xiaomimimo.com'), row('userId', '.xiaomimimo.com'),
    row('xiaomichatbot_serviceToken', '.xiaomimimo.com'), row('api-platform_ph', 'platform.xiaomimimo.com.evil.test'),
    row('api-platform_slh', 'platform.xiaomimimo.com', '/api/v1/balance-evil')];
  assert.equal(consoleSession(rows, 1000).cookie, 'api-platform_serviceToken=fixture; userId=fixture');
  assert.equal(consoleSession(rows, 2100), null);
  assert.equal(consoleSession([rows[0]], 1000), null);
});
test('logout unsets only the console reference and leaves all unrelated credentials untouched', async () => {
  const values = new Map([[SESSION_REF, 'fixture-session'], ['UNRELATED_CREDENTIAL', 'fixture-unrelated']]);
  const auth = new DshSession({ credentials: { unset: async ref => { assert.equal(ref, SESSION_REF); values.delete(ref); } } });
  await auth.clear(); assert.equal(values.has(SESSION_REF), false); assert.equal(values.get('UNRELATED_CREDENTIAL'), 'fixture-unrelated');
});
