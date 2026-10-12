import { runBrowserLogin } from './browser-login.js';

/** Shared asynchronous local login, for Desktop and the locally hosted Web UI. */
export class LocalLogin {
  constructor(service, auth, { run = runBrowserLogin, options = {} } = {}) {
    Object.assign(this, { service, auth, run, options }); this.disposed = false;
  }
  start() {
    if (this.starting || this.disposed || this.signingOut) return Promise.resolve();
    this.previousStatus = this.service.status; this.service.loginPending = true; this.abort = new AbortController();
    this.starting = this.performStart().finally(() => { this.starting = null; this.service.loginPending = false; });
    return Promise.resolve();
  }
  async performStart() {
    try {
      await this.run({ auth: this.auth, signal: this.abort.signal, options: this.options,
        onBrowser: browser => { this.browser = browser; if (this.disposed) void browser.close(); } });
      if (this.disposed || this.signingOut) return;
      await this.service.inFlight; await this.service.refresh({ force: true });
    } catch (e) {
      if (!this.disposed && !this.signingOut) this.service.status = e?.code === 'login_cancelled' && this.previousStatus === 'ready' ? 'ready'
        : ['browser_unavailable', 'credential_storage_unavailable'].includes(e?.code) ? e.code : 'needs_login';
    } finally { this.browser = null; }
  }
  logout() {
    if (this.logoutFlight) return this.logoutFlight;
    this.signingOut = true; this.abort?.abort(); this.service.beginSessionReset();
    this.logoutFlight = (async () => {
      try {
        await this.browser?.close().catch(() => {}); await this.starting;
        await this.auth.clear(); await this.service.invalidateCache();
        this.service.status = 'needs_login';
      } catch { this.service.status = 'credential_storage_unavailable'; }
    })().finally(() => { this.signingOut = false; this.logoutFlight = null; this.service.sessionBusy = false; });
    return this.logoutFlight;
  }
  dispose() { this.disposed = true; this.abort?.abort(); void this.browser?.close(); this.service.loginPending = false; }
}
