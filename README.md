# dsh-ai-balance

DeepSeek Harness 桌面版和本地 Web 的余额与套餐额度插件。

随当前模型切换供应商，在模型名旁显示余额或剩余额度，点击查看详情和刷新。支持深浅主题，每五分钟自动刷新；切换到其他供应商后停止刷新。

| 供应商 | 显示内容 | 认证 |
| --- | --- | --- |
| 小米 MiMo | 按量付费余额、Coding Plan 剩余百分比 | 本机小米网页登录 |
| DeepSeek | API 余额、Harness 账号余额 | 已配置密钥或账号 |
| Kimi | API 余额、Coding 套餐额度 | 已配置密钥或有效登录 |
| GLM | 国内 API 余额、国内/国际 Coding Plan 额度 | 已配置凭据及查询权限 |


## 提示

MiMo新用户注册可以参与邀请活动，邀请/被邀请均可获得¥10的赠金用于API消费，上限¥300。

可在闲鱼购买代邀请，¥20可以获得¥100的赠金，有效期40天（建议小号使用，存在一定风险）

## 安装

适用于 **DeepSeek Harness 0.2.0-rc.2**，需要 **Node.js ≥22.19**。

### 让 Agent 安装

```text
给 DeepSeek Harness 安装 https://github.com/zhouchu000/dsh-ai-balance
按 README 安装、验证，保留现有配置。网页登录由我完成。
```

### 手动安装

从「Code → Download ZIP」下载，解压到长期保留的目录。在该目录打开终端，执行：

```sh
npm ci --ignore-scripts
npm run build
```

Windows PowerShell 若限制运行 npm，使用 `npm.cmd`。在 DeepSeek Harness「插件 → 添加插件」输入 `link:插件目录的绝对路径`，安装并启用，然后完全退出重开。请保留源码目录。

命令行安装：先退出对应后台，再执行：

```sh
npm run install:profile -- --profile "配置目录的绝对路径"
```

配置目录通常为用户目录下的 `.dsh/profiles/desktop` 或 `.dsh/profiles/web`；设置过 `DSH_HOME` 则以其为准。共用后台的桌面版和 Web 安装一次，独立后台分别安装。脚本会备份配置，并将旧版 `dsh-mimo-balance` 替换为新版。

## 使用

模型设置保留原有凭据。自定义模型按 Provider ID 和官方接口地址识别；GLM 国内、国际及按量/套餐地址需与实际账号一致。

MiMo 点击余额或额度，再选「登录小米账号」，在本机窗口完成登录。详情中可退出、重新登录。缺少 Chrome/Edge 时，执行 `npm run setup:browser`。

底部「预估用量」显示本对话当前供应商的 Token 费用，支持 MiMo、DeepSeek、Kimi 和 GLM 的已定价模型。Coding Plan 显示「套餐已用」百分比，按账号和周期统计。

## 卸载与回滚

MiMo 可先在详情退出登录，再从插件管理器卸载并重启。命令行使用 `npm run uninstall:profile -- --profile "配置目录绝对路径"`。回滚时重新安装旧源码目录的 `link:` 路径，并停用新版。

MIT 许可证。[安全说明](SECURITY.md) · [开发说明](CONTRIBUTING.md) 
