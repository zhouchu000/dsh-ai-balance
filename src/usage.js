import { pricingCurrency, ratesFor, usageBand, validBand } from './pricing.js';
const count = x => Number.isSafeInteger(x) && x >= 0;
const route = x => x && typeof x.provider === 'string' && x.provider.length <= 160
  && typeof x.model === 'string' && x.model.length <= 256 ? { provider: x.provider, model: x.model } : null;
const empty = r => ({ ...r, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, missing: 0, samples: 0 });
const fields = ['input', 'output', 'cacheRead', 'cacheWrite', 'missing', 'samples'];
const MAX_ROUTES = 256;
const rowKey = r => JSON.stringify([r.provider, r.model, ...(r.band === undefined ? [] : [r.band])]);
const only = (value, keys) => Object.keys(value).every(k => keys.includes(k));
function validateView(v) {
  if (!v || !only(v, ['routes']) || !Array.isArray(v.routes) || v.routes.length > MAX_ROUTES + 1
    || v.routes.some(r => !route(r) || !only(r, ['provider', 'model', 'band', ...fields]) || r.band !== undefined && !validBand(r.band) || fields.some(k => !count(r[k])))) throw new Error('Invalid usage accounting');
  return v;
}
function validateState(s) {
  if (!s || !only(s, ['inherited', 'route', 'rows', 'last', 'view', 'overflow', 'started', 'compaction']) || !count(s.inherited)
    || typeof s.overflow !== 'boolean' || !s.rows || typeof s.rows !== 'object' || s.route !== null && !route(s.route)) throw new Error('Invalid usage accounting');
  validateView({ routes: Object.values(s.rows) }); validateView(s.view);
  if (Object.entries(s.rows).some(([key, row]) => key !== rowKey(row))) throw new Error('Invalid usage accounting');
  if (s.last !== null && (!count(s.last?.turn) || !count(s.last?.step) || !s.rows[s.last?.key]
    || !s.last.buckets || fields.some(k => !count(s.last.buckets[k])))) throw new Error('Invalid usage accounting');
  if (s.started !== null && (!s.started || !only(s.started, ['turn', 'step', 'time']) || !count(s.started.turn) || !count(s.started.step) || !count(s.started.time))) throw new Error('Invalid usage accounting');
  if (s.compaction !== null && (!s.compaction || !only(s.compaction, ['id', 'time']) || typeof s.compaction.id !== 'string' || s.compaction.id.length > 256 || !count(s.compaction.time))) throw new Error('Invalid usage accounting');
  return s;
}
function usageOf(event) {
  let usage = event.data.usage;
  if (usage === undefined) for (let i = (event.data.stream?.length || 0) - 1; i >= 0; i--) {
    const record = event.data.stream[i];
    if (record.type === 'chunk' && record.chunk?.type === 'usage') { usage = record.chunk.usage; break; }
  }
  if (!usage || !count(usage.inputTokens) || !count(usage.outputTokens)
    || !count(usage.cacheReadTokens ?? 0) || !count(usage.cacheWriteTokens ?? 0)) return null;
  const sum = usage.inputTokens + usage.outputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
  if (!count(sum) || usage.totalTokens !== undefined && usage.totalTokens !== sum) return null;
  return { input: usage.inputTokens, output: usage.outputTokens, cacheRead: usage.cacheReadTokens ?? 0,
    cacheWrite: usage.cacheWriteTokens ?? 0, missing: 0, samples: 1 };
}

/** Official whole-log projection; only numerical accounting and route metadata leave the backend. */
export const usageProjection = {
  key: 'aiConversationUsage', stateVersion: 3, stateSchema: { parse: validateState },
  init: (_header, inherited = 0) => ({ inherited, route: null, rows: {}, last: null, started: null, compaction: null, overflow: false, view: { routes: [] } }),
  apply(state, event) {
    if (event.type === 'request/context' || event.type === 'request/header') {
      const next = route(event.type === 'request/context' ? event.data : event.data.header?.config);
      return next ? { ...state, route: next } : { ...state, route: null };
    }
    if (event.seq < state.inherited) return state;
    if (event.type === 'compaction/start') return { ...state, compaction: typeof event.data.compactionId === 'string' && event.data.compactionId.length <= 256 && count(event.time) ? { id: event.data.compactionId, time: event.time } : null };
    if (event.type === 'compaction/end') return { ...state, compaction: null };
    if (event.type === 'step/start' || event.type === 'llm/retry-started') {
      const started = count(event.time) ? { turn: event.data.turn, step: event.data.step, time: event.time } : null;
      return { ...state, started, last: event.type === 'llm/retry-started' && state.last?.turn === event.data.turn && state.last.step === event.data.step ? null : state.last };
    }
    const summary = event.type === 'compaction/summary';
    if (!summary && !['assistant/message', 'assistant/attempt'].includes(event.type)) return state;
    // Template-only summaries do not imply a paid call. Mark known calls with missing usage incomplete.
    if (summary && event.data.usage === undefined && event.data.llmStreamCall !== true) return state;
    const r = (summary ? route(event.data) : route(event.data.message?.source) || state.route) || { provider: '', model: '' };
    const buckets = usageOf(event) || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, missing: 1, samples: 0 };
    const start = summary ? state.compaction?.id === event.data.compactionId ? state.compaction?.time : undefined
      : state.started?.turn === event.data.turn && state.started.step === event.data.step ? state.started.time : undefined;
    const band = usageBand(buckets, start, summary && start === undefined ? undefined : event.time);
    const key = rowKey({ ...r, band });
    const incomplete = rows => ({ routes: [...Object.values(rows).filter(x => x.samples || x.missing), { ...empty({ provider: '', model: '' }), missing: 1 }] });
    if (!state.rows[key] && Object.keys(state.rows).length >= MAX_ROUTES) return { ...state, overflow: true, view: incomplete(state.rows) };
    const previous = !summary && state.last?.turn === event.data.turn && state.last.step === event.data.step ? state.last : null;
    const rows = { ...state.rows };
    if (previous) {
      const row = { ...rows[previous.key] };
      fields.forEach(f => { row[f] -= previous.buckets[f]; }); rows[previous.key] = row;
    }
    const row = { ...(rows[key] || { ...empty(r), band }) };
    fields.forEach(f => { row[f] += buckets[f]; });
    if (fields.some(f => !count(row[f]))) return { ...state, overflow: true, view: incomplete(state.rows) };
    rows[key] = row;
    const view = state.overflow ? incomplete(rows) : { routes: Object.values(rows).filter(x => x.samples || x.missing) };
    return { ...state, rows, view, last: summary ? state.last : { turn: event.data.turn, step: event.data.step, key, buckets } };
  },
  wire: { viewSchema: { parse: validateView }, view: state => state.view },
};

/** Price recorded calls for the selected provider, independently of balance authentication. */
export function quoteUsage(view, providers, currency) {
  const unavailable = { text: '—', partial: true };
  try { validateView(view); } catch { return unavailable; }
  const profiles = new Map(providers.map(p => typeof p === 'string' ? [p, { id: p, kind: 'mimo' }] : [p.id, p]));
  const totals = new Map(); let partial = false, known = false;
  for (const p of profiles.values()) {
    const unit = pricingCurrency(p.kind, currency);
    if (unit) totals.set(unit, [0n, 0n]);
  }
  if (!totals.size) return unavailable;
  for (const row of view.routes) {
    if (!row.provider) { partial = true; continue; }
    const profile = profiles.get(row.provider);
    if (!profile) continue;
    const unit = pricingCurrency(profile.kind, currency);
    const rates = ratesFor(profile.kind, row.model, unit, row.band);
    if (!rates || row.cacheWrite > 0 && rates.some(r => r[3] === undefined)) { partial = true; continue; }
    if (row.missing) partial = true;
    if (!row.samples) continue;
    known = true;
    const amounts = rates.map(r => BigInt(row.input) * BigInt(r[0]) + BigInt(row.cacheRead) * BigInt(r[1])
      + BigInt(row.output) * BigInt(r[2]) + BigInt(row.cacheWrite) * BigInt(r[3] ?? 0));
    const total = totals.get(unit);
    total[0] += amounts.reduce((a, b) => a < b ? a : b);
    total[1] += amounts.reduce((a, b) => a > b ? a : b);
  }
  if (partial && !known) return unavailable;
  const text = [...totals].map(([unit, [low, high]]) => {
    const from = formatEstimate(low, unit), to = formatEstimate(high, unit);
    return from === to ? from : from + '–' + to;
  }).join(' / ');
  return { text: text + (partial ? '（部分）' : ''), partial };
}
function formatEstimate(numerator, currency) {
  const symbol = currency === 'CNY' ? '¥' : 'US$';
  const units = (numerator + 500000n) / 1000000n;
  const whole = units / 10000n, decimals = (units % 10000n).toString().padStart(4, '0');
  const amount = decimals.endsWith('00') ? decimals.slice(0, 2) : decimals;
  return numerator > 0n && units === 0n ? '<' + symbol + '0.0001' : symbol + whole + '.' + amount;
}
