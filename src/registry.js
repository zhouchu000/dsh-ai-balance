import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { BalanceService } from './balance-service.js';
import { DshSession } from './dsh-auth.js';
import { ProviderAuth } from './provider-auth.js';
import { discoverProviders, publicProvider } from './providers.js';
import { queryProviderBalance, parseAccountBalance } from './provider-api.js';
import { LocalLogin } from './login.js';
import { balanceError } from './api.js';
const consoleKind = kind => kind === 'mimo' || kind === 'mimo-plan';

export class BalanceRegistry {
  constructor({ credentials, describe, account, cacheRoot, config = {}, query = queryProviderBalance }) {
    Object.assign(this, { credentials, describe, account, cacheRoot, config, query });
    this.entries = new Map(); this.auth = new DshSession({ credentials }); this.login = null;
  }
  providers() { return discoverProviders(this.describe(), { providerIds: this.config.providerIds, accountAvailable: Boolean(this.account) }); }
  list() { return this.providers().map(publicProvider); }
  get(id) {
    const provider = this.providers().find(p => p.id === id);
    if (!provider) return null;
    const signature = JSON.stringify(provider);
    const existing = this.entries.get(id);
    if (existing?.signature === signature) return existing;
    existing?.service.dispose();
    const auth = consoleKind(provider.kind) ? this.auth : new ProviderAuth({ provider, credentials: this.credentials, account: this.account });
    const cacheFile = this.cacheRoot ? join(this.cacheRoot, createHash('sha256').update(signature).digest('hex') + '.json') : undefined;
    const query = async session => {
      if (provider.kind !== 'deepseek-account') return this.query({ ...session, kind: provider.kind });
      let timer;
      try {
        const value = await Promise.race([this.account.getBalance({ version: process.env.DSH_VERSION || '0.2.0-rc.2', locale: 'zh-CN', timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60 }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(balanceError('timeout')), 12_000); })]);
        return parseAccountBalance(value);
      } finally { clearTimeout(timer); }
    };
    const service = new BalanceService({ auth, query, cacheFile });
    const entry = { signature, provider: publicProvider(provider), service };
    this.entries.set(id, entry);
    return entry;
  }
  snapshot(entry) {
    return { ...entry.service.snapshot(), provider: entry.provider,
      ...(consoleKind(entry.provider.kind) && this.login ? { loginPending: Boolean(this.login.starting), sessionBusy: Boolean(this.login.signingOut) } : {}) };
  }
  async startLogin(entry) {
    if (!consoleKind(entry.provider.kind)) throw balanceError('needs_key');
    if (this.login?.starting || this.login?.signingOut) return;
    this.login?.dispose();
    this.login = new LocalLogin(entry.service, this.auth, { options: { executablePath: this.config.browserExecutable } });
    await this.login.start();
  }
  async logout(entry) {
    if (!consoleKind(entry.provider.kind)) throw balanceError('needs_key');
    const entries = [...this.entries.values()].filter(e => consoleKind(e.provider.kind));
    for (const e of entries) e.service.beginSessionReset();
    this.login ??= new LocalLogin(entry.service, this.auth);
    try {
      await this.login.logout();
      await Promise.all(entries.map(e => e.service.invalidateCache()));
    } finally {
      for (const e of entries) { e.service.sessionBusy = false; e.service.status = this.login.service.status; }
    }
  }
  dispose() { this.login?.dispose(); for (const entry of this.entries.values()) entry.service.dispose(); this.entries.clear(); }
}
