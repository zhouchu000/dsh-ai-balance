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
- `client/`：模型名旁总览、点击详情及对话预估。

使用 Harness 官方 Bundle 与 UI slot，不修改核心或安装文件。缓存位于 `$DSH_HOME/cache/dsh-ai-balance/`。小米继续使用旧会话引用，便于升级。仅经明确 `providerIds` 配置兼容小米代理别名，其他自定义供应商要求官方端点。

## 接口来源

- [DeepSeek 余额 API](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/)：`GET /user/balance`，Bearer；保留 `balance_infos` 中各币种。
- [Kimi 余额 API](https://platform.kimi.com/docs/api/balance)：`GET /v1/users/me/balance`，Bearer；国内 CNY、国际 USD，使用 `available_balance`。
- [Kimi Code](https://github.com/MoonshotAI/kimi-code/blob/main/packages/oauth/src/managed-usage.ts)：`GET /coding/v1/usages`，Bearer；`usages.limit_*` 的 `used_ratio` 和 `reset_time`。密钥无权限时需要 Harness 中的有效登录；插件不代管 OAuth 刷新。
- [GLM 官方查询脚本](https://github.com/zai-org/zai-coding-plugins/blob/main/plugins/glm-plan-usage/skills/usage-query-skill/scripts/query-usage.mjs)：`GET /api/monitor/usage/quota/limit`，原样 Authorization；读取 `limits` 的 `percentage`。
- [智谱控制台](https://bigmodel.cn/)：前端使用 `/api/biz/account/query-customer-account-report`，读取 `availableBalance`。此接口可能要求控制台凭据；累计充值、赠送金额不能当作剩余额度。
- [小米控制台](https://platform.xiaomimimo.com/)：Cookie 会话；按量余额 `/api/v1/balance`，套餐 `/api/v1/tokenPlan/usage`。套餐读取 `data.usage.items[].percent`，仅显示百分比。

以上来源核对日期：2026-10-13。MiMo Token 费用沿用 [官方价格](https://mimo.mi.com/docs/price)，核对日期 2026-10-12；只计算已确认型号与币种。

安装脚本会备份 profile，再增量修改插件声明；执行时应退出后台。更换版本保留旧目录，不用整份旧配置覆盖用户后续修改。

发布源码 ZIP 使用 `check:release` 的文件白名单，解压后独立构建、测试并核对客户端。`npm pack` 会省略锁文件等仓库文件，不能替代源码 ZIP。`private: true` 防止误发 npm，不影响 GitHub 开源。
