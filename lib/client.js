window.__ModuleLoader__.load({id:"dsh-ai-balance",factory:function(require){var module={exports:{}};var exports=module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  ProviderContribution: () => ProviderContribution,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react3 = __toESM(require("react"), 1);

// src/api.js
var REFRESH_MS = 3e5;
function balanceError(code) {
  return Object.assign(new Error(`MiMo balance: ${code}`), { code });
}
function formatMoney(amount, currency) {
  return (currency === "CNY" ? "\xA5" : currency === "USD" ? "US$" : `${currency} `) + amount;
}

// src/provider-api.js
function decimal(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw balanceError("unreadable");
    value = String(value);
  }
  if (typeof value !== "string" || value.length > 80) throw balanceError("unreadable");
  const match = /^(-?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d{1,2}))?$/.exec(value);
  if (!match) throw balanceError("unreadable");
  let digits = match[2] + (match[3] || "");
  const point = match[2].length + Number(match[4] || 0);
  if (Math.abs(point) > 32 || digits.length > 48) throw balanceError("unreadable");
  let text = point <= 0 ? "0." + "0".repeat(-point) + digits : point >= digits.length ? digits + "0".repeat(point - digits.length) : digits.slice(0, point) + "." + digits.slice(point);
  text = text.replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return /^0(?:\.0*)?$/.test(text) ? "0" : match[1] + text;
}
function validateBalance(value) {
  if (value?.type === "quota") {
    if (!Array.isArray(value.windows) || !value.windows.length || value.windows.length > 12) throw balanceError("unreadable");
    return { type: "quota", windows: value.windows.map((w) => {
      if (typeof w.label !== "string" || w.label.length > 40 || !Number.isFinite(w.remainingPercent) || w.remainingPercent < 0 || w.remainingPercent > 100) throw balanceError("unreadable");
      return {
        label: w.label,
        remainingPercent: w.remainingPercent,
        ...Number.isSafeInteger(w.resetAt) && w.resetAt > 0 ? { resetAt: w.resetAt } : {}
      };
    }) };
  }
  if (!value || typeof value.currency !== "string" || !/^[A-Z]{3,12}$/.test(value.currency)) throw balanceError("unreadable");
  const amount = (v) => {
    decimal(v);
    return typeof v === "string" && !/[eE]/.test(v) ? v : decimal(v);
  };
  const result = { total: amount(value.total), currency: value.currency };
  for (const field of ["cash", "gift"]) if (value[field] !== void 0) result[field] = amount(value[field]);
  if (value.accounts !== void 0) {
    if (!Array.isArray(value.accounts) || value.accounts.length < 1 || value.accounts.length > 8) throw balanceError("unreadable");
    result.accounts = value.accounts.map((x) => validateBalance({ total: x.total, currency: x.currency, cash: x.cash, gift: x.gift }));
    if (new Set(result.accounts.map((x) => x.currency)).size !== result.accounts.length) throw balanceError("unreadable");
  }
  return result;
}

// src/client/controller.js
async function transport(path, { method = "GET" } = {}) {
  const response = await fetch("/dsh-ai-balance/" + path, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    signal: AbortSignal.timeout(2e4),
    headers: { "X-DSH-AI-Balance-Request": "1", Accept: "application/json" }
  });
  if (!response.ok) throw new Error("local backend unavailable");
  return response.json();
}
var BalanceController = class {
  constructor({ transport: request = transport, now = Date.now, provider, onSessionReset } = {}) {
    this.provider = provider;
    this.onSessionReset = onSessionReset;
    this.request = (path, options) => {
      if (provider && !new URL("http://local/" + path).searchParams.has("provider")) path += (path.includes("?") ? "&" : "?") + "provider=" + encodeURIComponent(provider.id);
      return request(path, options);
    };
    this.now = now;
    this.listeners = /* @__PURE__ */ new Set();
    this.active = /* @__PURE__ */ new Set();
    this.disposed = false;
    this.bootstrapAttempts = 0;
    this.epoch = 0;
    this.state = {
      status: "idle",
      balance: null,
      updatedAt: null,
      lastAttemptAt: null,
      nextRefreshAt: null,
      provider,
      stale: false,
      refreshing: false,
      loginPending: false,
      sessionBusy: false,
      providerIds: []
    };
    this.getSnapshot = () => this.state;
    this.subscribe = (callback) => {
      this.listeners.add(callback);
      return () => this.listeners.delete(callback);
    };
  }
  publish(patch) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((callback) => callback());
  }
  accept(payload, epoch = this.epoch) {
    if (epoch !== this.epoch) return;
    let balance = null;
    if (payload.balance) balance = validateBalance(payload.balance);
    const codes = ["idle", "ready", "needs_login", "expired", "network", "timeout", "unreadable", "credential_storage_unavailable", "browser_unavailable", "needs_key", "invalid_key", "needs_account"];
    const timestamp = (value) => Number.isSafeInteger(value) && value > 0 ? value : null;
    if (this.provider && payload.provider?.id !== this.provider.id) throw new Error("provider mismatch");
    this.publish({
      provider: this.provider ? { ...this.provider, kind: payload.provider.kind, label: payload.provider.label } : payload.provider,
      status: codes.includes(payload.status) ? payload.status : "network",
      balance,
      updatedAt: balance ? timestamp(payload.updatedAt) : null,
      lastAttemptAt: timestamp(payload.lastAttemptAt),
      nextRefreshAt: timestamp(payload.nextRefreshAt),
      stale: Boolean(payload.stale),
      refreshing: Boolean(payload.refreshing),
      loginPending: Boolean(payload.loginPending),
      sessionBusy: Boolean(payload.sessionBusy),
      providerIds: Array.isArray(payload.providerIds) ? payload.providerIds.filter((id) => typeof id === "string") : this.state.providerIds
    });
  }
  bootstrap({ reload = false } = {}) {
    if (reload && !this.stateFlight) this.initial = null;
    if (!this.initial && !this.disposed) {
      clearTimeout(this.bootstrapTimer);
      const epoch = this.epoch;
      this.stateFlight = true;
      this.initial = this.request("state", { method: "GET" }).then((payload) => {
        this.accept(payload, epoch);
        this.bootstrapAttempts = 0;
      }).catch(() => {
        if (epoch !== this.epoch) return;
        this.initial = null;
        this.publish({ status: "network" });
        if (!this.disposed) this.bootstrapTimer = setTimeout(() => {
          void this.bootstrap();
        }, Math.min(5e3, 300 * 3 ** this.bootstrapAttempts++));
      }).finally(() => {
        this.stateFlight = false;
      });
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
    if (!this.active.size) {
      clearTimeout(this.timer);
      clearTimeout(this.loginTimer);
    }
  }
  async ensureFresh() {
    await this.bootstrap();
    if (!this.initial || !this.active.size || this.disposed) return;
    if (this.state.sessionBusy) {
      clearTimeout(this.timer);
      this.timer = setTimeout(async () => {
        await this.bootstrap({ reload: true });
        void this.ensureFresh();
      }, 1e3);
      return;
    }
    if (this.state.nextRefreshAt !== null && this.state.nextRefreshAt > this.now()) {
      this.schedule();
      return;
    }
    return this.refresh();
  }
  refresh({ force = false } = {}) {
    if (this.inFlight) return this.inFlight;
    const epoch = this.epoch;
    this.inFlight = this.bootstrap().then(async () => {
      if (this.disposed || epoch !== this.epoch || this.state.sessionBusy) return;
      this.publish({ refreshing: true });
      try {
        this.accept(await this.request(force ? "refresh?force=1" : "refresh", { method: "POST" }), epoch);
      } catch {
        if (epoch === this.epoch) this.publish({
          status: "network",
          stale: this.state.balance !== null,
          lastAttemptAt: this.now(),
          nextRefreshAt: this.now() + REFRESH_MS
        });
      }
    }).finally(() => {
      this.inFlight = null;
      this.publish({ refreshing: false });
      this.schedule();
    });
    return this.inFlight;
  }
  schedule() {
    clearTimeout(this.timer);
    if (!this.active.size || this.disposed) return;
    const delay = Math.max(1, (this.state.nextRefreshAt ?? this.now() + REFRESH_MS) - this.now());
    this.timer = setTimeout(() => {
      void this.ensureFresh();
    }, delay);
  }
  login(provider) {
    if (this.logoutFlight || this.state.sessionBusy) return Promise.resolve();
    if (this.loginFlight) return this.loginFlight;
    if (this.state.loginPending) return Promise.resolve();
    this.publish({ loginPending: true });
    const epoch = this.epoch;
    const path = provider ? "login?provider=" + encodeURIComponent(provider) : "login";
    this.loginFlight = this.request(path, { method: "POST" }).then((payload) => {
      this.accept(payload, epoch);
      this.pollLogin();
    }).catch(() => {
      if (epoch === this.epoch) this.publish({ status: "credential_storage_unavailable", loginPending: false });
    }).finally(() => {
      this.loginFlight = null;
    });
    return this.loginFlight;
  }
  pollLogin() {
    clearTimeout(this.loginTimer);
    if (!this.active.size || this.disposed || !this.state.loginPending) return;
    this.loginTimer = setTimeout(async () => {
      const epoch = this.epoch;
      try {
        this.accept(await this.request("state", { method: "GET" }), epoch);
      } catch {
        if (epoch === this.epoch) this.publish({ status: "network" });
      }
      this.pollLogin();
      this.schedule();
    }, 1e3);
  }
  logout(provider) {
    if (this.logoutFlight) return this.logoutFlight;
    this.onSessionReset?.(this, "begin");
    const pendingLogin = this.loginFlight, epoch = ++this.epoch;
    clearTimeout(this.loginTimer);
    this.publish({ balance: null, updatedAt: null, stale: false, status: "needs_login", loginPending: false, sessionBusy: true });
    this.logoutFlight = (async () => {
      await pendingLogin?.catch(() => {
      });
      try {
        this.accept(await this.request("logout?provider=" + encodeURIComponent(provider), { method: "POST" }), epoch);
      } catch {
        this.publish({ status: "credential_storage_unavailable" });
      }
    })().finally(() => {
      this.logoutFlight = null;
      this.publish({ sessionBusy: false });
      this.onSessionReset?.(this, "done");
      this.schedule();
    });
    return this.logoutFlight;
  }
  resetSession(busy = false) {
    this.epoch++;
    this.initial = null;
    clearTimeout(this.timer);
    clearTimeout(this.loginTimer);
    this.publish({ balance: null, updatedAt: null, lastAttemptAt: null, nextRefreshAt: null, status: "needs_login", stale: false, loginPending: false, refreshing: false, sessionBusy: busy });
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    clearTimeout(this.loginTimer);
    clearTimeout(this.bootstrapTimer);
    this.active.clear();
    this.listeners.clear();
  }
};

// src/client/pool.js
var controllerKey = (p) => JSON.stringify([p.id, p.kind, p.revision]);
var KINDS = /* @__PURE__ */ new Set(["mimo", "mimo-plan", "deepseek", "deepseek-account", "kimi-cn", "kimi-intl", "kimi-plan", "kimi-plan-intl", "glm", "glm-plan", "glm-plan-intl"]);
var ControllerPool = class {
  constructor({ transport: request = transport } = {}) {
    this.request = request;
    this.controllers = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Set();
    this.state = { providers: [] };
    this.disposed = false;
    this.getSnapshot = () => this.state;
    this.subscribe = (listener) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };
  }
  bootstrap({ reload = false } = {}) {
    if (this.disposed) return Promise.resolve();
    if (this.flight) return this.flight;
    if (this.loaded && !reload) return Promise.resolve();
    clearTimeout(this.retry);
    this.flight = this.request("state", { method: "GET" }).then((payload) => {
      if (this.disposed) return;
      const providers = Array.isArray(payload.providers) ? payload.providers.filter((p) => typeof p.id === "string" && p.id.length <= 160 && KINDS.has(p.kind) && typeof p.label === "string" && p.label.length <= 40) : [];
      const keys = new Set(providers.map(controllerKey));
      for (const [key, controller] of this.controllers) if (!keys.has(key)) {
        controller.dispose();
        this.controllers.delete(key);
      }
      this.state = { providers };
      this.loaded = true;
      this.listeners.forEach((f) => f());
    }).catch(() => {
      if (!this.disposed) this.retry = setTimeout(() => {
        void this.bootstrap();
      }, 3e3);
    }).finally(() => {
      this.flight = null;
    });
    return this.flight;
  }
  forProvider(id) {
    const provider = this.state.providers.find((p) => p.id === id);
    if (!provider) return null;
    const key = controllerKey(provider);
    if (!this.controllers.has(key)) this.controllers.set(key, new BalanceController({ transport: this.request, provider, onSessionReset: (source, phase) => {
      for (const c of this.controllers.values()) if (c !== source && ["mimo", "mimo-plan"].includes(c.provider.kind)) {
        c.resetSession(phase === "begin");
        if (phase === "done" && c.active.size) void c.bootstrap({ reload: true }).then(() => c.ensureFresh());
      }
    } }));
    return this.controllers.get(key);
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.retry);
    for (const c of this.controllers.values()) c.dispose();
    this.controllers.clear();
    this.listeners.clear();
  }
};

// src/client/contribution.js
var import_react2 = __toESM(require("react"), 1);
var import_react_dom = require("react-dom");

// src/client/provider.js
var OTHER_PROVIDERS = /* @__PURE__ */ new Set(["openai", "openai-codex", "anthropic", "deepseek", "deepseek-account"]);
function isMiMoCurrent(directory, providerIds) {
  const provider = directory?.current?.provider;
  return typeof provider === "string" && !OTHER_PROVIDERS.has(provider) && providerIds.includes(provider);
}

// src/client/popover.js
var import_react = __toESM(require("react"), 1);
function useBalancePopover(open, setOpen, anchor, panel) {
  const [position, setPosition] = import_react.default.useState(null);
  const measure = import_react.default.useCallback(() => {
    const a = anchor.current, p = panel.current;
    if (!a || !p) return;
    const win = a.ownerDocument.defaultView, box = a.getBoundingClientRect(), rect = p.getBoundingClientRect();
    const width = rect.width || 260, height = rect.height || 200, margin = 12;
    const left = Math.max(margin, Math.min(box.right - width, win.innerWidth - width - margin));
    const above = box.top - height - 8;
    const top = above >= margin ? above : Math.max(margin, Math.min(box.bottom + 8, win.innerHeight - height - margin));
    setPosition((previous) => previous?.left === left && previous?.top === top ? previous : { left, top });
  }, [anchor, panel]);
  import_react.default.useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const doc = anchor.current?.ownerDocument;
    if (!doc) return;
    const win = doc.defaultView;
    const outside = (event) => {
      if (!anchor.current?.contains(event.target) && !panel.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    };
    doc.addEventListener("pointerdown", outside, true);
    doc.addEventListener("keydown", escape, true);
    win.addEventListener("resize", measure);
    doc.addEventListener("scroll", measure, true);
    const observer = win.ResizeObserver ? new win.ResizeObserver(measure) : null;
    if (panel.current) observer?.observe(panel.current);
    if (anchor.current) observer?.observe(anchor.current);
    measure();
    return () => {
      observer?.disconnect();
      doc.removeEventListener("pointerdown", outside, true);
      doc.removeEventListener("keydown", escape, true);
      win.removeEventListener("resize", measure);
      doc.removeEventListener("scroll", measure, true);
    };
  }, [open, setOpen, anchor, panel, measure]);
  return { measure, position: position || { visibility: "hidden", left: 0, top: 0 } };
}

// src/usage.js
var RATES = {
  CNY: { pro: [3e4, 250, 6e4], flash: [1e4, 200, 2e4], ultra: [3e5, 2500, 6e5] },
  USD: { pro: [4350, 36, 8700], flash: [1400, 28, 2800], ultra: [43500, 360, 87e3] }
};
var MODEL_RATE = {
  "mimo-v2.6-pro": "pro",
  "mimo-v2.5-pro": "pro",
  "mimo-v2.6-flash": "flash",
  "mimo-v2.5": "flash",
  "mimo-v2.6-pro-ultraspeed": "ultra"
};
var count = (x) => Number.isSafeInteger(x) && x >= 0;
var route = (x) => x && typeof x.provider === "string" && x.provider.length <= 160 && typeof x.model === "string" && x.model.length <= 256 ? { provider: x.provider, model: x.model } : null;
var fields = ["input", "output", "cacheRead", "cacheWrite", "missing", "samples"];
var MAX_ROUTES = 256;
var only = (value, keys) => Object.keys(value).every((k) => keys.includes(k));
function validateView(v) {
  if (!v || !only(v, ["routes"]) || !Array.isArray(v.routes) || v.routes.length > MAX_ROUTES + 1 || v.routes.some((r) => !route(r) || !only(r, ["provider", "model", ...fields]) || fields.some((k) => !count(r[k])))) throw new Error("Invalid MiMo usage accounting");
  return v;
}
function quoteUsage(view, providerIds, currency) {
  const unavailable = { text: "\u2014", partial: true };
  if (!RATES[currency]) return unavailable;
  try {
    validateView(view);
  } catch {
    return unavailable;
  }
  const ids = new Set(providerIds);
  let numerator = 0n, partial = false, known = false;
  for (const row of view.routes) {
    if (!row.provider) {
      partial = true;
      continue;
    }
    if (!ids.has(row.provider)) continue;
    const rates = RATES[currency][MODEL_RATE[row.model]];
    if (!rates || row.cacheWrite > 0) {
      partial = true;
      continue;
    }
    if (row.missing) partial = true;
    if (!row.samples) continue;
    known = true;
    numerator += BigInt(row.input) * BigInt(rates[0]) + BigInt(row.cacheRead) * BigInt(rates[1]) + BigInt(row.output) * BigInt(rates[2]);
  }
  if (partial && !known) return unavailable;
  const symbol = currency === "CNY" ? "\xA5" : "US$";
  const units = (numerator + 500000n) / 1000000n;
  const whole = units / 10000n, decimals = (units % 10000n).toString().padStart(4, "0");
  const amount = decimals.endsWith("00") ? decimals.slice(0, 2) : decimals;
  const text = numerator > 0n && units === 0n ? "<" + symbol + "0.0001" : symbol + whole + "." + amount;
  return { text: text + (partial ? "\uFF08\u90E8\u5206\uFF09" : ""), partial };
}

// src/client/contribution.js
var h = import_react2.default.createElement;
var STATUS_TEXT = {
  needs_login: "\u9700\u8981\u767B\u5F55\u5C0F\u7C73\u8D26\u53F7",
  expired: "\u767B\u5F55\u5DF2\u8FC7\u671F",
  network: "\u4F59\u989D\u83B7\u53D6\u5931\u8D25",
  timeout: "\u4F59\u989D\u83B7\u53D6\u5931\u8D25\uFF08\u8BF7\u6C42\u8D85\u65F6\uFF09",
  unreadable: "\u65E0\u6CD5\u8BFB\u53D6\u4F59\u989D",
  credential_storage_unavailable: "\u51ED\u636E\u4E0D\u53EF\u7528",
  browser_unavailable: "\u767B\u5F55\u7EC4\u4EF6\u672A\u5C31\u7EEA",
  needs_key: "\u8BF7\u5728\u6A21\u578B\u8BBE\u7F6E\u4E2D\u914D\u7F6E\u5BC6\u94A5",
  invalid_key: "\u5BC6\u94A5\u65E0\u6548\u6216\u65E0\u67E5\u8BE2\u6743\u9650",
  needs_account: "\u8BF7\u767B\u5F55 DeepSeek \u8D26\u53F7"
};
function BalanceCard({ state, controller, onSizeChange, provider }) {
  import_react2.default.useLayoutEffect(() => {
    onSizeChange();
  }, [state, onSizeChange]);
  const stale = state.balance !== null && (state.stale || Date.now() - state.updatedAt >= REFRESH_MS);
  const timestamp = state.updatedAt ? new Date(state.updatedAt) : null;
  const time = timestamp?.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const datedTime = timestamp ? `${String(timestamp.getMonth() + 1).padStart(2, "0")}-${String(timestamp.getDate()).padStart(2, "0")} ${time}` : "";
  const balance = state.balance, label = state.provider?.label || "\u5C0F\u7C73 MiMo";
  const consoleLogin = !state.provider || ["mimo", "mimo-plan"].includes(state.provider.kind);
  const plan = state.provider?.kind?.includes("plan");
  const accounts = balance?.type === "quota" ? [] : balance ? balance.accounts || [balance] : [];
  return h(
    "section",
    {
      className: "ai-balance",
      "data-ai-balance": "",
      role: "group",
      "aria-label": label + (plan ? "\u5957\u9910\u989D\u5EA6" : "\u8D26\u6237\u4F59\u989D"),
      onMouseDown: (event) => {
        event.stopPropagation();
        if (event.target.closest("button")) event.preventDefault();
      },
      onClick: (event) => event.stopPropagation(),
      onKeyDown: (event) => {
        if (event.key !== "Escape") event.stopPropagation();
      }
    },
    h(
      "div",
      { className: "ai-balance__header" },
      h("span", { className: "ai-balance__brand" }, label, h("span", { className: "ai-balance__kind" }, plan ? "\u5957\u9910" : "\u6309\u91CF\u4ED8\u8D39")),
      h(
        "button",
        {
          type: "button",
          className: "ai-balance__button",
          "aria-label": "\u5237\u65B0" + label + " \u4F59\u989D",
          title: "\u5237\u65B0\u4F59\u989D",
          disabled: state.refreshing || state.sessionBusy,
          onClick: () => {
            void controller.refresh({ force: true });
          }
        },
        h(
          "svg",
          { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, "aria-hidden": true },
          h("path", { d: "M20 8a8 8 0 1 0 0 8M20 3v5h-5" })
        )
      )
    ),
    accounts.map((account) => h(
      "div",
      { key: account.currency },
      h("div", { className: "ai-balance__amount" }, "\u8D26\u6237\u4F59\u989D\uFF1A", formatMoney(account.total, account.currency)),
      account.cash !== void 0 && Number(account.cash) !== 0 && h("div", { className: "ai-balance__details" }, "\u73B0\u91D1\u4F59\u989D\uFF1A", formatMoney(account.cash, account.currency)),
      account.gift !== void 0 && Number(account.gift) !== 0 && h("div", { className: "ai-balance__details" }, state.provider?.kind?.startsWith("kimi") ? "\u4EE3\u91D1\u5238\uFF1A" : "\u8D60\u91D1\u4F59\u989D\uFF1A", formatMoney(account.gift, account.currency))
    )),
    balance?.type === "quota" && balance.windows.map((w, i) => h(
      "div",
      { key: i, className: "ai-balance__details" },
      `${w.label}\uFF1A\u5269\u4F59 ${w.remainingPercent}%`,
      w.resetAt ? h("div", { className: "ai-balance__time" }, "\u91CD\u7F6E\u4E8E ", new Date(w.resetAt).toLocaleString("zh-CN")) : null
    )),
    STATUS_TEXT[state.status] && h("div", { className: "ai-balance__status", role: "status" }, STATUS_TEXT[state.status]),
    !balance && !STATUS_TEXT[state.status] && h("div", { className: "ai-balance__status", role: "status" }, "\u6B63\u5728\u83B7\u53D6\u4F59\u989D\u2026"),
    timestamp && h(
      "div",
      { className: "ai-balance__time", title: timestamp.toLocaleString("zh-CN") },
      stale ? `\u7F13\u5B58\u4E8E\uFF1A${datedTime}` : `\u66F4\u65B0\u4E8E\uFF1A${time}`,
      state.refreshing ? " \xB7 \u5237\u65B0\u4E2D\u2026" : ""
    ),
    consoleLogin && h(
      "div",
      { className: "ai-balance__session" },
      h(
        "button",
        {
          type: "button",
          className: "ai-balance__button ai-balance__login",
          disabled: state.loginPending || state.sessionBusy,
          onClick: () => {
            void controller.login(provider);
          }
        },
        state.loginPending ? "\u7B49\u5F85\u672C\u673A\u767B\u5F55\u2026" : balance || state.status === "ready" ? "\u91CD\u65B0\u767B\u5F55" : "\u767B\u5F55\u5C0F\u7C73\u8D26\u53F7"
      ),
      (balance || state.loginPending || state.sessionBusy || !["idle", "needs_login"].includes(state.status)) && h("button", {
        type: "button",
        className: "ai-balance__button",
        disabled: state.sessionBusy,
        onClick: () => {
          void controller.logout(provider);
        }
      }, state.sessionBusy ? "\u6B63\u5728\u9000\u51FA\u2026" : "\u9000\u51FA\u767B\u5F55")
    )
  );
}
function MenuContribution({ directory, controller }) {
  const anchor = import_react2.default.useRef(null), panel = import_react2.default.useRef(null), token = import_react2.default.useRef({});
  const [open, setOpen] = import_react2.default.useState(false);
  const id = "ai-balance-" + import_react2.default.useId();
  const state = import_react2.default.useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const subscribe = import_react2.default.useCallback((callback) => directory.store.subscribe(callback), [directory]);
  const getDirectory = import_react2.default.useCallback(() => directory.store.getSnapshot(), [directory]);
  const selected = import_react2.default.useSyncExternalStore(subscribe, getDirectory);
  const enabled = state.provider ? selected?.current?.provider === state.provider.id : isMiMoCurrent(selected, state.providerIds);
  import_react2.default.useEffect(() => {
    void controller.bootstrap();
  }, [controller]);
  import_react2.default.useLayoutEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);
  import_react2.default.useEffect(() => {
    if (enabled) controller.activate(token.current);
    else controller.deactivate(token.current);
    return () => controller.deactivate(token.current);
  }, [enabled, controller]);
  const popover = useBalancePopover(open && enabled, setOpen, anchor, panel);
  if (!enabled) return null;
  const plan = state.provider?.kind?.includes("plan");
  const total = state.balance?.type === "quota" ? `${state.balance.windows[0].label} ${state.balance.windows[0].remainingPercent}%` : state.balance ? (state.balance.accounts || [state.balance]).map((b) => formatMoney(b.total, b.currency)).join(" / ") : plan ? "\u989D\u5EA6 \u2014" : "\u4F59\u989D \u2014";
  const brand = state.provider?.label || "\u5C0F\u7C73 MiMo";
  const cache = state.balance && (state.stale || Date.now() - state.updatedAt >= REFRESH_MS);
  const label = `${brand} ${plan ? "\u5269\u4F59\u989D\u5EA6" : "\u5269\u4F59\u603B\u4F59\u989D"} ${total}` + (cache ? "\uFF08\u7F13\u5B58\uFF09" : "");
  return h(
    import_react2.default.Fragment,
    null,
    h("button", {
      ref: anchor,
      type: "button",
      className: "ai-balance-total",
      "data-ai-balance-total": "",
      "aria-label": label,
      "aria-haspopup": "dialog",
      "aria-expanded": open,
      "aria-controls": open ? id : void 0,
      title: cache ? `\u7F13\u5B58\u4E8E ${new Date(state.updatedAt).toLocaleString("zh-CN")}\uFF1B\u70B9\u51FB\u67E5\u770B\u8BE6\u60C5` : "\u70B9\u51FB\u67E5\u770B\u8BE6\u60C5",
      onMouseDown: (event) => event.preventDefault(),
      onClick: () => {
        setOpen(!open);
        if (!open) void controller.ensureFresh();
      }
    }, total, cache ? " *" : ""),
    open ? (0, import_react_dom.createPortal)(h(
      "div",
      {
        id,
        ref: panel,
        role: "dialog",
        "aria-label": brand + "\u4F59\u989D\u8BE6\u60C5",
        className: "ai-balance-popover",
        style: popover.position
      },
      h(BalanceCard, { state, controller, provider: selected.current.provider, onSizeChange: popover.measure })
    ), anchor.current.ownerDocument.body) : null
  );
}
function UsageContribution({ directory, controller, useProjection }) {
  const state = import_react2.default.useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const subscribe = import_react2.default.useCallback((callback) => directory.store.subscribe(callback), [directory]);
  const getDirectory = import_react2.default.useCallback(() => directory.store.getSnapshot(), [directory]);
  const selected = import_react2.default.useSyncExternalStore(subscribe, getDirectory);
  const usage = useProjection("aiConversationUsage");
  if (state.provider ? selected?.current?.provider !== state.provider.id : !isMiMoCurrent(selected, state.providerIds)) return null;
  const quote = state.provider && state.provider.kind !== "mimo" ? { text: "\u2014", partial: true } : quoteUsage(usage, state.provider ? [state.provider.id] : state.providerIds, state.balance?.currency);
  return h(
    "span",
    {
      className: "ai-usage-pill",
      "data-ai-conversation-usage": "",
      title: "\u6309\u5BF9\u8BDD Token \u4F30\u7B97"
    },
    "\u9884\u4F30\u7528\u91CF ",
    quote.text
  );
}

// src/client/styles.js
var CSS = `
.ai-balance{padding:10px 12px 9px;color:var(--dsw-alias-label-primary,inherit);font-size:12px;line-height:1.65;text-align:left;font-family:inherit}
.ai-balance-total{flex:none;white-space:nowrap;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,inherit);padding:4px 6px;font:inherit;font-size:12px;font-variant-numeric:tabular-nums;cursor:pointer}
.ai-balance-total:hover,.ai-balance-total[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary,inherit)}
.ai-balance-total:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d93f8);outline-offset:1px}
.ai-balance-popover{position:fixed;z-index:1100;box-sizing:border-box;width:min(270px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-specific-menu,#fff);backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-prominent,0 6px 24px rgba(0,0,0,.18));--dsw-elevation-stroke-color:var(--dsw-alias-border-l1)}
.ai-usage-pill{display:inline-flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;padding:1px 8px;border-radius:999px;color:var(--dsw-alias-label-tertiary,inherit);font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));font-variant-numeric:tabular-nums}
.ai-balance__header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:2px}
.ai-balance__brand{font-weight:600}.ai-balance__kind{margin-left:6px;font-size:10px;font-weight:400;color:var(--dsw-alias-label-secondary,inherit)}
.ai-balance__button{display:inline-flex;align-items:center;justify-content:center;gap:3px;min-height:24px;border:0;border-radius:5px;padding:1px 5px;background:transparent;color:var(--dsw-alias-label-secondary,inherit);font:inherit;cursor:pointer}
.ai-balance__button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary,inherit)}
.ai-balance__button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d93f8);outline-offset:1px}.ai-balance__button:disabled{opacity:.55;cursor:default}
.ai-balance__amount{font-variant-numeric:tabular-nums;font-weight:500}.ai-balance__details{font-size:11px;color:var(--dsw-alias-label-secondary,inherit)}
.ai-balance__time{font-size:10px;color:var(--dsw-alias-label-secondary,inherit);margin-top:3px;font-variant-numeric:tabular-nums}
.ai-balance__status{font-size:11px;color:var(--dsw-alias-label-secondary,inherit)}.ai-balance__login{margin:2px -5px 0;color:var(--dsw-alias-state-business-primary,#4d93f8)}
.ai-balance__session{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:3px}
`;
function installStyles(ctx) {
  ctx.effect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-plugin-css", "dsh-ai-balance");
    style.textContent = CSS;
    document.head.appendChild(style);
    return () => style.remove();
  });
}

// src/client/index.js
var inject = ["slots", "sessions", "modelDirectories"];
function SessionContribution({ ctx, controller, sessionId, useProjection, usage = false }) {
  const [directory, setDirectory] = import_react3.default.useState(null);
  import_react3.default.useEffect(() => {
    let disposed = false, timer, attempt = 0;
    const resolve = () => {
      if (disposed) return;
      try {
        if (ctx.sessions.subagentAddress(sessionId) !== void 0) return;
        const current = ctx.modelDirectories.directoryFor(sessionId);
        setDirectory(current);
        void current.load().catch(() => {
        });
      } catch {
        timer = setTimeout(resolve, Math.min(2e3, 60 * 2 ** attempt++));
      }
    };
    resolve();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [ctx, sessionId]);
  return directory ? import_react3.default.createElement(ProviderContribution, { directory, pool: controller, useProjection, usage }) : null;
}
function ProviderContribution({ directory, pool, useProjection, usage = false }) {
  import_react3.default.useSyncExternalStore(pool.subscribe, pool.getSnapshot);
  const subscribe = import_react3.default.useCallback((f) => directory.store.subscribe(f), [directory]);
  const get = import_react3.default.useCallback(() => directory.store.getSnapshot(), [directory]);
  const selected = import_react3.default.useSyncExternalStore(subscribe, get);
  const provider = selected?.current?.provider;
  import_react3.default.useEffect(() => {
    void pool.bootstrap({ reload: true });
  }, [provider, pool]);
  const controller = pool.forProvider(provider);
  return controller ? import_react3.default.createElement(
    usage ? UsageContribution : MenuContribution,
    { key: provider + ":" + controller.provider.kind, directory, controller, useProjection }
  ) : null;
}
function apply(ctx) {
  installStyles(ctx);
  const controller = new ControllerPool();
  ctx.effect(() => () => controller.dispose());
  void controller.bootstrap();
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
    name: "conversation.input.right",
    id: "ai-inline-balance",
    order: 50,
    label: () => "\u4F59\u989D\u4E0E\u989D\u5EA6",
    inject: (sessionId) => ({ sessionId })
  }, (props) => import_react3.default.createElement(SessionContribution, { ...props, key: props.sessionId, ctx, controller })));
  ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
    name: "conversation.composer.dock",
    id: "ai-conversation-usage",
    order: 50,
    label: () => "\u9884\u4F30\u7528\u91CF",
    inject: (sessionId) => ({ sessionId })
  }, (props) => import_react3.default.createElement(SessionContribution, { ...props, key: props.sessionId, ctx, controller, usage: true })));
}

return module.exports;}});
