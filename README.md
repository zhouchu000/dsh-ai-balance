# DeepSeek Harness MiMo Balance

DeepSeek Harness 桌面版和本地 Web 的小米 MiMo 余额与用量估算插件。

## 功能

- 模型名旁显示总余额，点击查看明细、刷新或退出登录。
- 对话底部显示 Token 费用估算。
- 仅选中 MiMo 时显示，支持深浅主题，每五分钟自动刷新。

## 安装

适用于 DeepSeek Harness **0.2.0-rc.2**，需要 **Node.js >=22.19** 和已配置的 MiMo 模型。

### 让 Agent 安装

复制下面这段给能操作本机的 Agent：

```text
帮我给 DeepSeek Harness 安装这个插件：
https://github.com/zhouchu000/dsh-mimo-balance
按 README 安装并验证，保留现有配置。小米登录由我在本机完成。
```

### 手动安装

从「Code → Download ZIP」下载源码，解压到长期保留的目录。以下示例使用 `DeepSeek-Harness-plugins/dsh-mimo-balance`。

**Windows（PowerShell）**

```powershell
Set-Location "$env:USERPROFILE\DeepSeek-Harness-plugins\dsh-mimo-balance"
npm.cmd ci --ignore-scripts
npm.cmd run build
"link:" + (Get-Location).Path
```

**macOS（终端）**

```sh
cd ~/DeepSeek-Harness-plugins/dsh-mimo-balance
npm ci --ignore-scripts
npm run build
printf 'link:%s\n' "$PWD"
```

在 DeepSeek Harness「插件 → 添加插件」粘贴输出的 `link:` 路径，安装并启用，然后完全退出重开。安装目录需要保留。

### 命令行安装

无法操作插件界面时，退出对应后台，在插件目录执行（Windows 使用 `npm.cmd`）：

```sh
npm run install:profile -- --profile "实际配置目录的绝对路径"
```

配置目录通常是 `$DSH_HOME/profiles/desktop` 或 `$DSH_HOME/profiles/web`；`DSH_HOME` 默认是用户目录下的 `.dsh`。共用后台的桌面版和 Web 安装一次即可，独立后台分别安装。已有同名插件指向其他目录时，通过插件管理器更换。

## 使用

选中 MiMo，点击「余额 — → 登录小米账号」，在本机窗口登录。详情中可手动刷新、退出和重新登录。

底部费用按 [MiMo 官方价格](https://mimo.mi.com/docs/price) 和对话 Token 估算，不是实际账单。未知价格或缺失记录会标为「部分」或「—」。

## 卸载

先在余额详情退出登录，再从插件管理器卸载并重启。换版本时保留旧源码目录，可重新安装其 `link:` 路径切回。

## 说明

余额使用小米控制台的非公开接口，登录会话保存在 DeepSeek Harness 本地凭据文件中。存储与接口细节见 [安全说明](SECURITY.md)，验证范围见 [审查记录](REVIEW.md)。Windows 桌面界面尚未实机验证。

MIT 许可证。开发及配置说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。
