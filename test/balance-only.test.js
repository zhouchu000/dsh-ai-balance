import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/index.js';
import { LocalLogin } from '../src/login.js';

test('plugin exposes only balance and console-session routes without touching model settings', () => {
  const paths = [], disposers = [];
  const ctx = {
    credentials: { resolve: () => { throw Error('unexpected credential read during registration'); }, set: () => { throw Error('unexpected credential write during registration'); } },
    settings: { describe: () => [], set: () => { throw Error('unexpected model settings mutation'); } },
    connection: {}, webServer: { register: route => { paths.push(route.path); return () => {}; } },
    sessionProjections: { register: () => () => {} }, effect: register => disposers.push(register()),
  };
  try {
    apply({ inject: (_names, register) => register(ctx) });
    assert.deepEqual(paths.sort(), ['/dsh-mimo-balance/login', '/dsh-mimo-balance/logout', '/dsh-mimo-balance/refresh', '/dsh-mimo-balance/state']);
  } finally { disposers.reverse().forEach(dispose => dispose?.()); }
});

test('successful console login refreshes the balance and performs no post-login model operation', async () => {
  const effects = [];
  const service = { status: 'needs_login', loginPending: false, refresh: async options => { assert.equal(options.force, true); effects.push('balance refreshed'); } };
  const login = new LocalLogin(service, {}, { run: async () => { effects.push('console authenticated'); },
    onAuthenticated: () => { effects.push('obsolete model operation'); } });
  try {
    await login.start('xiaomi'); await login.starting;
    assert.deepEqual(effects, ['console authenticated', 'balance refreshed']);
    assert.equal(service.loginPending, false);
  } finally { login.dispose(); }
});
