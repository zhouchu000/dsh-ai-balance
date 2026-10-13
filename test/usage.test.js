import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usageProjection, quoteUsage } from '../src/usage.js';

const route = (provider, model) => ({ type: 'request/context', data: { provider, model } });
const sample = (turn, step, usage, type = 'assistant/message') => ({ type, data: { turn, step, usage,
  stream: [{ type: 'chunk', chunk: { type: 'usage', usage } }] } });
function fold(events, inherited = 0) {
  let state = usageProjection.init({}, inherited);
  events.forEach((event, seq) => { state = usageProjection.apply(state, { ...event, seq }); });
  return usageProjection.wire.view(state);
}
test('whole-log usage prices each recorded MiMo model and excludes other providers', () => {
  const view = fold([route('xiaomi', 'mimo-v2.6-pro'), sample(0, 0, { inputTokens: 1000000, outputTokens: 100000, cacheReadTokens: 2000000 }),
    route('deepseek', 'mimo-v2.6-pro'), sample(1, 0, { inputTokens: 9000000, outputTokens: 9000000 }),
    route('my-mimo', 'mimo-v2.6-flash'), sample(2, 0, { inputTokens: 1000000, outputTokens: 100000 })]);
  assert.equal(quoteUsage(view, ['xiaomi', 'my-mimo'], 'CNY').text, '¥4.85');
  assert.equal(quoteUsage(view, ['xiaomi', 'my-mimo'], 'USD').text, 'US$0.6972');
});
test('settlement replacement and real retry boundaries prevent both double counts and missed attempts', () => {
  const usage = { inputTokens: 1000000, outputTokens: 0 };
  const view = fold([route('xiaomi', 'mimo-v2.6-pro'), sample(0, 0, usage, 'assistant/attempt'), sample(0, 0, usage),
    { type: 'llm/retry-started', data: { turn: 0, step: 0 } }, sample(0, 0, usage)]);
  assert.equal(quoteUsage(view, ['xiaomi'], 'CNY').text, '¥6.00');
});
test('forked conversations exclude inherited spending but retain route attribution', () => {
  const view = fold([route('xiaomi', 'mimo-v2.6-pro'), sample(0, 0, { inputTokens: 1000000, outputTokens: 0 }),
    sample(1, 0, { inputTokens: 100000, outputTokens: 0 })], 2);
  assert.equal(quoteUsage(view, ['xiaomi'], 'CNY').text, '¥0.30');
});
test('missing attribution, unreported usage, unknown models and currencies never become fabricated full totals', () => {
  for (const view of [fold([sample(0, 0, { inputTokens: 4, outputTokens: 5 })]),
    fold([route('xiaomi', 'new-unpriced-model'), sample(0, 0, { inputTokens: 4, outputTokens: 5 })]),
    fold([route('xiaomi', 'mimo-v2.6-pro'), { type: 'assistant/attempt', data: { turn: 0, step: 0, stream: [] } }])]) {
    assert.equal(quoteUsage(view, ['xiaomi'], 'CNY').text, '—');
  }
  assert.equal(quoteUsage(fold([]), ['xiaomi'], 'CREDITS').text, '—');
  assert.equal(quoteUsage(undefined, ['xiaomi'], 'CNY').text, '—');
  assert.equal(quoteUsage(fold([]), ['xiaomi'], 'CNY').text, '¥0.00');
});
test('usage projection persists only accounting, survives replay and marks partial estimates', () => {
  const events = [route('xiaomi', 'mimo-v2.6-pro'), sample(0, 0, { inputTokens: 1000000, outputTokens: 0 }),
    route('xiaomi', 'unknown'), sample(1, 0, { inputTokens: 10, outputTokens: 0 })];
  let state = usageProjection.init({}, 0);
  events.forEach((e, seq) => { state = usageProjection.apply(state, { ...e, seq }); state = usageProjection.stateSchema.parse(JSON.parse(JSON.stringify(state))); });
  const view = usageProjection.wire.view(state);
  assert.deepEqual(view, fold(events)); assert.equal(quoteUsage(view, ['xiaomi'], 'CNY').text, '¥3.00（部分）');
  const unchanged = usageProjection.apply(state, { type: 'user/message', seq: 4, data: { content: 'fixture private message' } });
  assert.equal(unchanged, state); assert.ok(!JSON.stringify(view).includes('fixture private message'));
  assert.equal(quoteUsage(fold([route('xiaomi', 'mimo-v2.6-pro'), sample(0, 0, { inputTokens: 1, outputTokens: 0 })]), ['xiaomi'], 'CNY').text, '<¥0.0001');
});
test('invalid accounting and unverified cache-write pricing do not become complete money totals', () => {
  for (const usage of [{ inputTokens: -1, outputTokens: 0 }, { inputTokens: 1, outputTokens: 0, totalTokens: 9000 },
    { inputTokens: 1, outputTokens: 0, cacheWriteTokens: 1000 }]) {
    assert.equal(quoteUsage(fold([route('xiaomi', 'mimo-v2.6-pro'), sample(0, 0, usage)]), ['xiaomi'], 'CNY').text, '—');
  }
  const state = usageProjection.init({}, 0); state.rows['bad'] = { secret: 'fixture-secret' };
  assert.throws(() => usageProjection.stateSchema.parse(state), /Invalid usage accounting/);
});
test('paid compaction summaries use their own route and never replace assistant settlements', () => {
  const usage = { inputTokens: 1000000, outputTokens: 0 };
  const summary = (provider, model, extra = {}) => ({ type: 'compaction/summary', data: { provider, model, usage, llmStreamCall: true, ...extra } });
  const view = fold([route('xiaomi', 'mimo-v2.6-pro'), sample(0, 0, usage, 'assistant/attempt'),
    summary('xiaomi', 'mimo-v2.6-pro'), sample(0, 0, usage),
    summary('xiaomi', 'mimo-v2.6-flash'), summary('deepseek', 'mimo-v2.6-pro')]);
  assert.equal(quoteUsage(view, ['xiaomi'], 'CNY').text, '¥7.00');
  const partial = fold([route('xiaomi', 'mimo-v2.6-pro'), sample(0, 0, usage),
    summary('xiaomi', 'mimo-v2.6-pro', { usage: undefined }),
    summary('xiaomi', 'mimo-v2.6-pro', { usage: undefined, llmStreamCall: undefined })]);
  assert.equal(quoteUsage(partial, ['xiaomi'], 'CNY').text, '¥3.00（部分）');
  assert.equal(partial.routes.reduce((sum, row) => sum + row.missing, 0), 1);
  const inherited = fold([summary('xiaomi', 'mimo-v2.6-pro'), route('xiaomi', 'mimo-v2.6-pro'), sample(0, 0, usage)], 1);
  assert.equal(quoteUsage(inherited, ['xiaomi'], 'CNY').text, '¥3.00');
});

test('DeepSeek costs follow each call time, cache bucket and selected Provider ID', () => {
  const at = (time, event) => ({ ...event, time: Date.parse(time) });
  const view = fold([route('custom-ds', 'deepseek-flash'),
    at('2026-10-14T01:00:00Z', sample(0, 0, { inputTokens: 1000000, outputTokens: 1000000, cacheReadTokens: 1000000 })),
    at('2026-10-14T04:00:00Z', sample(1, 0, { inputTokens: 1000000, outputTokens: 1000000, cacheReadTokens: 1000000 })),
    route('other', 'deepseek-flash'), sample(2, 0, { inputTokens: 9000000, outputTokens: 9000000 })]);
  assert.equal(quoteUsage(view, [{ id: 'custom-ds', kind: 'deepseek' }]).text, '¥15.06');
  assert.equal(quoteUsage(view, [{ id: 'custom-ds', kind: 'deepseek' }], 'USD').text, 'US$2.2590');
  const holiday = fold([route('ds', 'deepseek-v4-pro'), at('2026-10-01T01:00:00Z', sample(0, 0, { inputTokens: 1000000, outputTokens: 0 }))]);
  assert.equal(quoteUsage(holiday, [{ id: 'ds', kind: 'deepseek-account' }]).text, '¥4.50');
});
test('DeepSeek missing time and calls crossing tariff boundaries produce a bounded estimate', () => {
  const view = fold([route('ds', 'deepseek-v4-pro'), sample(0, 0, { inputTokens: 1000000, outputTokens: 0 })]);
  assert.equal(quoteUsage(view, [{ id: 'ds', kind: 'deepseek' }]).text, '¥4.50–¥9.00');
  const crossing = fold([route('ds', 'deepseek-flash'),
    { type: 'step/start', time: Date.parse('2026-10-14T03:59:00Z'), data: { turn: 0, step: 0 } },
    { ...sample(0, 0, { inputTokens: 1000000, outputTokens: 0 }), time: Date.parse('2026-10-14T04:01:00Z') }]);
  assert.equal(quoteUsage(crossing, [{ id: 'ds', kind: 'deepseek' }]).text, '¥1.00–¥2.00');
});
test('Kimi uses regional prices and cache writes retain their possible TTL cost', () => {
  const view = fold([route('moon', 'kimi-k2.7-code'), sample(0, 0, { inputTokens: 1000000, outputTokens: 100000, cacheReadTokens: 2000000 })]);
  assert.equal(quoteUsage(view, [{ id: 'moon', kind: 'kimi-cn' }]).text, '¥11.80');
  assert.equal(quoteUsage(view, [{ id: 'moon', kind: 'kimi-intl' }]).text, 'US$1.73');
  const k3 = fold([route('moon', 'kimi-k3'), sample(0, 0, { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1000000 })]);
  assert.equal(quoteUsage(k3, [{ id: 'moon', kind: 'kimi-cn' }]).text, '¥20.00–¥40.00');
});
test('GLM prices use individual request lengths including cached input, not the conversation sum', () => {
  const view = fold([route('custom-glm', 'glm-5-turbo'),
    sample(0, 0, { inputTokens: 20000, outputTokens: 1000 }),
    sample(1, 0, { inputTokens: 20000, outputTokens: 1000 }),
    sample(2, 0, { inputTokens: 20000, outputTokens: 1000, cacheReadTokens: 20000 })]);
  assert.equal(quoteUsage(view, [{ id: 'custom-glm', kind: 'glm' }]).text, '¥0.4460');
  const smallOutput = fold([route('glm', 'glm-4.7'), sample(0, 0, { inputTokens: 10000, outputTokens: 100 }),
    sample(1, 0, { inputTokens: 10000, outputTokens: 300 })]);
  assert.equal(quoteUsage(smallOutput, [{ id: 'glm', kind: 'glm' }]).text, '¥0.0550');
});
test('unpriced models and subscription quota are never priced as a similarly named model', () => {
  for (const [kind, model] of [['glm', 'glm-5.3-highspeed'], ['deepseek', 'mimo-v2.6-pro'], ['kimi-plan', 'k3'], ['glm-plan', 'glm-5.3']]) {
    const view = fold([route('p', model), sample(0, 0, { inputTokens: 1000000, outputTokens: 0 })]);
    assert.equal(quoteUsage(view, [{ id: 'p', kind }]).text, '—');
  }
  assert.equal(quoteUsage(fold([]), [{ id: 'p', kind: 'unknown' }]).text, '—');
});

test('GLM ambiguous K-unit boundaries stay a range and retries retain separate tariff bands after replay', () => {
  const provider = [{ id: 'glm', kind: 'glm' }];
  const boundary = fold([route('glm', 'glm-5-turbo'), sample(0, 0, { inputTokens: 32000, outputTokens: 0 })]);
  assert.equal(quoteUsage(boundary, provider).text, '¥0.16–¥0.2240');
  const events = [route('glm', 'glm-5-turbo'), sample(0, 0, { inputTokens: 10000, outputTokens: 100 }, 'assistant/attempt'),
    sample(0, 0, { inputTokens: 40000, outputTokens: 100 }),
    { type: 'llm/retry-started', data: { turn: 0, step: 0 } }, sample(0, 0, { inputTokens: 10000, outputTokens: 100 })];
  let state = usageProjection.init({}, 0);
  for (const [seq, event] of events.entries()) state = usageProjection.stateSchema.parse(JSON.parse(JSON.stringify(usageProjection.apply(state, { ...event, seq }))));
  assert.equal(quoteUsage(state.view, provider).text, '¥0.3348');
  assert.deepEqual(state.view, fold(events));
});
test('model IDs cannot resolve inherited object properties as prices', () => {
  for (const model of ['constructor', '__proto__', 'toString']) {
    const view = fold([route('moon', model), sample(0, 0, { inputTokens: 100, outputTokens: 100 })]);
    assert.equal(quoteUsage(view, [{ id: 'moon', kind: 'kimi-cn' }]).text, '—');
  }
});

test('paid compaction calls crossing peak boundaries use their own start time', () => {
  const events = [route('ds', 'deepseek-flash'),
    { type: 'compaction/start', time: Date.parse('2026-10-14T03:59:00Z'), data: { compactionId: 'summary-1', turn: null } },
    { type: 'compaction/summary', time: Date.parse('2026-10-14T04:01:00Z'), data: { compactionId: 'summary-1', provider: 'ds', model: 'deepseek-flash', llmStreamCall: true, usage: { inputTokens: 1000000, outputTokens: 0 } } }];
  assert.equal(quoteUsage(fold(events), [{ id: 'ds', kind: 'deepseek' }]).text, '¥1.00–¥2.00');
  assert.equal(quoteUsage(fold([events[0], events[2]]), [{ id: 'ds', kind: 'deepseek' }]).text, '¥1.00–¥2.00');
});
