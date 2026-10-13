/** Current public real-time token prices, verified 2026-10-12. No exchange-rate conversion. */
export const PRICE_SOURCE = 'https://mimo.mi.com/docs/price';
export const PRICE_CHECKED_AT = '2026-10-12';
const RATES = {
  CNY: { pro: [30000, 250, 60000], flash: [10000, 200, 20000], ultra: [300000, 2500, 600000] },
  USD: { pro: [4350, 36, 8700], flash: [1400, 28, 2800], ultra: [43500, 360, 87000] },
}; // 1/10000 currency unit per million tokens; cache write pricing is not inferred.
const MODEL_RATE = { 'mimo-v2.6-pro': 'pro', 'mimo-v2.5-pro': 'pro', 'mimo-v2.6-flash': 'flash',
  'mimo-v2.5': 'flash', 'mimo-v2.6-pro-ultraspeed': 'ultra' };
const count = x => Number.isSafeInteger(x) && x >= 0;
const route = x => x && typeof x.provider === 'string' && x.provider.length <= 160
  && typeof x.model === 'string' && x.model.length <= 256 ? { provider: x.provider, model: x.model } : null;
const empty = r => ({ ...r, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, missing: 0, samples: 0 });
const fields = ['input', 'output', 'cacheRead', 'cacheWrite', 'missing', 'samples'];
const MAX_ROUTES = 256;
const only = (value, keys) => Object.keys(value).every(k => keys.includes(k));
function validateView(v) {
  if (!v || !only(v, ['routes']) || !Array.isArray(v.routes) || v.routes.length > MAX_ROUTES + 1
    || v.routes.some(r => !route(r) || !only(r, ['provider', 'model', ...fields]) || fields.some(k => !count(r[k])))) throw new Error('Invalid MiMo usage accounting');
  return v;
}
function validateState(s) {
  if (!s || !only(s, ['inherited', 'route', 'rows', 'last', 'view', 'overflow']) || !count(s.inherited)
    || typeof s.overflow !== 'boolean' || !s.rows || typeof s.rows !== 'object' || s.route !== null && !route(s.route)) throw new Error('Invalid MiMo usage accounting');
  validateView({ routes: Object.values(s.rows) }); validateView(s.view);
  if (Object.entries(s.rows).some(([key, row]) => key !== JSON.stringify([row.provider, row.model]))) throw new Error('Invalid MiMo usage accounting');
  if (s.last !== null && (!count(s.last?.turn) || !count(s.last?.step) || !s.rows[s.last?.key]
    || !s.last.buckets || fields.some(k => !count(s.last.buckets[k])))) throw new Error('Invalid MiMo usage accounting');
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
  key: 'aiConversationUsage', stateVersion: 2, stateSchema: { parse: validateState },
  init: (_header, inherited = 0) => ({ inherited, route: null, rows: {}, last: null, overflow: false, view: { routes: [] } }),
  apply(state, event) {
    if (event.type === 'request/context' || event.type === 'request/header') {
      const next = route(event.type === 'request/context' ? event.data : event.data.header?.config);
      return next ? { ...state, route: next } : { ...state, route: null };
    }
    if (event.seq < state.inherited) return state;
    if (event.type === 'llm/retry-started') {
      return state.last?.turn === event.data.turn && state.last.step === event.data.step ? { ...state, last: null } : state;
    }
    const summary = event.type === 'compaction/summary';
    if (!summary && !['assistant/message', 'assistant/attempt'].includes(event.type)) return state;
    // Template-only summaries do not imply a paid call. Mark known calls with missing usage incomplete.
    if (summary && event.data.usage === undefined && event.data.llmStreamCall !== true) return state;
    const r = (summary ? route(event.data) : route(event.data.message?.source) || state.route) || { provider: '', model: '' };
    const key = JSON.stringify([r.provider, r.model]);
    const incomplete = rows => ({ routes: [...Object.values(rows).filter(x => x.samples || x.missing), { ...empty({ provider: '', model: '' }), missing: 1 }] });
    if (!state.rows[key] && Object.keys(state.rows).length >= MAX_ROUTES) return { ...state, overflow: true, view: incomplete(state.rows) };
    const buckets = usageOf(event) || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, missing: 1, samples: 0 };
    const previous = !summary && state.last?.turn === event.data.turn && state.last.step === event.data.step ? state.last : null;
    const rows = { ...state.rows };
    if (previous) {
      const row = { ...rows[previous.key] };
      fields.forEach(f => { row[f] -= previous.buckets[f]; }); rows[previous.key] = row;
    }
    const row = { ...(rows[key] || empty(r)) };
    fields.forEach(f => { row[f] += buckets[f]; });
    if (fields.some(f => !count(row[f]))) return { ...state, overflow: true, view: incomplete(state.rows) };
    rows[key] = row;
    const view = state.overflow ? incomplete(rows) : { routes: Object.values(rows).filter(x => x.samples || x.missing) };
    return { ...state, rows, view, last: summary ? state.last : { turn: event.data.turn, step: event.data.step, key, buckets } };
  },
  wire: { viewSchema: { parse: validateView }, view: state => state.view },
};

/** Estimate only recorded MiMo model tokens; never treat the account balance delta as conversation spend. */
export function quoteUsage(view, providerIds, currency) {
  const unavailable = { text: '—', partial: true };
  if (!RATES[currency]) return unavailable;
  try { validateView(view); } catch { return unavailable; }
  const ids = new Set(providerIds); let numerator = 0n, partial = false, known = false;
  for (const row of view.routes) {
    if (!row.provider) { partial = true; continue; }
    if (!ids.has(row.provider)) continue;
    const rates = RATES[currency][MODEL_RATE[row.model]];
    if (!rates || row.cacheWrite > 0) { partial = true; continue; }
    if (row.missing) partial = true;
    if (!row.samples) continue;
    known = true;
    numerator += BigInt(row.input) * BigInt(rates[0]) + BigInt(row.cacheRead) * BigInt(rates[1]) + BigInt(row.output) * BigInt(rates[2]);
  }
  if (partial && !known) return unavailable;
  const symbol = currency === 'CNY' ? '¥' : 'US$';
  const units = (numerator + 500000n) / 1000000n; // Rounded to 4 currency decimals, never floating point.
  const whole = units / 10000n, decimals = (units % 10000n).toString().padStart(4, '0');
  const amount = decimals.endsWith('00') ? decimals.slice(0, 2) : decimals;
  const text = numerator > 0n && units === 0n ? '<' + symbol + '0.0001' : symbol + whole + '.' + amount;
  return { text: text + (partial ? '（部分）' : ''), partial };
}
