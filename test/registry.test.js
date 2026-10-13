import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BalanceRegistry } from '../src/registry.js';

test('providers use independent requests and return no credential references in catalog or state', async () => {
  const refs = { ONE: 'fixture-one', TWO: 'fixture-two' }; const calls = [];
  const registry = new BalanceRegistry({ credentials: { resolve: async ref => ({ value: refs[ref] }) },
    describe: () => [{ value: { providers: { a: { baseURL: 'https://api.moonshot.cn/v1', apiKeyEnv: 'ONE' }, b: { baseURL: 'https://open.bigmodel.cn/api/paas/v4', apiKeyEnv: 'TWO' } } } }],
    query: async input => { calls.push(input); return { total: input.apiKey === refs.ONE ? '1' : '2', currency: 'CNY' }; } });
  try {
    const a = registry.get('a'), b = registry.get('b'); await Promise.all([a.service.refresh(), b.service.refresh()]);
    assert.equal(a.service.snapshot().balance.total, '1'); assert.equal(b.service.snapshot().balance.total, '2');
    assert.equal(calls.length, 2); assert.ok(!JSON.stringify(registry.list()).includes('ONE'));
    assert.ok(!JSON.stringify(a.service.snapshot()).includes('fixture'));
    assert.equal(registry.get('openai'), null);
  } finally { registry.dispose(); }
});
