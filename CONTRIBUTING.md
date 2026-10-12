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

## 插件配置

默认 Provider ID 为 `xiaomi`，自动识别 `baseURL` 指向 `https://api.xiaomimimo.com/...` 的自定义提供商。经代理接入时，在 `cordis.patch.yml` 的 `providerIds` 中追加准确 ID。OpenAI、Anthropic、DeepSeek 和已知 Token Plan 地址排除。

登录优先使用本机 Chrome/Edge；缺少浏览器时运行 `npm run setup:browser`，或设置 `browserExecutable`。安装脚本会备份 profile 配置，并添加插件声明和本地链接；执行前应确认对应后台已退出。备用卸载命令为 `npm run uninstall:profile -- --profile "实际配置目录绝对路径"`。

余额缓存位于 `$DSH_HOME/cache/dsh-mimo-balance/balance.json`，恢复缓存前验证会话身份。费用按调用时的提供商和模型归属，统计重试、摘要压缩和分支用量，价格核对日期为 2026-10-12；不含联网插件费用、优惠和历史价格变化。支持已确认价格的 MiMo-V2.5、V2.5-Pro、V2.6-Flash、V2.6-Pro 和 V2.6-Pro-UltraSpeed，以余额接口的 CNY/USD 币种计价。
