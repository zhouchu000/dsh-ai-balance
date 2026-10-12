# DeepSeek Harness MiMo Balance

DeepSeek Harness 的小米 MiMo 余额与用量查询插件。

## 功能

- 输入框旁显示Mimo账户总余额，单击可查看详细信息，余额每5分钟自动刷新。
- 对话底部数据栏显示单对话费用估算。
- 仅选中 MiMo 模型时显示，不影响其他模型使用。

## 提示

mimo新用户注册可以参与邀请活动，邀请/被邀请均可获得¥10的赠金用于API消费，上限¥300。

可在闲鱼购买代邀请，¥20可以获得¥100的赠金，有效期40天（非广，建议小号使用，存在一定风险）

mimo模型相较于deepseek开销较低，并且对dsh适配度较好

## 安装

适用于 DeepSeek Harness **0.2.0-rc.2**，需要 **Node.js >=22.19** 和已配置的 MiMo 模型。

### 让 Agent 安装

推荐直接使用DSH安装，只需输入下面提示词，完成后重启：

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

在对话框选中插件，点击「余额 — → 登录小米账号」，在本机窗口登录。详情中可手动刷新、退出和重新登录。

底部费用按 [MiMo 官方价格](https://mimo.mi.com/docs/price) 和消耗 Token 估算。

## 卸载

在余额详情退出登录，再从插件管理器卸载并重启。换版本时保留旧源码目录，可重新安装其 `link:` 路径切回。

## 说明

由于小米未开放公开余额查询接口，本项目使用小米官方非公开接口。
需登录小米账号，存在一定风险（如无法正常使用、数值不正确等），开发者不承担任何风险。
小米账号登录信息保存在本地

MIT 许可证。开发及配置说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。
