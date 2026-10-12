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
  assert.throws(() => usageProjection.stateSchema.parse(state), /Invalid MiMo usage accounting/);
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
  assert.equal(partial.routes[0].missing, 1);
  const inherited = fold([summary('xiaomi', 'mimo-v2.6-pro'), route('xiaomi', 'mimo-v2.6-pro'), sample(0, 0, usage)], 1);
  assert.equal(quoteUsage(inherited, ['xiaomi'], 'CNY').text, '¥3.00');
});
