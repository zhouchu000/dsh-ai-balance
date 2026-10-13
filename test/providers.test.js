import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverProviders } from '../src/providers.js';
import { parseProviderBalance, queryProviderBalance, parseAccountBalance, validateBalance } from '../src/provider-api.js';
import { ProviderAuth } from '../src/provider-auth.js';

const describe = providers => [{ ns: 'llm-pi-ai', value: { providers } }];
test('exact provider IDs and official endpoints select balances without guessing model names', () => {
  const p = discoverProviders(describe({
    xiaomi: { apiKeyEnv: 'MIMO_REF' }, deepseek: { apiKeyEnv: 'DEEP_REF' },
    moonshot: { baseURL: 'https://api.moonshot.cn/v1', apiKeyEnv: 'KIMI_REF' },
    custom: { baseURL: 'https://open.bigmodel.cn/api/paas/v4', apiKeyEnv: 'GLM_REF' },
    international: { baseURL: 'https://api.moonshot.ai/v1', apiKeyEnv: 'INTL_REF' },
    openai: { displayName: 'MiMo Kimi GLM', baseURL: 'https://api.openai.com/v1' },
    fake: { baseURL: 'https://api.moonshot.cn.evil.test/v1' },
    plan: { baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4' },
    xiaomiplan: { baseURL: 'https://token-plan-cn.xiaomimimo.com/v1' },
  }));
  assert.equal(p.find(x => x.id === 'xiaomi').kind, 'mimo');
  assert.equal(p.find(x => x.id === 'deepseek').kind, 'deepseek');
  assert.equal(p.find(x => x.id === 'moonshot').kind, 'kimi-cn');
  assert.equal(p.find(x => x.id === 'international').kind, 'kimi-intl');
  assert.equal(p.find(x => x.id === 'custom').kind, 'glm');
  for (const id of ['openai', 'fake']) assert.equal(p.some(x => x.id === id), false);
  assert.equal(discoverProviders(describe({ deepseek: { baseURL: 'https://proxy.example/v1' } })).some(x => x.id === 'deepseek'), false);
});
test('named credential reference stays scoped to the selected provider', async () => {
  const reads = [];
  const auth = new ProviderAuth({ provider: { id: 'custom', kind: 'kimi-cn', credentialRef: 'MY_KIMI' },
    credentials: { resolve: async ref => { reads.push(ref); return ref === 'MY_KIMI' ? { value: 'fixture-secret' } : undefined; } } });
  const session = await auth.load();
  assert.deepEqual(reads, ['MY_KIMI']); assert.equal(session.apiKey, 'fixture-secret');
  assert.match(session.identity, /^[a-f0-9]{64}$/);
  const missing = new ProviderAuth({ provider: { id: 'custom', kind: 'kimi-cn', credentialRef: 'ABSENT' }, credentials: { resolve: async () => undefined } });
  await assert.rejects(missing.load(), { code: 'needs_key' });
});
test('official response parsers preserve currencies and reported available balance', () => {
  const ds = parseProviderBalance('deepseek', { is_available: true, balance_infos: [
    { currency: 'USD', total_balance: '4.50', topped_up_balance: '3.50', granted_balance: '1.00' },
    { currency: 'CNY', total_balance: '9.00', topped_up_balance: '8.00', granted_balance: '1.00' },
  ] });
  assert.equal(ds.currency, 'USD'); assert.equal(ds.accounts.length, 2);
  const k = { code: 0, status: true, data: { available_balance: 10, cash_balance: -3, voucher_balance: 10 } };
  assert.equal(parseProviderBalance('kimi-cn', k).total, '10');
  assert.equal(parseProviderBalance('kimi-cn', k).currency, 'CNY');
  assert.equal(parseProviderBalance('kimi-intl', k).currency, 'USD');
  const g = parseProviderBalance('glm', { code: 200, success: true, data: { availableBalance: 7.5, balance: 10, giveAmount: 100, rechargeAmount: 500 } });
  assert.deepEqual(g, { total: '7.5', currency: 'CNY' }); // Cumulative deposits/gifts are not remaining funds.
  for (const [kind, body] of [['deepseek', { balance_infos: [] }], ['kimi-cn', { ...k, code: 1 }], ['glm', { code: 200, data: { balance: 100 } }]])
    assert.throws(() => parseProviderBalance(kind, body), { code: 'unreadable' });
});
test('account wallet totals use exact decimals including exponent values', () => {
  const b = parseAccountBalance({ status: 'ready', value: [{ currency: 'CNY', balance: '0E-16' }], bonusWallets: [{ currency: 'CNY', balance: '0.1234567890123456' }] });
  assert.equal(b.total, '0.1234567890123456'); assert.equal(b.cash, '0');
  assert.throws(() => parseAccountBalance(null), { code: 'needs_account' });
});
test('API adapter uses fixed destinations and keeps credentials out of error output', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ code: 0, status: true, data: { available_balance: 5, cash_balance: 5, voucher_balance: 0 } })); };
  await queryProviderBalance({ kind: 'kimi-cn', apiKey: 'fixture-secret', fetchImpl });
  assert.equal(calls[0].url, 'https://api.moonshot.cn/v1/users/me/balance');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer fixture-secret');
  await assert.rejects(queryProviderBalance({ kind: 'glm', apiKey: 'fixture-secret', fetchImpl: async () => new Response('{"code":1002,"msg":"fixture-secret","success":false}') }), e => e.code === 'invalid_key' && !e.message.includes('fixture-secret'));
  await assert.rejects(queryProviderBalance({ kind: 'kimi-cn', apiKey: 'fixture-secret', fetchImpl: async () => new Response('', { status: 302, headers: { Location: 'https://evil.test' } }) }), { code: 'invalid_key' });
});

test('coding endpoints are distinct from cash accounts for Kimi, GLM and MiMo', () => {
  const rows = discoverProviders(describe({
    'kimi-coding': { apiKeyEnv: 'KIMI' }, zai: { apiKeyEnv: 'GLM' },
    'glm-cn': { baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4', apiKeyEnv: 'GLM_CN' },
    'mimo-plan': { baseURL: 'https://token-plan-cn.xiaomimimo.com/v1', apiKeyEnv: 'MIMO_PLAN' },
  }));
  assert.equal(rows.find(x => x.id === 'kimi-coding')?.kind, 'kimi-plan');
  assert.equal(rows.find(x => x.id === 'zai')?.kind, 'glm-plan-intl');
  assert.equal(rows.find(x => x.id === 'glm-cn')?.kind, 'glm-plan');
  assert.equal(rows.find(x => x.id === 'mimo-plan')?.kind, 'mimo-plan');
});
test('coding quotas stay percentages and never become cash balances', () => {
  const kimi = parseProviderBalance('kimi-plan', { usages: { limit_5h: { used_ratio: 0.25, reset_time: '2030-01-01T00:00:00Z' }, limit_7d: { used_ratio: 0.6 } } });
  assert.equal(kimi.type, 'quota'); assert.equal(kimi.windows[0].remainingPercent, 75); assert.equal(kimi.currency, undefined);
  const glm = parseProviderBalance('glm-plan', { code: 200, success: true, data: { limits: [{ type: 'TOKENS_LIMIT', percentage: 30 }, { type: 'TIME_LIMIT', percentage: 20 }] } });
  assert.equal(glm.windows[0].remainingPercent, 70); assert.equal(glm.windows[1].label, 'MCP');
  const mimo = parseProviderBalance('mimo-plan', { code: 0, data: { usage: { items: [{ name: 'total_token', percent: 0.2, used: 200, limit: 1000 }] } } });
  assert.equal(mimo.windows[0].remainingPercent, 80); assert.equal(mimo.total, undefined);
  assert.throws(() => parseProviderBalance('kimi-plan', { usages: {} }), { code: 'unreadable' });
});

test('native MiMo regions and official Anthropic coding endpoints are recognized', () => {
  const rows = discoverProviders(describe({
    'xiaomi-token-plan-cn': { apiKeyEnv: 'PLAN' },
    cn: { baseURL: 'https://open.bigmodel.cn/api/anthropic' },
    intl: { baseURL: 'https://api.z.ai/api/anthropic' },
    kimi: { baseURL: 'https://api.kimi.com/coding' },
  }));
  for (const region of ['cn', 'sgp', 'ams']) assert.equal(rows.find(p => p.id === 'xiaomi-token-plan-' + region)?.kind, 'mimo-plan');
  assert.equal(rows.find(p => p.id === 'cn')?.kind, 'glm-plan');
  assert.equal(rows.find(p => p.id === 'intl')?.kind, 'glm-plan-intl');
  assert.equal(rows.find(p => p.id === 'kimi')?.kind, 'kimi-plan');
});
test('native stored login wins over default environment but never over an explicit reference', async () => {
  const reads = [];
  const credentials = { readRecord: async key => { reads.push(key); return { kind: 'api-key', key: 'stored-fixture' }; }, resolve: async () => ({ value: 'env-fixture' }) };
  const provider = discoverProviders().find(p => p.id === 'kimi-coding');
  assert.equal((await new ProviderAuth({ provider, credentials }).load()).apiKey, 'stored-fixture');
  assert.deepEqual(reads, ['llm-pi-ai/kimi-coding']);
  const explicit = discoverProviders(describe({ 'kimi-coding': { apiKeyEnv: 'EXPLICIT' } })).find(p => p.id === 'kimi-coding');
  assert.equal((await new ProviderAuth({ provider: explicit, credentials }).load()).apiKey, 'env-fixture');
  assert.equal(reads.length, 1);
});

test('missing or coerced quota ratios never appear as unused quota', () => {
  for (const percent of [null, undefined, '0', false]) {
    assert.throws(() => parseProviderBalance('mimo-plan', { code: 0, data: { usage: { items: [{ name: 'total_token', percent, limit: 100 }] } } }), { code: 'unreadable' });
    assert.throws(() => parseProviderBalance('kimi-plan', { usages: { limit_5h: { used_ratio: percent } } }), { code: 'unreadable' });
  }
});

test('consumed quota preserves reported over-limit percentages through cache validation', () => {
  const result = parseProviderBalance('kimi-plan', { usages: { limit_5h: { used_ratio: 1.254 } } });
  assert.equal(result.windows[0].remainingPercent, 0);
  assert.equal(validateBalance(JSON.parse(JSON.stringify(result))).windows[0].usedPercent, 125.4);
  const rounded = parseProviderBalance('kimi-plan', { usages: { limit_5h: { used_ratio: 0.0005 } } });
  assert.equal(rounded.windows[0].usedPercent, 0.1);
  assert.equal(rounded.windows[0].remainingPercent, 99.9);
});
