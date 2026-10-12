# Third-party notices

本项目依赖通过 npm 按锁文件安装，不将 node_modules 或第三方运行时复制进源码交付包。各依赖的完整许可证保留在各自 npm 包中。生成的客户端将 React/react-dom 设为外部依赖，由 DeepSeek Harness 提供。

| 直接依赖 | 用途 | 许可证 | 上游 |
|---|---|---|---|
| Playwright | 本机控制台登录浏览器 | Apache-2.0 | https://github.com/microsoft/playwright |
| React / React DOM | DeepSeek Harness 客户端扩展、测试 | MIT | https://github.com/facebook/react |
| esbuild | 客户端构建 | MIT | https://github.com/evanw/esbuild |
| jsdom | 匿名 DOM 测试 | MIT | https://github.com/jsdom/jsdom |

DeepSeek Harness 的接口适配参照 DeepSeek Harness 公开源码与文档；其许可证为 MIT，Copyright (c) 2026 DeepSeek。本项目不包含 DeepSeek Harness 运行时。MiMo 与 DeepSeek 的名称属于相应权利人；不提供官方商标或图形资源。

自动检查使用 GitHub 官方 [actions/checkout](https://github.com/actions/checkout) 与 [actions/setup-node](https://github.com/actions/setup-node)，固定到已核对的提交；工作流不把这些 Action 的实现复制进本项目。
