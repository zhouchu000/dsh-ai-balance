/** Public real-time token prices. Amounts are 1/10000 currency unit per million tokens. */
export const PRICE_CHECKED_AT = '2026-10-14';
export const PRICE_SOURCES = {
  mimo: 'https://mimo.mi.com/docs/price',
  deepseek: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
  deepseekUSD: 'https://api-docs.deepseek.com/quick_start/pricing/',
  kimi: 'https://platform.kimi.com/docs/pricing/chat',
  kimiUSD: 'https://platform.kimi.ai/docs/pricing/chat',
  glm: 'https://docs.bigmodel.cn/cn/guide/start/pricing',
};
const MIMO = {
  CNY: { pro: [30000, 250, 60000], flash: [10000, 200, 20000], ultra: [300000, 2500, 600000] },
  USD: { pro: [4350, 36, 8700], flash: [1400, 28, 2800], ultra: [43500, 360, 87000] },
};
const MIMO_MODELS = { 'mimo-v2.6-pro': 'pro', 'mimo-v2.5-pro': 'pro', 'mimo-v2.6-flash': 'flash',
  'mimo-v2.5': 'flash', 'mimo-v2.6-pro-ultraspeed': 'ultra' };
const DEEPSEEK = {
  CNY: { flash: [20000, 400, 80000], pro: [90000, 3000, 270000] },
  USD: { flash: [3000, 60, 12000], pro: [13200, 440, 39600] },
};
const DEEPSEEK_MODELS = { 'deepseek-flash': 'flash', 'deepseek-v4-flash': 'flash',
  'deepseek-v4-flash-vision-exp': 'flash', 'deepseek-v4-pro': 'pro' };
const KIMI = {
  CNY: { 'kimi-k3': [200000, 20000, 1000000], 'kimi-k2.7-code': [65000, 13000, 270000],
    'kimi-k2.7-code-highspeed': [130000, 26000, 540000], 'kimi-k2.6': [65000, 11000, 270000] },
  USD: { 'kimi-k3': [30000, 3000, 150000], 'kimi-k2.7-code': [9500, 1900, 40000],
    'kimi-k2.6': [9500, 1600, 40000] },
};
const GLM = { 'glm-5.3': [80000, 20000, 280000], 'glm-5.2': [80000, 20000, 280000],
  'glm-5.3-flash': [8000, 2300, 28000], 'glm-5.3-flashx': [20000, 5700, 70000],
  'glm-4.7-flashx': [5000, 1000, 30000], 'glm-4.7-flash': [0, 0, 0] };
const GLM_TIERS = {
  'glm-5.1': [[60000, 13000, 240000], [80000, 20000, 280000]],
  'glm-5-turbo': [[50000, 12000, 220000], [70000, 18000, 260000]],
  'glm-5': [[40000, 10000, 180000], [60000, 15000, 220000]],
};
// State Council 2026 holiday notice: https://www.gov.cn/gongbao/2025/issue_12406/202511/content_7048922.html
const HOLIDAYS_2026 = [[101, 103], [215, 223], [404, 406], [501, 505], [619, 621], [925, 927], [1001, 1007]];
const validTime = n => Number.isSafeInteger(n) && n > 0 && n <= 8640000000000000;
function period(time, currency) {
  if (!validTime(time)) return 'unknown';
  const date = new Date(time + 8 * 3600000), day = date.getUTCDay(), hour = date.getUTCHours();
  if (day === 0 || day === 6 || !(hour >= 9 && hour < 12 || hour >= 14 && hour < 18)) return 'off';
  if (currency === 'USD') return 'peak';
  if (date.getUTCFullYear() !== 2026) return 'unknown';
  const md = (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  return HOLIDAYS_2026.some(([a, b]) => md >= a && md <= b) ? 'off' : 'peak';
}
function callPeriod(start, end, currency) {
  if (!validTime(end)) return 'unknown';
  if (!validTime(start)) return period(end, currency);
  if (start > end || end - start > 86400000) return 'unknown';
  const first = period(start, currency);
  for (let time = (Math.floor(start / 3600000) + 1) * 3600000; time <= end; time += 3600000) {
    if (period(time, currency) !== first) return 'unknown';
  }
  return period(end, currency) === first ? first : 'unknown';
}
// The published GLM table uses K without defining its base. Preserve both possible tiers at the boundary.
const tier = (value, low, high) => value < low ? 'short' : value < high ? 'boundary' : 'long';
export function usageBand(usage, start, end) {
  return [tier(usage.input + usage.cacheRead + usage.cacheWrite, 32000, 32768),
    tier(usage.output, 200, 205), callPeriod(start, end, 'CNY'), callPeriod(start, end, 'USD')].join(':');
}
export const validBand = value => typeof value === 'string' && /^(short|boundary|long):(short|boundary|long):(off|peak|unknown):(off|peak|unknown)$/.test(value);
export function pricingCurrency(kind, currency) {
  if (['mimo', 'deepseek', 'deepseek-account'].includes(kind)) return currency === undefined ? 'CNY' : ['CNY', 'USD'].includes(currency) ? currency : null;
  if (['kimi-cn', 'glm'].includes(kind)) return 'CNY';
  return kind === 'kimi-intl' ? 'USD' : null;
}
const alternatives = band => band === 'short' ? [0] : band === 'long' ? [1] : [0, 1];
/** Each option is [uncached input, cache read, output, cache write?]. Missing prices remain unknown. */
export function ratesFor(kind, model, currency, band) {
  const [inputTier, outputTier, cnyPeriod, usdPeriod] = (band || '').split(':');
  if (kind === 'mimo') {
    const rate = MIMO[currency]?.[MIMO_MODELS[model]]; return rate ? [rate] : null;
  }
  if (kind === 'deepseek' || kind === 'deepseek-account') {
    const rate = DEEPSEEK[currency]?.[DEEPSEEK_MODELS[model]];
    if (!rate) return null;
    const peak = currency === 'CNY' ? cnyPeriod : usdPeriod;
    return (peak === 'peak' ? [1] : peak === 'off' ? [0.5] : [0.5, 1]).map(scale => rate.map(n => n * scale));
  }
  if (kind === 'kimi-cn' || kind === 'kimi-intl') {
    const table = KIMI[currency];
    const rate = table && Object.hasOwn(table, model) ? table[model] : null; if (!rate) return null;
    // Harness retains aggregate cache-write tokens, but not the 5m/1h TTL split.
    return model === 'kimi-k3' ? [[...rate, rate[0]], [...rate, rate[0] * 2]] : [rate];
  }
  if (kind === 'glm' && currency === 'CNY') {
    if (Object.hasOwn(GLM, model)) return [GLM[model]];
    if (Object.hasOwn(GLM_TIERS, model)) return alternatives(inputTier).map(i => GLM_TIERS[model][i]);
    if (model === 'glm-4.7') return alternatives(inputTier).flatMap(i => i ? [[40000, 8000, 160000]]
      : alternatives(outputTier).map(o => o ? [30000, 6000, 140000] : [20000, 4000, 80000]));
  }
  return null;
}
