const NAMES = new Set(['api-platform_serviceToken', 'api-platform_ph', 'api-platform_slh', 'userId']);
export function validCookieHeader(cookie) {
  return typeof cookie === 'string' && cookie.length < 32768 && cookie.split('; ').every(pair => {
    const at = pair.indexOf('=');
    return at > 0 && NAMES.has(pair.slice(0, at)) && /^[\x21-\x3A\x3C-\x7E]+$/.test(pair.slice(at + 1));
  }) && cookie.split('; ').some(x => x.startsWith('api-platform_serviceToken='))
    && cookie.split('; ').some(x => x.startsWith('userId='));
}

/** Same official-domain cookies as the verified console request; independent of OS/browser. */
export function consoleSession(cookies, now = Date.now()) {
  const selected = cookies.filter(c => {
    const domain = c.domain.replace(/^\./, '').toLowerCase(); const path = c.path;
    return ['platform.xiaomimimo.com', 'xiaomimimo.com'].includes(domain) && NAMES.has(c.name)
      && (path === '/' || path === '/api/v1/balance' || '/api/v1/balance'.startsWith(path.endsWith('/') ? path : path + '/'))
      && (c.expires === -1 || Number.isFinite(c.expires) && c.expires * 1000 > now);
  }).sort((a, b) => b.path.length - a.path.length || a.name.localeCompare(b.name) || a.domain.localeCompare(b.domain));
  const cookie = selected.map(c => `${c.name}=${c.value}`).join('; ');
  if (!validCookieHeader(cookie)) return null;
  const expiries = selected.filter(c => c.expires !== -1).map(c => c.expires * 1000);
  return { cookie, expiresAt: expiries.length ? Math.min(...expiries) : now + 86400000 };
}
