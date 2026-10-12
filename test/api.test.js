import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBalance, queryBalance, formatMoney } from '../src/api.js';

// Same fields/types as the real 2026-10-12 response; test amounts are fixtures only.
export const response = { code: 0, message: '', data: {
  balance: '28.56', frozenBalance: '0.00', currency: 'CNY', overdraftLimit: '0.00',
  remainingOverdraftLimit: '0.00', giftBalance: '10.00', cashBalance: '18.56',
} };

test('uses only observed fields, preserving cash/gift and explicit currency', () => {
  assert.deepEqual(parseBalance(response), { total: '28.56', currency: 'CNY', cash: '18.56', gift: '10.00' });
  assert.equal(formatMoney('28.56', 'CNY'), '¥28.56');
  assert.equal(formatMoney('12.00', 'USD'), 'US$12.00');
  assert.equal(formatMoney('12.00', 'CREDITS'), 'CREDITS 12.00');
});

test('unknown fields, missing currency, or invalid decimal amounts never become a balance', () => {
  for (const body of [
    { code: 0, data: { total_balance: '28.56', currency: 'CNY' } },
    { code: 0, data: { balance: '28.56' } },
    { code: 0, data: { balance: 'NaN', currency: 'CNY' } },
    { code: 0, data: { ...response.data, cashBalance: 'bad' } },
    { code: 7, data: response.data },
  ]) assert.throws(() => parseBalance(body), { code: 'unreadable' });
  assert.deepEqual(parseBalance({ code: 0, data: { balance: '0.00', currency: 'CNY' } }), { total: '0.00', currency: 'CNY' });
});

test('GET authenticates to the fixed MiMo origin and prohibits redirects', async () => {
  const result = await queryBalance({ cookie: 'api-platform_serviceToken=fixture-secret', fetchImpl: async (url, init) => {
    assert.equal(url, 'https://platform.xiaomimimo.com/api/v1/balance');
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.headers.Cookie, 'api-platform_serviceToken=fixture-secret');
    assert.equal(init.headers.Authorization, undefined);
    return new Response(JSON.stringify(response), { status: 200 });
  } });
  assert.equal(result.total, '28.56');
});

test('401, network, timeout and raw error bodies produce safe error codes', async () => {
  for (const [fetchImpl, code] of [
    [async () => new Response('{"code":401,"loginUrl":"private"}', { status: 401 }), 'expired'],
    [async () => new Response('fixture-secret', { status: 500 }), 'network'],
    [async () => new Response(null, { status: 302, headers: { location: 'https://third-party.invalid/' } }), 'expired'],
    [async () => { throw new Error('fixture-secret'); }, 'network'],
    [async () => { throw new DOMException('fixture-secret', 'TimeoutError'); }, 'timeout'],
  ]) {
    await assert.rejects(queryBalance({ cookie: 'fixture-secret', fetchImpl }), error => error.code === code && !String(error).includes('fixture-secret'));
  }
});
