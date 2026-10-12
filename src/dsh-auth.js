import { createHash } from 'node:crypto';
import { balanceError } from './api.js';
import { validCookieHeader } from './console-session.js';
export const SESSION_REF = 'DSH_MIMO_CONSOLE_SESSION';

/** No plugin-owned credential store: use DSH's existing backend credential service. */
export class DshSession {
  constructor({ credentials, now = Date.now }) { this.credentials = credentials; this.now = now; }
  async save(session) {
    if (!validCookieHeader(session?.cookie) || !Number.isFinite(session.expiresAt) || session.expiresAt <= this.now()) throw balanceError('needs_login');
    try { await this.credentials.set(SESSION_REF, JSON.stringify(session)); }
    catch { throw balanceError('credential_storage_unavailable'); }
  }
  async clear() {
    try { await this.credentials.unset(SESSION_REF); }
    catch { throw balanceError('credential_storage_unavailable'); }
  }
  async load() {
    let value;
    try { value = (await this.credentials.resolve(SESSION_REF))?.value; }
    catch { throw balanceError('credential_storage_unavailable'); }
    if (!value) throw balanceError('needs_login');
    let session;
    try { session = JSON.parse(value); } catch { throw balanceError('needs_login'); }
    if (!validCookieHeader(session?.cookie)) throw balanceError('needs_login');
    if (!Number.isFinite(session.expiresAt) || session.expiresAt <= this.now()) throw balanceError('expired');
    return { cookie: session.cookie, identity: createHash('sha256').update(session.cookie).digest('hex') };
  }
}
