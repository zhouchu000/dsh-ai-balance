/** Console session lifecycle is local/authenticated and never returns credential values. */
function loopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
export function requestRejection(ctx, req) {
  if (!loopback(req.socket?.remoteAddress) || req.headers['x-dsh-mimo-request'] !== '1'
    || req.headers['sec-fetch-site'] === 'cross-site') return 403;
  try {
    const host = new URL('http://' + req.headers.host).hostname;
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return 403;
    if (typeof ctx.connection?.requestRejection !== 'function') return 503;
    const code = ctx.connection.requestRejection(req);
    return code === undefined ? undefined : code === 401 ? 401 : 403;
  } catch { return 403; }
}

export function makeHandler({ ctx, service, providerIds, login }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const deny = requestRejection(ctx, req);
    if (deny !== undefined) { res.writeHead(deny); res.end(); return; }
    const url = new URL(req.url, 'http://127.0.0.1');
    const action = url.pathname.slice('/dsh-mimo-balance/'.length);
    const expectedMethod = action === 'state' ? 'GET' : ['refresh', 'login', 'logout'].includes(action) ? 'POST' : null;
    if (!expectedMethod) { res.writeHead(404); res.end(); return; }
    if (req.method !== expectedMethod) { res.setHeader('Allow', expectedMethod); res.writeHead(405); res.end(); return; }
    try {
      await service.initialize();
      if (action === 'refresh') await service.refresh({ force: url.searchParams.get('force') === '1' });
      const provider = url.searchParams.get('provider');
      if (['login', 'logout'].includes(action) && (!provider || !providerIds().includes(provider))) { res.writeHead(400); res.end(); return; }
      if (action === 'login') await login.start();
      if (action === 'logout') await login.logout();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ...service.snapshot(), providerIds: providerIds() }));
    } catch {
      res.writeHead(503); res.end(); // Never forward HTTP bodies, cookies or subprocess diagnostic objects.
    }
  };
}
