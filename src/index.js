import { homedir } from 'node:os';
import { join } from 'node:path';
import { BalanceRegistry } from './registry.js';
import { makeHandler } from './routes.js';
import { usageProjection } from './usage.js';

export function apply(root, config = {}) {
  if (config.providerIds !== undefined && (!Array.isArray(config.providerIds) || config.providerIds.some(id => typeof id !== 'string' || id.length < 1 || id.length > 160)))
    throw new Error('dsh-ai-balance: providerIds must contain exact Provider IDs');
  root.inject(['sessionProjections'], ctx => {
    ctx.effect(() => ctx.sessionProjections.register(usageProjection));
  });
  root.inject(['webServer', 'connection', 'settings', 'credentials'], ctx => {
    const registry = new BalanceRegistry({ credentials: ctx.credentials, describe: () => ctx.settings.describe({ redactSecrets: true }),
      account: ctx.get?.('deepseekAccount'), config, cacheRoot: join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'cache/dsh-ai-balance') });
    const handler = makeHandler({ ctx, registry });
    for (const path of ['state', 'refresh', 'login', 'logout'])
      ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-ai-balance/' + path, handler }));
    ctx.effect(() => () => registry.dispose());
  });
}
export default { apply };
