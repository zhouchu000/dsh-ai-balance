# 贡献说明

本版的范围是余额查询与 Token 费用估算。请勿增加模型凭据管理、修改 DeepSeek Harness 核心、第三方转发或账户真实扣费推断。

使用 Node >=22.19，在提交前运行：

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run check:release
```

行为变更需有对应的匿名测试，包括 Provider ID、币种、去重/刷新、鉴权和会话隔离。不得用真实账户凭据做 CI。修改源码后同时提交重建的 `lib/client.js` 与必要的锁文件更新。

新增模型价格必须给出小米官方来源及核对日期；未确认字段与价格必须继续明确显示未知或部分，不能猜金额。Bug 报告只需系统、DeepSeek Harness/插件版本、脱敏复现步骤；不要提供整个 profile、凭据库、缓存或对话记录。

发布前只打包公开白名单文件，执行敏感信息检查，并在 `REVIEW.md` 如实记录自动化、实机和未验证范围。

GitHub 仓库/源码 ZIP 必须包含锁文件、`.github`、源码及重建客户端。`npm pack` 默认会省略锁文件和部分仓库文件，不等价于本项目的源码交付包。`private: true` 用于避免意外发布到 npm，不妨碍 GitHub 开源；
