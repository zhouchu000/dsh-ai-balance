import { homedir } from 'node:os';
import { join } from 'node:path';
import { DshSession } from './dsh-auth.js';
import { BalanceService } from './balance-service.js';
import { LocalLogin } from './login.js';
import { makeHandler } from './routes.js';
import { discoverProviderIds } from './client/provider.js';
import { usageProjection } from './usage.js';

/** Backend plugin; initialization never queries Xiaomi or touches existing model credentials. */
export function apply(root, config = {}) {
  const configuredIds = config.providerIds ?? ['xiaomi'];
  if (!Array.isArray(configuredIds) || configuredIds.some(id => typeof id !== 'string' || id.length < 1 || id.length > 160)) {
    throw new Error('dsh-mimo-balance: providerIds must contain exact Provider IDs');
  }
  root.inject(['sessionProjections'], ctx => {
    ctx.effect(() => ctx.sessionProjections.register(usageProjection));
  });
  root.inject(['webServer', 'connection', 'settings', 'credentials'], ctx => {
    const auth = new DshSession({ credentials: ctx.credentials });
    const service = new BalanceService({ auth, cacheFile: join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'cache/dsh-mimo-balance/balance.json') });
    const providerIds = () => discoverProviderIds(configuredIds, ctx.settings.describe({ redactSecrets: true }));
    const login = new LocalLogin(service, auth, { options: { executablePath: config.browserExecutable } });
    const handler = makeHandler({ ctx, service, providerIds, login });
    for (const path of ['state', 'refresh', 'login', 'logout']) {
      ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-mimo-balance/' + path, handler }));
    }
    ctx.effect(() => () => { login.dispose(); service.dispose(); });
  });
}
export default { apply };
