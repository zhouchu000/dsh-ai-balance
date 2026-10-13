import { BalanceController, transport } from './controller.js';
const controllerKey = p => JSON.stringify([p.id, p.kind, p.revision]);
const KINDS = new Set(['mimo', 'mimo-plan', 'deepseek', 'deepseek-account', 'kimi-cn', 'kimi-intl', 'kimi-plan', 'kimi-plan-intl', 'glm', 'glm-plan', 'glm-plan-intl']);
export class ControllerPool {
  constructor({ transport: request = transport } = {}) {
    this.request = request; this.controllers = new Map(); this.listeners = new Set(); this.state = { providers: [] }; this.disposed = false;
    this.getSnapshot = () => this.state;
    this.subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  }
  bootstrap({ reload = false } = {}) {
    if (this.disposed) return Promise.resolve();
    if (this.flight) return this.flight;
    if (this.loaded && !reload) return Promise.resolve();
    clearTimeout(this.retry);
    this.flight = this.request('state', { method: 'GET' }).then(payload => {
      if (this.disposed) return;
      const providers = Array.isArray(payload.providers) ? payload.providers.filter(p => typeof p.id === 'string' && p.id.length <= 160 && KINDS.has(p.kind) && typeof p.label === 'string' && p.label.length <= 40) : [];
      const keys = new Set(providers.map(controllerKey));
      for (const [key, controller] of this.controllers) if (!keys.has(key)) { controller.dispose(); this.controllers.delete(key); }
      this.state = { providers }; this.loaded = true; this.listeners.forEach(f => f());
    }).catch(() => { if (!this.disposed) this.retry = setTimeout(() => { void this.bootstrap(); }, 3000); })
      .finally(() => { this.flight = null; });
    return this.flight;
  }
  forProvider(id) {
    const provider = this.state.providers.find(p => p.id === id); if (!provider) return null;
    const key = controllerKey(provider);
    if (!this.controllers.has(key)) this.controllers.set(key, new BalanceController({ transport: this.request, provider, onSessionReset: (source, phase) => {
      for (const c of this.controllers.values()) if (c !== source && ['mimo', 'mimo-plan'].includes(c.provider.kind)) {
        c.resetSession(phase === 'begin');
        if (phase === 'done' && c.active.size) void c.bootstrap({ reload: true }).then(() => c.ensureFresh());
      }
    } }));
    return this.controllers.get(key);
  }
  dispose() { this.disposed = true; clearTimeout(this.retry); for (const c of this.controllers.values()) c.dispose(); this.controllers.clear(); this.listeners.clear(); }
}
