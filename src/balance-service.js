import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { queryBalance, REFRESH_MS } from './api.js';
import { validateBalance } from './provider-api.js';

const SAFE_CODES = new Set(['needs_login', 'expired', 'network', 'timeout', 'unreadable', 'credential_storage_unavailable', 'browser_unavailable', 'needs_key', 'invalid_key', 'needs_account']);

/** Shared backend request/cache owner. Automatic scheduling stays with selected client models. */
export class BalanceService {
  constructor({ auth, query = queryBalance, cacheFile, now = Date.now }) {
    this.auth = auth; this.query = query; this.cacheFile = cacheFile; this.now = now;
    this.balance = null; this.updatedAt = null; this.identity = null;
    this.status = 'idle'; this.lastAttemptAt = null; this.inFlight = null; this.loginPending = false;
    this.initialized = null; this.disposed = false;
    this.sessionEpoch = 0; this.sessionBusy = false; this.cacheWrites = Promise.resolve();
  }

  initialize() {
    if (!this.initialized) this.initialized = this.loadCache();
    return this.initialized;
  }

  async loadCache() {
    if (!this.cacheFile) return;
    const epoch = this.sessionEpoch;
    try {
      const cache = JSON.parse(await readFile(this.cacheFile, 'utf8'));
      if (cache.version !== 1 || !Number.isSafeInteger(cache.updatedAt) || cache.updatedAt <= 0
        || cache.updatedAt > this.now() || typeof cache.identity !== 'string') return;
      const balance = validateBalance(cache.balance);
      let session;
      try { session = await this.auth.load(); }
      catch (error) { if (epoch === this.sessionEpoch) this.status = SAFE_CODES.has(error?.code) ? error.code : 'credential_storage_unavailable'; return; }
      if (epoch !== this.sessionEpoch || this.sessionBusy) return;
      if (session?.identity !== cache.identity) { await this.invalidateCache(); return; }
      this.balance = balance; this.identity = cache.identity; this.updatedAt = cache.updatedAt;
      this.lastAttemptAt = cache.updatedAt; this.status = 'ready';
    } catch { /* A missing or invalid cache never becomes a reported balance. */ }
  }

  snapshot() {
    return { status: this.status, balance: this.balance ? { ...this.balance } : null, updatedAt: this.updatedAt,
      lastAttemptAt: this.lastAttemptAt, nextRefreshAt: this.lastAttemptAt === null ? null : this.lastAttemptAt + REFRESH_MS,
      refreshing: this.inFlight !== null, loginPending: this.loginPending, sessionBusy: this.sessionBusy,
      stale: this.balance !== null && (this.status !== 'ready' || this.now() - this.updatedAt >= REFRESH_MS) };
  }

  refresh({ force = false } = {}) {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.performRefresh(force).finally(() => { this.inFlight = null; }).then(() => this.snapshot());
    return this.inFlight;
  }

  async checkIdentity() {
    const session = await this.auth.load();
    if (this.identity !== null && this.identity !== session.identity) {
      this.sessionEpoch++; this.abort?.abort();
      this.balance = null; this.updatedAt = null; this.lastAttemptAt = null; this.status = 'idle';
      await this.invalidateCache();
    }
    this.identity = session.identity;
    return session;
  }

  async readState() {
    await this.initialize();
    if (!this.sessionBusy) try { await this.checkIdentity(); }
    catch (e) {
      this.status = SAFE_CODES.has(e?.code) ? e.code : 'credential_storage_unavailable';
      if (['needs_key', 'needs_account'].includes(this.status)) {
        this.sessionEpoch++; this.abort?.abort(); this.balance = null; this.updatedAt = null;
        this.identity = null; this.lastAttemptAt = null; await this.invalidateCache();
      }
    }
    return this.snapshot();
  }

  async performRefresh(force) {
    await this.initialize();
    if (this.disposed || this.sessionBusy) return;
    let epoch = this.sessionEpoch;
    try {
      const session = await this.checkIdentity();
      epoch = this.sessionEpoch;
      if (this.disposed || this.sessionBusy || (!force && this.lastAttemptAt !== null && this.now() - this.lastAttemptAt < REFRESH_MS)) return;
      this.lastAttemptAt = this.now(); this.abort = new AbortController();
      const fresh = await this.query({ ...session, signal: this.abort.signal });
      if (this.disposed || epoch !== this.sessionEpoch || this.sessionBusy) return;
      // A credential may be changed in Settings while the network request is pending.
      const current = await this.checkIdentity();
      if (this.disposed || epoch !== this.sessionEpoch || current.identity !== session.identity || this.sessionBusy) return;
      this.balance = validateBalance(fresh); this.updatedAt = this.now(); this.status = 'ready';
      await this.saveCache();
    } catch (error) {
      if (!this.disposed && epoch === this.sessionEpoch && !this.sessionBusy) {
        this.status = SAFE_CODES.has(error?.code) ? error.code : 'network';
        this.lastAttemptAt = this.now();
      }
    }
  }

  async saveCache() {
    if (!this.cacheFile) return;
    const epoch = this.sessionEpoch;
    const value = JSON.stringify({ version: 1, balance: this.balance, updatedAt: this.updatedAt, identity: this.identity });
    this.cacheWrites = this.cacheWrites.then(async () => {
      if (epoch !== this.sessionEpoch || this.sessionBusy) return;
      await mkdir(dirname(this.cacheFile), { recursive: true, mode: 0o700 });
      const temp = `${this.cacheFile}.${process.pid}.tmp`;
      await writeFile(temp, value, { mode: 0o600 });
      if (epoch !== this.sessionEpoch || this.sessionBusy) { await unlink(temp).catch(() => {}); return; }
      await rename(temp, this.cacheFile);
    }).catch(() => { /* Persistence failure leaves the successful in-memory balance available. */ });
    await this.cacheWrites;
  }

  async invalidateCache() {
    if (this.cacheFile) {
      this.cacheWrites = this.cacheWrites.then(() => unlink(this.cacheFile)).catch(() => {});
      await this.cacheWrites;
    }
  }

  beginSessionReset() {
    this.sessionEpoch++; this.sessionBusy = true; this.abort?.abort();
    this.balance = null; this.updatedAt = null; this.identity = null;
    this.status = 'needs_login'; this.lastAttemptAt = this.now();
  }

  dispose() { this.disposed = true; this.abort?.abort(); }
}
