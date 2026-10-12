window.__ModuleLoader__.load({id:"dsh-mimo-balance",factory:function(require){var module={exports:{}};var exports=module.exports;
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
function decimal(value) {
  return typeof value === "string" && /^-?\d{1,16}(?:\.\d{1,8})?$/.test(value);
}
function parseBalance(body) {
  if (body?.code !== 0 || !body.data || !decimal(body.data.balance) || typeof body.data.currency !== "string" || !/^[A-Z]{3,12}$/.test(body.data.currency)) throw balanceError("unreadable");
  const { balance, currency, cashBalance, giftBalance } = body.data;
  if (cashBalance !== void 0 && !decimal(cashBalance) || giftBalance !== void 0 && !decimal(giftBalance)) throw balanceError("unreadable");
  return { total: balance, currency, ...cashBalance === void 0 ? {} : { cash: cashBalance }, ...giftBalance === void 0 ? {} : { gift: giftBalance } };
}
function formatMoney(amount, currency) {
  return (currency === "CNY" ? "\xA5" : currency === "USD" ? "US$" : `${currency} `) + amount;
}

// src/client/controller.js
async function transport(path, { method = "GET" } = {}) {
  const response = await fetch("/dsh-mimo-balance/" + path, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    signal: AbortSignal.timeout(2e4),
    headers: { "X-DSH-MiMo-Request": "1", Accept: "application/json" }
  });
  if (!response.ok) throw new Error("local backend unavailable");
  return response.json();
}
var BalanceController = class {
  constructor({ transport: request = transport, now = Date.now } = {}) {
    this.request = request;
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
    if (payload.balance) balance = parseBalance({ code: 0, data: {
      balance: payload.balance.total,
      currency: payload.balance.currency,
      cashBalance: payload.balance.cash,
      giftBalance: payload.balance.gift
    } });
    const codes = ["idle", "ready", "needs_login", "expired", "network", "timeout", "unreadable", "credential_storage_unavailable", "browser_unavailable"];
    const timestamp = (value) => Number.isSafeInteger(value) && value > 0 ? value : null;
    this.publish({
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
  bootstrap() {
    if (!this.initial && !this.disposed) {
      clearTimeout(this.bootstrapTimer);
      const epoch = this.epoch;
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
      });
    }
    return this.initial;
  }
  activate(token) {
    this.active.add(token);
    void this.bootstrap().then(() => {
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
    if (!this.initial || !this.active.size || this.disposed || this.state.sessionBusy) return;
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
      this.schedule();
    });
    return this.logoutFlight;
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
var PRICE_CHECKED_AT = "2026-10-12";
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
  credential_storage_unavailable: "DSH \u51ED\u636E\u914D\u7F6E\u4E0D\u53EF\u7528",
  browser_unavailable: "\u672C\u673A\u767B\u5F55\u7EC4\u4EF6\u672A\u5C31\u7EEA"
};
function BalanceCard({ state, controller, onSizeChange, provider }) {
  import_react2.default.useLayoutEffect(() => {
    onSizeChange();
  }, [state, onSizeChange]);
  const stale = state.balance !== null && (state.stale || Date.now() - state.updatedAt >= REFRESH_MS);
  const timestamp = state.updatedAt ? new Date(state.updatedAt) : null;
  const time = timestamp?.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const datedTime = timestamp ? `${String(timestamp.getMonth() + 1).padStart(2, "0")}-${String(timestamp.getDate()).padStart(2, "0")} ${time}` : "";
  const balance = state.balance;
  return h(
    "section",
    {
      className: "mimo-balance",
      "data-mimo-balance": "",
      role: "group",
      "aria-label": "\u5C0F\u7C73 MiMo \u6309\u91CF\u4ED8\u8D39\u8D26\u6237\u4F59\u989D",
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
      { className: "mimo-balance__header" },
      h("span", { className: "mimo-balance__brand" }, "\u5C0F\u7C73 MiMo", h("span", { className: "mimo-balance__kind" }, "\u6309\u91CF\u4ED8\u8D39")),
      h(
        "button",
        {
          type: "button",
          className: "mimo-balance__button",
          "aria-label": "\u5237\u65B0\u5C0F\u7C73 MiMo \u4F59\u989D",
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
    balance && h("div", { className: "mimo-balance__amount" }, "\u8D26\u6237\u4F59\u989D\uFF1A", formatMoney(balance.total, balance.currency)),
    balance?.cash !== void 0 && h("div", { className: "mimo-balance__details" }, "\u251C\u2500 \u73B0\u91D1\u4F59\u989D\uFF1A", formatMoney(balance.cash, balance.currency)),
    balance?.gift !== void 0 && h("div", { className: "mimo-balance__details" }, "\u2514\u2500 \u8D60\u9001\u4F59\u989D\uFF1A", formatMoney(balance.gift, balance.currency)),
    STATUS_TEXT[state.status] && h("div", { className: "mimo-balance__status", role: "status" }, STATUS_TEXT[state.status]),
    !balance && !STATUS_TEXT[state.status] && h("div", { className: "mimo-balance__status", role: "status" }, "\u6B63\u5728\u83B7\u53D6\u4F59\u989D\u2026"),
    timestamp && h(
      "div",
      { className: "mimo-balance__time", title: timestamp.toLocaleString("zh-CN") },
      stale ? `\u7F13\u5B58\u4E8E\uFF1A${datedTime}` : `\u66F4\u65B0\u4E8E\uFF1A${time}`,
      state.refreshing ? " \xB7 \u5237\u65B0\u4E2D\u2026" : ""
    ),
    h(
      "div",
      { className: "mimo-balance__session" },
      h(
        "button",
        {
          type: "button",
          className: "mimo-balance__button mimo-balance__login",
          disabled: state.loginPending || state.sessionBusy,
          onClick: () => {
            void controller.login(provider);
          }
        },
        state.loginPending ? "\u7B49\u5F85\u672C\u673A\u767B\u5F55\u2026" : balance || state.status === "ready" ? "\u91CD\u65B0\u767B\u5F55" : "\u767B\u5F55\u5C0F\u7C73\u8D26\u53F7"
      ),
      (balance || state.loginPending || state.sessionBusy || !["idle", "needs_login"].includes(state.status)) && h("button", {
        type: "button",
        className: "mimo-balance__button",
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
  const id = "mimo-balance-" + import_react2.default.useId();
  const state = import_react2.default.useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const subscribe = import_react2.default.useCallback((callback) => directory.store.subscribe(callback), [directory]);
  const getDirectory = import_react2.default.useCallback(() => directory.store.getSnapshot(), [directory]);
  const selected = import_react2.default.useSyncExternalStore(subscribe, getDirectory);
  const enabled = isMiMoCurrent(selected, state.providerIds);
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
  const total = state.balance ? formatMoney(state.balance.total, state.balance.currency) : "\u4F59\u989D \u2014";
  const cache = state.balance && (state.stale || Date.now() - state.updatedAt >= REFRESH_MS);
  const label = `\u5C0F\u7C73 MiMo \u5269\u4F59\u603B\u4F59\u989D ${total}` + (cache ? "\uFF08\u7F13\u5B58\uFF09" : "");
  return h(
    import_react2.default.Fragment,
    null,
    h("button", {
      ref: anchor,
      type: "button",
      className: "mimo-balance-total",
      "data-mimo-balance-total": "",
      "aria-label": label,
      "aria-haspopup": "dialog",
      "aria-expanded": open,
      "aria-controls": open ? id : void 0,
      title: cache ? `\u7F13\u5B58\u4E8E ${new Date(state.updatedAt).toLocaleString("zh-CN")}\uFF1B\u70B9\u51FB\u67E5\u770B\u8BE6\u60C5` : "\u70B9\u51FB\u67E5\u770B\u5C0F\u7C73 MiMo \u4F59\u989D\u8BE6\u60C5",
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
        "aria-label": "\u5C0F\u7C73 MiMo \u4F59\u989D\u8BE6\u60C5",
        className: "mimo-balance-popover",
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
  const usage = useProjection("mimoConversationUsage");
  if (!isMiMoCurrent(selected, state.providerIds)) return null;
  const quote = quoteUsage(usage, state.providerIds, state.balance?.currency);
  return h(
    "span",
    {
      className: "mimo-usage-pill",
      "data-mimo-conversation-usage": "",
      title: `\u4EC5\u6B64\u5BF9\u8BDD\u7684 MiMo \u6A21\u578B Token \u7528\u91CF\uFF0C\u6309 ${PRICE_CHECKED_AT} \u6838\u5BF9\u7684\u5B98\u65B9\u4EF7\u683C\u4F30\u7B97\uFF1B\u4E0D\u542B\u8054\u7F51\u63D2\u4EF6\u8D39\u7528\uFF0C\u5B9E\u9645\u4EE5\u5C0F\u7C73\u8D26\u5355\u4E3A\u51C6\u3002` + (quote.partial ? " \u7528\u91CF\u8BB0\u5F55\u6216\u8BA1\u4EF7\u4FE1\u606F\u4E0D\u5B8C\u6574\u3002" : "")
    },
    "\u9884\u4F30\u7528\u91CF ",
    quote.text
  );
}

// src/client/styles.js
var CSS = `
.mimo-balance{padding:10px 12px 9px;color:var(--dsw-alias-label-primary,inherit);font-size:12px;line-height:1.65;text-align:left;font-family:inherit}
.mimo-balance-total{flex:none;white-space:nowrap;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,inherit);padding:4px 6px;font:inherit;font-size:12px;font-variant-numeric:tabular-nums;cursor:pointer}
.mimo-balance-total:hover,.mimo-balance-total[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary,inherit)}
.mimo-balance-total:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d93f8);outline-offset:1px}
.mimo-balance-popover{position:fixed;z-index:1100;box-sizing:border-box;width:min(270px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-specific-menu,#fff);backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-prominent,0 6px 24px rgba(0,0,0,.18));--dsw-elevation-stroke-color:var(--dsw-alias-border-l1)}
.mimo-usage-pill{display:inline-flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;padding:1px 8px;border-radius:999px;color:var(--dsw-alias-label-tertiary,inherit);font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));font-variant-numeric:tabular-nums}
.mimo-balance__header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:2px}
.mimo-balance__brand{font-weight:600}.mimo-balance__kind{margin-left:6px;font-size:10px;font-weight:400;color:var(--dsw-alias-label-secondary,inherit)}
.mimo-balance__button{display:inline-flex;align-items:center;justify-content:center;gap:3px;min-height:24px;border:0;border-radius:5px;padding:1px 5px;background:transparent;color:var(--dsw-alias-label-secondary,inherit);font:inherit;cursor:pointer}
.mimo-balance__button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary,inherit)}
.mimo-balance__button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d93f8);outline-offset:1px}.mimo-balance__button:disabled{opacity:.55;cursor:default}
.mimo-balance__amount{font-variant-numeric:tabular-nums;font-weight:500}.mimo-balance__details{font-size:11px;color:var(--dsw-alias-label-secondary,inherit)}
.mimo-balance__time{font-size:10px;color:var(--dsw-alias-label-secondary,inherit);margin-top:3px;font-variant-numeric:tabular-nums}
.mimo-balance__status{font-size:11px;color:var(--dsw-alias-label-secondary,inherit)}.mimo-balance__login{margin:2px -5px 0;color:var(--dsw-alias-state-business-primary,#4d93f8)}
.mimo-balance__session{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:3px}
`;
function installStyles(ctx) {
  ctx.effect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-plugin-css", "dsh-mimo-balance");
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
  return directory ? import_react3.default.createElement(usage ? UsageContribution : MenuContribution, { directory, controller, useProjection }) : null;
}
function apply(ctx) {
  installStyles(ctx);
  const controller = new BalanceController();
  ctx.effect(() => () => controller.dispose());
  void controller.bootstrap();
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
    name: "conversation.input.right",
    id: "mimo-inline-balance",
    order: 50,
    label: () => "MiMo balance",
    inject: (sessionId) => ({ sessionId })
  }, (props) => import_react3.default.createElement(SessionContribution, { ...props, key: props.sessionId, ctx, controller })));
  ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
    name: "conversation.composer.dock",
    id: "mimo-conversation-usage",
    order: 50,
    label: () => "MiMo usage estimate",
    inject: (sessionId) => ({ sessionId })
  }, (props) => import_react3.default.createElement(SessionContribution, { ...props, key: props.sessionId, ctx, controller, usage: true })));
}

return module.exports;}});
