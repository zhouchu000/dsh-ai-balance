# 开发说明

Node.js ≥22.19：

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run check:release
```

提交源码、锁文件和重建的 `lib/client.js`。测试使用匿名数据，覆盖 Provider 判断、币种与额度单位、凭据隔离、缓存、刷新和切换。未知字段或价格保留为未知。

## 结构

- `providers.js`：Provider ID、官方端点及凭据引用映射。
- `provider-auth.js`：读取 Harness 凭据，校验身份。
- `provider-api.js`：固定接口与响应解析。
- `registry.js`、`balance-service.js`：各供应商的请求与缓存。
- `usage.js`：对话用量归集、重试与分支记账。
- `pricing.js`：官方单价、币种和计价档位。
- `client/`：模型名旁总览、点击详情及对话预估。

使用 Harness 官方 Bundle 与 UI slot，不修改核心或安装文件。缓存位于 `$DSH_HOME/cache/dsh-ai-balance/`。小米继续使用旧会话引用，便于升级。仅经明确 `providerIds` 配置兼容小米代理别名，其他自定义供应商要求官方端点。

## 接口来源

- [DeepSeek 余额 API](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/)：`GET /user/balance`，Bearer；保留 `balance_infos` 中各币种。
- [Kimi 余额 API](https://platform.kimi.com/docs/api/balance)：`GET /v1/users/me/balance`，Bearer；国内 CNY、国际 USD，使用 `available_balance`。
- [Kimi Code](https://github.com/MoonshotAI/kimi-code/blob/main/packages/oauth/src/managed-usage.ts)：`GET /coding/v1/usages`，Bearer；`usages.limit_*` 的 `used_ratio` 和 `reset_time`。密钥无权限时需要 Harness 中的有效登录；插件不代管 OAuth 刷新。
- [GLM 官方查询脚本](https://github.com/zai-org/zai-coding-plugins/blob/main/plugins/glm-plan-usage/skills/usage-query-skill/scripts/query-usage.mjs)：`GET /api/monitor/usage/quota/limit`，原样 Authorization；读取 `limits` 的 `percentage`。
- [智谱控制台](https://bigmodel.cn/)：前端使用 `/api/biz/account/query-customer-account-report`，读取 `availableBalance`。此接口可能要求控制台凭据；累计充值、赠送金额不能当作剩余额度。
- [小米控制台](https://platform.xiaomimimo.com/)：Cookie 会话；按量余额 `/api/v1/balance`，套餐 `/api/v1/tokenPlan/usage`。套餐读取 `data.usage.items[].percent`，仅显示百分比。

余额接口核对日期：2026-10-13。

## 费用计算

单价来源：[MiMo](https://mimo.mi.com/docs/price)（2026-10-12）、[DeepSeek](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)、[Kimi 国内](https://platform.kimi.com/docs/pricing/chat)、[Kimi 国际](https://platform.kimi.ai/docs/pricing/chat)、[GLM 国内](https://docs.bigmodel.cn/cn/guide/start/pricing)（2026-10-14）。国际价格使用 USD，不换算汇率。

当前覆盖：MiMo V2.5/V2.5 Pro、V2.6 Flash/Pro/Pro UltraSpeed；DeepSeek Flash/V4 Pro；Kimi K3、K2.6、K2.7 Code，国内另含 Code HighSpeed；GLM 5/5-Turbo/5.1/5.2/5.3、5.3 Flash/FlashX、4.7/Flash/FlashX。

按原始调用归集，不把累计 Token 当成单次上下文。DeepSeek 使用调用时间和峰谷单价，人民币支持 [2026 年节假日](https://www.gov.cn/gongbao/2025/issue_12406/202511/content_7048922.html)。记录跨时段、缺少时间、未收录的节假日年份，以及 GLM 文档未明确 K 的进制边界时，显示费用区间。Kimi K3 的缓存写入缺少 TTL 明细时，按 5 分钟至 1 小时价格显示区间。

历史记录按收录的现行价格估算，仅含 Token 费用。未知型号或币种显示「—」，缺少部分记录标注「部分」。套餐百分比来自账号额度接口，与本对话费用分开。升级后由 Harness 重放日志重建计价分档，原始对话不变。

安装脚本会备份 profile，再增量修改插件声明；执行时应退出后台。更换版本保留旧目录，不用整份旧配置覆盖用户后续修改。

发布源码 ZIP 使用 `check:release` 的文件白名单，解压后独立构建、测试并核对客户端。`npm pack` 会省略锁文件等仓库文件，不能替代源码 ZIP。`private: true` 防止误发 npm，不影响 GitHub 开源。
