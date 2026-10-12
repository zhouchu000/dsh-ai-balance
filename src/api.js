/** Validates the MiMo console response observed on 2026-10-12. No inferred fields. */
export const BALANCE_URL = 'https://platform.xiaomimimo.com/api/v1/balance';
export const REFRESH_MS = 300_000;

export function balanceError(code) {
  return Object.assign(new Error(`MiMo balance: ${code}`), { code });
}

function decimal(value) {
  return typeof value === 'string' && /^-?\d{1,16}(?:\.\d{1,8})?$/.test(value);
}

/** Only balance/currency and optional independently reported cash/gift are projected. */
export function parseBalance(body) {
  if (body?.code !== 0 || !body.data || !decimal(body.data.balance)
    || typeof body.data.currency !== 'string' || !/^[A-Z]{3,12}$/.test(body.data.currency)) throw balanceError('unreadable');
  const { balance, currency, cashBalance, giftBalance } = body.data;
  if ((cashBalance !== undefined && !decimal(cashBalance)) || (giftBalance !== undefined && !decimal(giftBalance))) throw balanceError('unreadable');
  return { total: balance, currency, ...(cashBalance === undefined ? {} : { cash: cashBalance }), ...(giftBalance === undefined ? {} : { gift: giftBalance }) };
}

/** Preserve the reported precision; unknown currency codes remain explicit. */
export function formatMoney(amount, currency) {
  return (currency === 'CNY' ? '¥' : currency === 'USD' ? 'US$' : `${currency} `) + amount;
}

/** Credentials go only to this fixed HTTPS URL, with redirects never followed. */
export async function queryBalance({ cookie, signal, fetchImpl = fetch, timeoutMs = 12_000 }) {
  const boundedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetchImpl(BALANCE_URL, { method: 'GET', redirect: 'manual', signal: boundedSignal,
      headers: { Accept: 'application/json', Cookie: cookie } });
    if (response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel(); throw balanceError('expired');
    }
    if (!response.ok) { await response.body?.cancel(); throw balanceError('network'); }
    // Bound untrusted response size and do not forward its message/loginUrl/raw text.
    const reader = response.body?.getReader();
    if (!reader) throw balanceError('unreadable');
    let size = 0; const chunks = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65_536) { await reader.cancel(); throw balanceError('unreadable'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let body;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw balanceError('unreadable'); }
    if (body?.code === 401 || body?.code === 403) throw balanceError('expired');
    return parseBalance(body);
  } catch (error) {
    if (['expired', 'network', 'unreadable'].includes(error?.code)) throw balanceError(error.code);
    throw balanceError(error?.name === 'TimeoutError' || boundedSignal.reason?.name === 'TimeoutError' ? 'timeout' : 'network');
  }
}
