/** Console session lifecycle is local/authenticated and never returns credential values. */
function loopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
export function requestRejection(ctx, req) {
  if (!loopback(req.socket?.remoteAddress) || req.headers['x-dsh-ai-balance-request'] !== '1'
    || req.headers['sec-fetch-site'] === 'cross-site') return 403;
  try {
    const host = new URL('http://' + req.headers.host).hostname;
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return 403;
    if (typeof ctx.connection?.requestRejection !== 'function') return 503;
    const code = ctx.connection.requestRejection(req);
    return code === undefined ? undefined : code === 401 ? 401 : 403;
  } catch { return 403; }
}

export function makeHandler({ ctx, registry }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const deny = requestRejection(ctx, req);
    if (deny !== undefined) { res.writeHead(deny); res.end(); return; }
    const url = new URL(req.url, 'http://127.0.0.1');
    const action = url.pathname.slice('/dsh-ai-balance/'.length);
    const method = action === 'state' ? 'GET' : ['refresh', 'login', 'logout'].includes(action) ? 'POST' : null;
    if (!method) { res.writeHead(404); res.end(); return; }
    if (req.method !== method) { res.setHeader('Allow', method); res.writeHead(405); res.end(); return; }
    try {
      const provider = url.searchParams.get('provider');
      if (action === 'state' && !provider) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ providers: registry.list() })); return;
      }
      const entry = registry.get(provider);
      if (!entry || ['login', 'logout'].includes(action) && !['mimo', 'mimo-plan'].includes(entry.provider.kind)) { res.writeHead(400); res.end(); return; }
      await entry.service.readState();
      if (action === 'refresh') await entry.service.refresh({ force: url.searchParams.get('force') === '1' });
      if (action === 'login') await registry.startLogin(entry);
      if (action === 'logout') await registry.logout(entry);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(registry.snapshot(entry)));
    } catch { res.writeHead(503); res.end(); }
  };
}
