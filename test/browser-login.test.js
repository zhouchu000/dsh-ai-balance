import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { launchLoginBrowser, runBrowserLogin } from '../src/browser-login.js';

test('Windows/macOS browser selection uses one implementation and excludes model secrets from child environment', async () => {
  for (const platform of ['win32', 'darwin']) {
    const browser = await launchLoginBrowser({ platform, env: { ProgramFiles: 'C:/Program Files', PATH: '/fixture', UNRELATED_SECRET: 'fixture-secret' }, exists: async () => {},
      chromium: { launch: async options => {
        assert.equal(options.headless, false); assert.ok(!JSON.stringify(options).includes('fixture-secret'));
        assert.match(options.executablePath, platform === 'win32' ? /msedge\.exe$/ : /Google Chrome$/); return 'fixture-browser';
      } } });
    assert.equal(browser, 'fixture-browser');
  }
});

test('local browser session is validated before saving to DSH; its raw values never enter a frontend', async () => {
  const browser = new EventEmitter(); let closed = 0, saved;
  const rows = [{ name: 'api-platform_serviceToken', value: 'fixture-token', domain: '.xiaomimimo.com', path: '/', expires: -1 },
    { name: 'userId', value: 'fixture-user', domain: '.xiaomimimo.com', path: '/', expires: -1 }];
  browser.close = async () => { closed++; };
  browser.newContext = async () => ({ newPage: async () => ({ goto: async url => assert.equal(url, 'https://platform.xiaomimimo.com/console/balance') }),
    cookies: async url => { assert.equal(url, 'https://platform.xiaomimimo.com'); return rows; } });
  await runBrowserLogin({ launch: async () => browser, auth: { save: async session => { saved = session; } }, query: async input => assert.ok(input.cookie.includes('fixture-token')) });
  assert.equal(saved.cookie, 'api-platform_serviceToken=fixture-token; userId=fixture-user'); assert.equal(closed, 1);
});
test('closing the login browser during validation cancels it without saving the console session', async () => {
  const browser = new EventEmitter(); let saves = 0, validationSignal;
  browser.close = async () => {};
  browser.newContext = async () => ({ newPage: async () => ({ goto: async () => {} }), cookies: async () =>
    [{ name: 'api-platform_serviceToken', value: 'fixture-token', domain: '.xiaomimimo.com', path: '/', expires: -1 },
     { name: 'userId', value: 'fixture-user', domain: '.xiaomimimo.com', path: '/', expires: -1 }] });
  await assert.rejects(runBrowserLogin({ launch: async () => browser, auth: { save: async () => { saves++; } },
    query: async ({ signal }) => { validationSignal = signal; browser.emit('disconnected'); } }), e => e.code === 'login_cancelled');
  assert.equal(saves, 0); assert.equal(validationSignal.aborted, true);
});
