import { createHash } from 'node:crypto';
import { balanceError } from './api.js';
export class ProviderAuth {
  constructor({ provider, credentials, account }) { this.provider = provider; this.credentials = credentials; this.account = account; }
  async load() {
    const { id, kind, credentialRef, defaultCredentialRef } = this.provider;
    if (kind === 'deepseek-account') {
      const session = await this.account?.getPlatformSession();
      if (!session?.token) throw balanceError('needs_account');
      return { identity: createHash('sha256').update(id + '\0' + session.token).digest('hex') };
    }
    let apiKey;
    try {
      if (credentialRef) apiKey = (await this.credentials.resolve(credentialRef))?.value;
      else {
        const record = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)
          ? await this.credentials.readRecord?.('llm-pi-ai/' + id) : undefined;
        if (record?.kind === 'api-key') apiKey = record.key;
        // OAuth lifecycle remains owned by Harness; use only an unexpired Kimi access token.
        if (record?.kind === 'grant') {
          const grant = record.payload;
          if (!kind.startsWith('kimi-plan') || grant?.type !== 'oauth' || !Number.isFinite(grant.expires) || grant.expires <= Date.now()) throw balanceError('invalid_key');
          apiKey = grant.access;
        }
        if (!apiKey && defaultCredentialRef) apiKey = (await this.credentials.resolve(defaultCredentialRef))?.value;
      }
    }
    catch (e) { throw balanceError(e?.code === 'invalid_key' ? 'invalid_key' : 'credential_storage_unavailable'); }
    if (typeof apiKey !== 'string' || !apiKey.trim()) throw balanceError('needs_key');
    if (apiKey.length > 8192 || /[\x00-\x20\x7f]/.test(apiKey)) throw balanceError('invalid_key');
    return { apiKey, identity: createHash('sha256').update(id + '\0' + kind + '\0' + apiKey).digest('hex') };
  }
}
