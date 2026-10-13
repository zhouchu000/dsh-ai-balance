import { balanceError, queryBalance } from './api.js';
const ENDPOINTS = {
  'kimi-plan': 'https://api.kimi.com/coding/v1/usages',
  'kimi-plan-intl': 'https://api.kimi.ai/coding/v1/usages',
  'glm-plan': 'https://open.bigmodel.cn/api/monitor/usage/quota/limit',
  'glm-plan-intl': 'https://api.z.ai/api/monitor/usage/quota/limit',
  'mimo-plan': 'https://platform.xiaomimimo.com/api/v1/tokenPlan/usage',
  deepseek: 'https://api.deepseek.com/user/balance',
  'kimi-cn': 'https://api.moonshot.cn/v1/users/me/balance',
  'kimi-intl': 'https://api.moonshot.ai/v1/users/me/balance',
  glm: 'https://bigmodel.cn/api/biz/account/query-customer-account-report',
};
/** Normalize a bounded decimal exactly, including the host account service's exponent notation. */
export function decimal(value) {
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw balanceError('unreadable'); value = String(value); }
  if (typeof value !== 'string' || value.length > 80) throw balanceError('unreadable');
  const match = /^(-?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d{1,2}))?$/.exec(value);
  if (!match) throw balanceError('unreadable');
  let digits = match[2] + (match[3] || ''); const point = match[2].length + Number(match[4] || 0);
  if (Math.abs(point) > 32 || digits.length > 48) throw balanceError('unreadable');
  let text = point <= 0 ? '0.' + '0'.repeat(-point) + digits : point >= digits.length ? digits + '0'.repeat(point - digits.length) : digits.slice(0, point) + '.' + digits.slice(point);
  text = text.replace(/^0+(?=\d)/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return /^0(?:\.0*)?$/.test(text) ? '0' : match[1] + text;
}
function sum(a, b) {
  const [x, y] = [decimal(a), decimal(b)];
  const scale = Math.max(x.split('.')[1]?.length || 0, y.split('.')[1]?.length || 0);
  const integer = v => BigInt(v.replace('.', '') + '0'.repeat(scale - (v.split('.')[1]?.length || 0)));
  const n = integer(x) + integer(y), abs = (n < 0n ? -n : n).toString().padStart(scale + 1, '0');
  return decimal((n < 0n ? '-' : '') + (scale ? abs.slice(0, -scale) + '.' + abs.slice(-scale) : abs));
}
/** Shared wire/cache validator; no credentials, upstream messages or unrecognized fields survive. */
export function validateBalance(value) {
  if (value?.type === 'quota') {
    if (!Array.isArray(value.windows) || !value.windows.length || value.windows.length > 12) throw balanceError('unreadable');
    return { type: 'quota', windows: value.windows.map(w => {
      if (typeof w.label !== 'string' || w.label.length > 40 || !Number.isFinite(w.remainingPercent) || w.remainingPercent < 0 || w.remainingPercent > 100) throw balanceError('unreadable');
      if (w.usedPercent !== undefined && (!Number.isFinite(w.usedPercent) || w.usedPercent < 0 || Math.abs(Math.max(0, Math.round((100 - w.usedPercent) * 10) / 10) - w.remainingPercent) > 0.000001)) throw balanceError('unreadable');
      return { label: w.label, remainingPercent: w.remainingPercent,
        ...(w.usedPercent === undefined ? {} : { usedPercent: w.usedPercent }),
        ...(Number.isSafeInteger(w.resetAt) && w.resetAt > 0 ? { resetAt: w.resetAt } : {}) };
    }) };
  }
  if (!value || typeof value.currency !== 'string' || !/^[A-Z]{3,12}$/.test(value.currency)) throw balanceError('unreadable');
  const amount = v => { decimal(v); return typeof v === 'string' && !/[eE]/.test(v) ? v : decimal(v); };
  const result = { total: amount(value.total), currency: value.currency };
  for (const field of ['cash', 'gift']) if (value[field] !== undefined) result[field] = amount(value[field]);
  if (value.accounts !== undefined) {
    if (!Array.isArray(value.accounts) || value.accounts.length < 1 || value.accounts.length > 8) throw balanceError('unreadable');
    result.accounts = value.accounts.map(x => validateBalance({ total: x.total, currency: x.currency, cash: x.cash, gift: x.gift }));
    if (new Set(result.accounts.map(x => x.currency)).size !== result.accounts.length) throw balanceError('unreadable');
  }
  return result;
}
const group = rows => { if (!rows.length) throw balanceError('unreadable'); return validateBalance({ ...rows[0], ...(rows.length > 1 ? { accounts: rows } : {}) }); };
export function parseProviderBalance(kind, body) {
  const remaining = used => {
    if (typeof used !== 'number' || !Number.isFinite(used) || used < 0) throw balanceError('unreadable');
    const usedPercent = Math.round(used * 10) / 10;
    return { remainingPercent: Math.max(0, Math.round((100 - usedPercent) * 10) / 10), usedPercent };
  };
  const ratio = value => { if (typeof value !== 'number') throw balanceError('unreadable'); return remaining(value * 100); };
  const reset = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : undefined;
  if (kind === 'kimi-plan' || kind === 'kimi-plan-intl') {
    const labels = { limit_5h: '5小时', limit_7d: '7天', limit_month_total: '月度', limit_month_code: '编程月度' };
    return validateBalance({ type: 'quota', windows: Object.entries(labels).filter(([key]) => body?.usages?.[key] !== undefined)
      .map(([key, label]) => ({ label, ...ratio(body.usages[key].used_ratio), resetAt: reset(body.usages[key].reset_time) })) });
  }
  if (kind === 'glm-plan' || kind === 'glm-plan-intl') {
    if (body?.code !== 200 || body.success !== true || !Array.isArray(body.data?.limits)) throw balanceError('unreadable');
    return validateBalance({ type: 'quota', windows: body.data.limits.filter(x => ['TOKENS_LIMIT', 'TIME_LIMIT'].includes(x.type))
      .map(x => ({ label: x.type === 'TOKENS_LIMIT' ? '5小时' : 'MCP', ...remaining(x.percentage) })) });
  }
  if (kind === 'mimo-plan') {
    if (body?.code !== 0 || !Array.isArray(body.data?.usage?.items)) throw balanceError('unreadable');
    return validateBalance({ type: 'quota', windows: body.data.usage.items.filter(x => x.limit !== 0)
      .map(x => ({ label: x.name === 'compensation_total_token' ? '补偿额度' : '套餐额度', ...ratio(x.percent) })) });
  }
  if (kind === 'deepseek') {
    if (typeof body?.is_available !== 'boolean' || !Array.isArray(body.balance_infos)) throw balanceError('unreadable');
    return group(body.balance_infos.map(x => ({ total: x.total_balance, currency: x.currency, cash: x.topped_up_balance, gift: x.granted_balance })));
  }
  if (kind === 'kimi-cn' || kind === 'kimi-intl') {
    if (body?.code !== 0 || body.status !== true) throw balanceError('unreadable');
    return validateBalance({ total: body.data?.available_balance, currency: kind === 'kimi-cn' ? 'CNY' : 'USD', cash: body.data?.cash_balance, gift: body.data?.voucher_balance });
  }
  if (kind === 'glm') {
    if (body?.code !== 200 || body.success !== true) throw balanceError('unreadable');
    return validateBalance({ total: body.data?.availableBalance, currency: 'CNY' });
  }
  throw balanceError('unreadable');
}
export function parseAccountBalance(body) {
  if (!body) throw balanceError('needs_account');
  if (body.status !== 'ready' || !Array.isArray(body.value) || !Array.isArray(body.bonusWallets)) throw balanceError('network');
  const rows = new Map();
  for (const [items, field] of [[body.value, 'cash'], [body.bonusWallets, 'gift']]) for (const item of items) {
    const row = rows.get(item.currency) || { currency: item.currency, cash: '0', gift: '0', total: '0' };
    row[field] = sum(row[field], item.balance); row.total = sum(row.cash, row.gift); rows.set(item.currency, row);
  }
  return group([...rows.values()]);
}
export async function queryProviderBalance({ kind, apiKey, cookie, signal, fetchImpl = fetch, timeoutMs = 12_000 }) {
  if (kind === 'mimo') return queryBalance({ cookie, signal, fetchImpl, timeoutMs });
  if (!Object.hasOwn(ENDPOINTS, kind)) throw balanceError('unreadable');
  const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetchImpl(ENDPOINTS[kind], { method: 'GET', redirect: 'manual', signal: bounded,
      headers: { Accept: 'application/json', ...(kind === 'mimo-plan' ? { Cookie: cookie } : { Authorization: kind.startsWith('glm') ? apiKey : 'Bearer ' + apiKey }) } });
    if ([401, 403].includes(response.status) || response.status >= 300 && response.status < 400) {
      await response.body?.cancel(); throw balanceError(kind === 'mimo-plan' ? 'expired' : 'invalid_key');
    }
    if (!response.ok) { await response.body?.cancel(); throw balanceError('network'); }
    const reader = response.body?.getReader(); if (!reader) throw balanceError('unreadable');
    const chunks = []; let size = 0;
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length;
      if (size > 65536) { await reader.cancel(); throw balanceError('unreadable'); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
    let body; try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw balanceError('unreadable'); }
    if (kind.startsWith('glm') && [401, 403, 1001, 1002, 1003].includes(body?.code)) throw balanceError('invalid_key');
    if (kind === 'mimo-plan' && [401, 403].includes(body?.code)) throw balanceError('expired');
    return parseProviderBalance(kind, body);
  } catch (e) {
    if (['network', 'unreadable', 'invalid_key', 'expired'].includes(e?.code)) throw balanceError(e.code);
    throw balanceError(e?.name === 'TimeoutError' || bounded.reason?.name === 'TimeoutError' ? 'timeout' : 'network');
  }
}
