# DSH MiMo Balance 1.3.0

小米 MiMo 按量付费余额与当前对话 Token 费用估算插件，适用于本机 DSH Desktop 和本机后台提供的 Web 界面。使用 DSH 官方插件接口，不修改核心源码或 asar。

余额通过小米控制台会话查询，模型调用使用 DSH 中已有的 MiMo 配置。安装前请先完成模型配置。

## 功能

- 当前已选 MiMo 时，输入栏模型名旁只显示总余额；点击金额才显示现金/赠送余额、成功更新时间与刷新按钮。点击外部或按 Escape 收起。
- 底部仅显示「预估用量 ¥…」，分别统计每个对话；当前模型切换不会改写历史调用的计价归属。
- 按准确 Provider ID 判断，支持指向官方按量付费地址的自定义提供商。悬停、待选模型和名字含 MiMo 的其他提供商不会触发显示。
- 首次选择自动查询；成功缓存优先显示，持续选中时后台最多每五分钟自动查询一次。并发刷新合并，切换其他提供商后停止自动刷新。
- 未登录、登录过期、网络错误和超时有明确状态；保留旧缓存时标注时间。没有可用金额就显示「—」，不用模拟值。
- 详情内可退出余额账号并重新登录；退出立即隐藏旧金额、取消未完成登录/刷新，清除本插件会话与缓存。
- 原生主题颜色，保留原模型列表、排序、推理设置和底部数据栏。

## 安装

针对 DSH **0.2.0-rc.2** 开发。需要兼容该版本的 `slots`、`modelDirectories`、`sessionProjections`、`connection`、`credentials`、`settings` 和 `webServer` 接口。其他 DSH 版本需另行验证；本机 Web 使用同一套插件，不支持远程或多用户服务。

可从 [GitHub 项目](https://github.com/zhouchu000/dsh-mimo-balance) 的「Code → Download ZIP」下载源码，或使用 Git 克隆。下载后将目录重命名为 `dsh-mimo-balance`，按下方步骤安装。

需要 Node.js **>=22.19**。从 [Node.js 官网](https://nodejs.org/en/download)安装合适的 LTS 版本。将项目保存到长期保留的目录，不要放入 DSH 安装目录。

### Windows

将项目解压至用户目录下的 `DSH-plugins/dsh-mimo-balance`，确认这个目录直接包含 `package.json`。打开 PowerShell：

```powershell
Set-Location "$env:USERPROFILE\DSH-plugins\dsh-mimo-balance"
npm.cmd ci --ignore-scripts
npm.cmd run build
npm.cmd test
"link:" + (Get-Location).Path
```

DSH「插件 → 添加插件」中粘贴最后一行输出的完整 `link:` 路径，安装并启用。安装后从系统托盘右键 DSH 选择退出，再重新打开；关闭窗口可能只隐藏界面。

### macOS

将项目解压至 `~/DSH-plugins/dsh-mimo-balance`，在终端执行：

```sh
cd ~/DSH-plugins/dsh-mimo-balance
npm ci --ignore-scripts
npm run build
npm test
printf 'link:%s\n' "$PWD"
```

在 DSH「插件 → 添加插件」安装输出的完整路径，完全退出并重新打开 DSH。

安装后需保留源码目录。Desktop 和 Web 使用同一个后台时安装一次即可；独立的 `dsh web` 使用另一个 profile，需要在对应 Web 的插件页面安装。

## 余额登录与使用

先选中已配置的 MiMo 模型，再点击模型名旁的「余额 —」及「登录小米账号」。后台打开独立的 Chrome/Edge/Chromium 窗口，请直接在小米网页完成登录。余额验证成功后保存控制台会话，关闭窗口并更新余额显示。

优先使用本机已安装的 Chrome/Edge；缺少可用浏览器时，在插件目录运行 `npm run setup:browser`（PowerShell 用 `npm.cmd run setup:browser`）。也可在 Bundle 配置中设置 `browserExecutable` 指定浏览器可执行文件。登录窗口位于运行 DSH 后台的电脑上。

插件只复用自己通过 DSH 保存的控制台会话，不读取日常浏览器配置。不同设备首次使用需分别登录；无需向聊天、Issue 或配置文件粘贴 Cookie。

点击总余额打开详情，使用「退出登录」清除本插件保存的控制台会话和余额缓存。随后点击「登录小米账号」即可重新登录；已有余额时也可直接点击「重新登录」。退出期间取消未完成请求。余额登录与 DSH 账号、模型调用配置相互独立。

## 会话与接口边界

余额请求仅由后台执行：`GET https://platform.xiaomimimo.com/api/v1/balance`，认证使用小米控制台 Cookie。该接口**并非官方公开保证兼容的 API**。读取已验证的 `data.balance`、`cashBalance`、`giftBalance` 与 `currency`；字段不符合预期即明确失败，不能把 Credits 当人民币。

本插件只使用 DSH 原有 `credentials` 保存控制台会话引用 `DSH_MIMO_CONSOLE_SESSION`。DSH 当前默认存储为 `$DSH_HOME/.credentials.yaml`，并非系统钥匙串或独立加密库。macOS/Linux 按 DSH 的文件权限保护，Windows 依赖用户目录权限；请同时保护这些本机文件。

原始 Cookie、Token 不返回前端、不记录日志。后台接口只接受回环访问、DSH 官方认证及同源请求标记；不开放凭据读取接口，不使用第三方中转。详见 [SECURITY.md](SECURITY.md)。

非凭据余额缓存位于 `$DSH_HOME/cache/dsh-mimo-balance/balance.json`，含金额、币种、时间及会话摘要标识。重启必须验证会话身份匹配后才恢复金额；未登录、登录过期或凭据服务不可用时不发布磁盘旧金额。已运行期间验证过的余额可在之后的网络/过期失败时保留，并标注缓存时间；登录账号变化清除旧金额。

## 对话预估用量

从官方完整会话汇总读取真实 Token，累计已记录的尝试、重试与模型生成的摘要压缩；每次按它当时的 Provider ID、模型 ID 计价。分支不重复计算继承用量，其他提供商的用量不计入。

价格来自 [MiMo 官方价格页](https://mimo.mi.com/docs/price)，核对日期 **2026-10-12**。支持已确认价格的 MiMo-V2.5、V2.5-Pro、V2.6-Flash、V2.6-Pro 和 V2.6-Pro-UltraSpeed，分别计算未命中输入、缓存命中输入与输出；使用明确的 CNY/USD，不猜汇率。

这是 Token 费用估算，**不是实际扣费账单**，不含联网插件费用、优惠和历史价格变化。缺失用量、未知模型或无法确认的缓存写入价格标「（部分）」或「—」。不会用账户余额差值代替对话费用。后台新增汇总只包含计数及模型归属，不包含对话正文。

## 自定义提供商

默认 Provider ID 为 `xiaomi`。自动发现 `baseURL` 准确指向 `https://api.xiaomimimo.com/...` 的其他 Provider ID。通过代理使用 MiMo 时，可在 `cordis.patch.yml` 的 `providerIds` 列表追加准确 ID。`openai`、`openai-codex`、`anthropic`、`deepseek` 和 `deepseek-account` 始终排除；已知 Token Plan 地址排除。

## 卸载与更换版本

建议先在余额详情点击「退出登录」，再在 DSH 插件管理器卸载 `dsh-mimo-balance`，完全退出重开即可。模型配置和其他 DSH 凭据保持不变。直接卸载会保留本插件会话和缓存，供再次安装复用；如需离线清理，可在退出 DSH 后删除本插件缓存并用 DSH 凭据管理移除 `DSH_MIMO_CONSOLE_SESSION`，不要删除整个凭据库。

本包与之前的完整版使用同一插件名，**不能同时启用**。更换版本时在插件管理器卸载旧包并安装本包的独立路径；不要覆盖已有 profile 配置。本版不会迁移、撤销或改变旧版已接入的模型凭据。

官方管理器不可用时，可在退出 DSH 后运行 `npm run uninstall:profile`。默认处理 `$DSH_HOME/profiles/desktop`；其他 profile 使用 `-- --profile /absolute/profile/path`。该备用脚本只移除本插件声明及链接，保留其他插件和配置备份。

## 开发与验证

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run check:release
```

GitHub 工作流在 Windows/macOS/Linux 的 Node 22/24 上执行上述检查，不需要小米账号或真实凭据。其云端运行结果只在实际运行后才可确认。源码审查与验证边界见 [REVIEW.md](REVIEW.md)，贡献规范见 [CONTRIBUTING.md](CONTRIBUTING.md)。

MIT 许可证。独立第三方插件，未经小米或 DeepSeek 官方背书；依赖说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
