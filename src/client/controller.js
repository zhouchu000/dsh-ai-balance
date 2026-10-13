import { REFRESH_MS } from '../api.js';
import { validateBalance } from '../provider-api.js';

export async function transport(path, { method = 'GET' } = {}) {
  const response = await fetch('/dsh-ai-balance/' + path, { method, cache: 'no-store', credentials: 'same-origin',
    signal: AbortSignal.timeout(20_000), headers: { 'X-DSH-AI-Balance-Request': '1', Accept: 'application/json' } });
  if (!response.ok) throw new Error('local backend unavailable');
  return response.json();
}

/** One controller for all composer instances; local state reads never contact Xiaomi. */
export class BalanceController {
  constructor({ transport: request = transport, now = Date.now, provider, onSessionReset } = {}) {
    this.provider = provider; this.onSessionReset = onSessionReset;
    this.request = (path, options) => {
      if (provider && !new URL('http://local/' + path).searchParams.has('provider')) path += (path.includes('?') ? '&' : '?') + 'provider=' + encodeURIComponent(provider.id);
      return request(path, options);
    }; this.now = now; this.listeners = new Set(); this.active = new Set(); this.disposed = false;
    this.bootstrapAttempts = 0;
    this.epoch = 0;
    this.state = { status: 'idle', balance: null, updatedAt: null, lastAttemptAt: null, nextRefreshAt: null,
      provider, stale: false, refreshing: false, loginPending: false, sessionBusy: false, providerIds: [] };
    this.getSnapshot = () => this.state;
    this.subscribe = callback => { this.listeners.add(callback); return () => this.listeners.delete(callback); };
  }
  publish(patch) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch }; this.listeners.forEach(callback => callback());
  }
  accept(payload, epoch = this.epoch) {
    if (epoch !== this.epoch) return;
    let balance = null;
    if (payload.balance) balance = validateBalance(payload.balance);
    const codes = ['idle', 'ready', 'needs_login', 'expired', 'network', 'timeout', 'unreadable', 'credential_storage_unavailable', 'browser_unavailable', 'needs_key', 'invalid_key', 'needs_account'];
    const timestamp = value => Number.isSafeInteger(value) && value > 0 ? value : null;
    if (this.provider && payload.provider?.id !== this.provider.id) throw new Error('provider mismatch');
    this.publish({ provider: this.provider ? { ...this.provider, kind: payload.provider.kind, label: payload.provider.label } : payload.provider, status: codes.includes(payload.status) ? payload.status : 'network', balance,
      updatedAt: balance ? timestamp(payload.updatedAt) : null, lastAttemptAt: timestamp(payload.lastAttemptAt),
      nextRefreshAt: timestamp(payload.nextRefreshAt), stale: Boolean(payload.stale), refreshing: Boolean(payload.refreshing),
      loginPending: Boolean(payload.loginPending), sessionBusy: Boolean(payload.sessionBusy), providerIds: Array.isArray(payload.providerIds)
        ? payload.providerIds.filter(id => typeof id === 'string') : this.state.providerIds });
  }
  bootstrap({ reload = false } = {}) {
    if (reload && !this.stateFlight) this.initial = null;
    if (!this.initial && !this.disposed) {
      clearTimeout(this.bootstrapTimer);
      const epoch = this.epoch;
      this.stateFlight = true;
      this.initial = this.request('state', { method: 'GET' }).then(payload => {
        this.accept(payload, epoch); this.bootstrapAttempts = 0;
      }).catch(() => {
        if (epoch !== this.epoch) return;
        this.initial = null; this.publish({ status: 'network' });
        if (!this.disposed) this.bootstrapTimer = setTimeout(() => { void this.bootstrap(); }, Math.min(5000, 300 * 3 ** this.bootstrapAttempts++));
      }).finally(() => { this.stateFlight = false; });
    }
    return this.initial;
  }
  activate(token) {
    const reload = !this.active.size;
    this.active.add(token);
    void this.bootstrap({ reload }).then(() => {
      if (!this.active.size) return;
      if (this.state.loginPending) this.pollLogin();
      void this.ensureFresh();
    });
  }
  deactivate(token) {
    this.active.delete(token);
    if (!this.active.size) { clearTimeout(this.timer); clearTimeout(this.loginTimer); }
  }
  async ensureFresh() {
    await this.bootstrap();
    if (!this.initial || !this.active.size || this.disposed) return;
    if (this.state.sessionBusy) {
      clearTimeout(this.timer);
      this.timer = setTimeout(async () => { await this.bootstrap({ reload: true }); void this.ensureFresh(); }, 1000);
      return;
    }
    if (this.state.nextRefreshAt !== null && this.state.nextRefreshAt > this.now()) { this.schedule(); return; }
    return this.refresh();
  }
  refresh({ force = false } = {}) {
    if (this.inFlight) return this.inFlight;
    const epoch = this.epoch;
    this.inFlight = this.bootstrap().then(async () => {
      if (this.disposed || epoch !== this.epoch || this.state.sessionBusy) return;
      this.publish({ refreshing: true });
      try { this.accept(await this.request(force ? 'refresh?force=1' : 'refresh', { method: 'POST' }), epoch); }
      catch { if (epoch === this.epoch) this.publish({ status: 'network', stale: this.state.balance !== null,
        lastAttemptAt: this.now(), nextRefreshAt: this.now() + REFRESH_MS }); }
    }).finally(() => { this.inFlight = null; this.publish({ refreshing: false }); this.schedule(); });
    return this.inFlight;
  }
  schedule() {
    clearTimeout(this.timer);
    if (!this.active.size || this.disposed) return;
    const delay = Math.max(1, (this.state.nextRefreshAt ?? (this.now() + REFRESH_MS)) - this.now());
    this.timer = setTimeout(() => { void this.ensureFresh(); }, delay);
  }
  login(provider) {
    if (this.logoutFlight || this.state.sessionBusy) return Promise.resolve();
    if (this.loginFlight) return this.loginFlight;
    if (this.state.loginPending) return Promise.resolve();
    this.publish({ loginPending: true });
    const epoch = this.epoch;
    const path = provider ? 'login?provider=' + encodeURIComponent(provider) : 'login';
    this.loginFlight = this.request(path, { method: 'POST' }).then(payload => { this.accept(payload, epoch); this.pollLogin(); })
      .catch(() => { if (epoch === this.epoch) this.publish({ status: 'credential_storage_unavailable', loginPending: false }); })
      .finally(() => { this.loginFlight = null; });
    return this.loginFlight;
  }
  pollLogin() {
    clearTimeout(this.loginTimer);
    if (!this.active.size || this.disposed || !this.state.loginPending) return;
    this.loginTimer = setTimeout(async () => {
      const epoch = this.epoch;
      try { this.accept(await this.request('state', { method: 'GET' }), epoch); } catch { if (epoch === this.epoch) this.publish({ status: 'network' }); }
      this.pollLogin(); this.schedule();
    }, 1000);
  }
  logout(provider) {
    if (this.logoutFlight) return this.logoutFlight;
    this.onSessionReset?.(this, 'begin');
    const pendingLogin = this.loginFlight, epoch = ++this.epoch;
    clearTimeout(this.loginTimer);
    this.publish({ balance: null, updatedAt: null, stale: false, status: 'needs_login', loginPending: false, sessionBusy: true });
    this.logoutFlight = (async () => {
      await pendingLogin?.catch(() => {});
      try { this.accept(await this.request('logout?provider=' + encodeURIComponent(provider), { method: 'POST' }), epoch); }
      catch { this.publish({ status: 'credential_storage_unavailable' }); }
    })().finally(() => { this.logoutFlight = null; this.publish({ sessionBusy: false }); this.onSessionReset?.(this, 'done'); this.schedule(); });
    return this.logoutFlight;
  }
  resetSession(busy = false) {
    this.epoch++; this.initial = null; clearTimeout(this.timer); clearTimeout(this.loginTimer);
    this.publish({ balance: null, updatedAt: null, lastAttemptAt: null, nextRefreshAt: null, status: 'needs_login', stale: false, loginPending: false, refreshing: false, sessionBusy: busy });
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); clearTimeout(this.loginTimer); clearTimeout(this.bootstrapTimer); this.active.clear(); this.listeners.clear(); }
}
