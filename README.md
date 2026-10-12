# DeepSeek Harness MiMo Balance 1.3.0

为 DeepSeek Harness 桌面版和本地 Web 提供小米 MiMo 按量付费余额查询、账户登录管理及对话用量估算。基于官方插件接口实现。

余额通过小米控制台会话查询，模型调用使用 DeepSeek Harness 中已有的 MiMo 配置。安装前请先完成模型配置。

## 功能

- 当前已选 MiMo 时，输入栏模型名旁只显示总余额；点击金额才显示现金/赠送余额、成功更新时间与刷新按钮。点击外部或按 Escape 收起。
- 底部仅显示「预估用量 ¥…」，分别统计每个对话；当前模型切换不会改写历史调用的计价归属。
- 按准确 Provider ID 判断，支持指向官方按量付费地址的自定义提供商。悬停、待选模型和名字含 MiMo 的其他提供商不会触发显示。
- 首次选择自动查询；成功缓存优先显示，持续选中时后台最多每五分钟自动查询一次。并发刷新合并，切换其他提供商后停止自动刷新。
- 未登录、登录过期、网络错误和超时有明确状态；保留旧缓存时标注时间。没有可用金额就显示「—」，不用模拟值。
- 详情内可退出余额账号并重新登录；退出立即隐藏旧金额、取消未完成登录/刷新，清除本插件会话与缓存。
- 原生主题颜色，保留原模型列表、排序、推理设置和底部数据栏。

## 安装

适用于 **DeepSeek Harness 0.2.0-rc.2** 的桌面版和本地 Web，需要 **Node.js >=22.19**。安装前请完成 MiMo 模型配置。桌面版与 Web 共用后台时，只需安装一次；通过 `dsh web` 单独启动的 Web 使用独立配置目录，需要分别安装。

### 方式一：由 Agent 安装

将下面的指令复制给具有本机文件和命令执行权限的 Agent：

```text
请为本机 DeepSeek Harness 安装 MiMo 余额插件：
https://github.com/zhouchu000/dsh-mimo-balance

1. 检查操作系统、Node.js 和 DeepSeek Harness 版本，
   确认当前后台使用的配置目录（profile）。
2. 阅读仓库 README.md，将源码保存到用户目录下长期保留的位置。
   已有目录先检查来源和本地修改，不覆盖用户文件。
3. 在插件目录依次运行：
   npm ci --ignore-scripts
   npm run build
   npm test
   npm run check:release
   Windows 使用 npm.cmd。
4. 优先通过插件管理器安装并启用 link:源码目录的绝对路径。
   无法操作界面时，确认对应后台已完全退出，再运行：
   npm run install:profile -- --profile "已确认的配置目录绝对路径"
   同名插件指向不同目录时，使用插件管理器更换。
5. 重新打开 DeepSeek Harness 并核对插件已启用。
   选中 MiMo 模型，检查总余额、点击详情和已有对话的底部预估。
   切换其他提供商后，余额应隐藏。
6. 需要小米登录时打开插件登录窗口，由我在本机完成。
   报告已完成的检查；无法访问界面时，说明界面验证尚未完成。
```

命令行安装脚本会备份配置，并添加插件依赖、Bundle 声明和本地链接。默认目录为 `$DSH_HOME/profiles/desktop`；独立 Web 通常为 `$DSH_HOME/profiles/web`。自定义启动目录以实际配置为准，Agent 应显式传入 `--profile`。`DSH_HOME` 未设置时默认使用用户目录下的 `.dsh`。

### 方式二：手动安装

1. 安装 [Node.js](https://nodejs.org/en/download) 的合适 LTS 版本。
2. 从本仓库「Code → Download ZIP」下载并解压，将目录重命名为 `dsh-mimo-balance`。保存到长期保留的位置，确认目录直接包含 `package.json`。
3. 按系统执行下面的准备命令，再将输出的 `link:` 完整路径粘贴到 DeepSeek Harness「插件 → 添加插件」，安装并启用。

**Windows（PowerShell）**

以下示例将源码保存在用户目录下的 `DeepSeek-Harness-plugins/dsh-mimo-balance`：

```powershell
Set-Location "$env:USERPROFILE\DeepSeek-Harness-plugins\dsh-mimo-balance"
npm.cmd ci --ignore-scripts
npm.cmd run build
npm.cmd test
"link:" + (Get-Location).Path
```

**macOS（终端）**

```sh
cd ~/DeepSeek-Harness-plugins/dsh-mimo-balance
npm ci --ignore-scripts
npm run build
npm test
printf 'link:%s\n' "$PWD"
```

安装后完全退出并重新打开 DeepSeek Harness。Windows 可从系统托盘退出，macOS 使用应用菜单中的「退出」；关闭窗口可能只隐藏界面。安装目录需要持续保留。

## 余额登录与使用

先选中已配置的 MiMo 模型，再点击模型名旁的「余额 —」及「登录小米账号」。后台打开独立的 Chrome/Edge/Chromium 窗口，请直接在小米网页完成登录。余额验证成功后保存控制台会话，关闭窗口并更新余额显示。

优先使用本机已安装的 Chrome/Edge；缺少可用浏览器时，在插件目录运行 `npm run setup:browser`（PowerShell 用 `npm.cmd run setup:browser`）。也可在 Bundle 配置中设置 `browserExecutable` 指定浏览器可执行文件。登录窗口位于运行 DeepSeek Harness 后台的电脑上。

插件只复用自己通过 DeepSeek Harness 保存的控制台会话，不读取日常浏览器配置。不同设备首次使用需分别登录；无需向聊天、Issue 或配置文件粘贴 Cookie。

点击总余额打开详情，使用「退出登录」清除本插件保存的控制台会话和余额缓存。随后点击「登录小米账号」即可重新登录；已有余额时也可直接点击「重新登录」。退出期间取消未完成请求。余额登录与 DeepSeek Harness 账号、模型调用配置相互独立。

## 会话与接口边界

余额请求仅由后台执行：`GET https://platform.xiaomimimo.com/api/v1/balance`，认证使用小米控制台 Cookie。该接口**并非官方公开保证兼容的 API**。读取已验证的 `data.balance`、`cashBalance`、`giftBalance` 与 `currency`；字段不符合预期即明确失败，不能把 Credits 当人民币。

本插件只使用 DeepSeek Harness 原有 `credentials` 保存控制台会话引用 `DSH_MIMO_CONSOLE_SESSION`。DeepSeek Harness 当前默认存储为 `$DSH_HOME/.credentials.yaml`，并非系统钥匙串或独立加密库。macOS/Linux 按 DeepSeek Harness 的文件权限保护，Windows 依赖用户目录权限；请同时保护这些本机文件。

原始 Cookie、Token 不返回前端、不记录日志。后台接口只接受回环访问、DeepSeek Harness 官方认证及同源请求标记；不开放凭据读取接口，不使用第三方中转。详见 [SECURITY.md](SECURITY.md)。

非凭据余额缓存位于 `$DSH_HOME/cache/dsh-mimo-balance/balance.json`，含金额、币种、时间及会话摘要标识。重启必须验证会话身份匹配后才恢复金额；未登录、登录过期或凭据服务不可用时不发布磁盘旧金额。已运行期间验证过的余额可在之后的网络/过期失败时保留，并标注缓存时间；登录账号变化清除旧金额。

## 对话预估用量

从官方完整会话汇总读取真实 Token，累计已记录的尝试、重试与模型生成的摘要压缩；每次按它当时的 Provider ID、模型 ID 计价。分支不重复计算继承用量，其他提供商的用量不计入。

价格来自 [MiMo 官方价格页](https://mimo.mi.com/docs/price)，核对日期 **2026-10-12**。支持已确认价格的 MiMo-V2.5、V2.5-Pro、V2.6-Flash、V2.6-Pro 和 V2.6-Pro-UltraSpeed，分别计算未命中输入、缓存命中输入与输出；使用明确的 CNY/USD，不猜汇率。

这是 Token 费用估算，**不是实际扣费账单**，不含联网插件费用、优惠和历史价格变化。缺失用量、未知模型或无法确认的缓存写入价格标「（部分）」或「—」。不会用账户余额差值代替对话费用。后台新增汇总只包含计数及模型归属，不包含对话正文。

## 自定义提供商

默认 Provider ID 为 `xiaomi`。自动发现 `baseURL` 准确指向 `https://api.xiaomimimo.com/...` 的其他 Provider ID。通过代理使用 MiMo 时，可在 `cordis.patch.yml` 的 `providerIds` 列表追加准确 ID。`openai`、`openai-codex`、`anthropic`、`deepseek` 和 `deepseek-account` 始终排除；已知 Token Plan 地址排除。

## 卸载与更换版本

建议先在余额详情点击「退出登录」，再在 DeepSeek Harness 插件管理器卸载 `dsh-mimo-balance`，完全退出重开即可。模型配置和其他 DeepSeek Harness 凭据保持不变。直接卸载会保留本插件会话和缓存，供再次安装复用；如需离线清理，可在退出 DeepSeek Harness 后删除本插件缓存并用 DeepSeek Harness 凭据管理移除 `DSH_MIMO_CONSOLE_SESSION`，不要删除整个凭据库。

更换安装目录或版本时，通过插件管理器卸载现有插件，再安装新目录的 `link:` 路径。保留旧源码目录，可按相同步骤切回。

官方管理器不可用时，可在退出 DeepSeek Harness 后运行 `npm run uninstall:profile`。默认处理 `$DSH_HOME/profiles/desktop`；其他 profile 使用 `-- --profile /absolute/profile/path`。该备用脚本只移除本插件声明及链接，保留其他插件和配置备份。

## 开发与验证

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run check:release
```

本插件使用 DeepSeek Harness 的 `slots`、`modelDirectories`、`sessionProjections`、`connection`、`credentials`、`settings` 和 `webServer` 接口；其他版本需另行验证。GitHub 工作流在 Windows/macOS/Linux 的 Node 22/24 上执行上述检查，结果见 [Actions](https://github.com/zhouchu000/dsh-mimo-balance/actions)。源码审查与验证边界见 [REVIEW.md](REVIEW.md)，贡献规范见 [CONTRIBUTING.md](CONTRIBUTING.md)。

MIT 许可证。独立第三方插件，未经小米或 DeepSeek 官方背书；依赖说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
