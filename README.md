# LearnHarness 中文阅读实验版 / Chinese reading edition

An independent, unofficial derivative of [LearnHarness](https://github.com/amosblomqvist/learnharness), focused on Chinese reading typography and a personal desktop-to-phone learning workflow. **This is not an official release, a complete localization framework, or a native iOS app.**

Based on upstream **v0.5.0**, commit `713377f366771e3e4730e6acd1bc290e0ebc6d6e`. Original authorship and **AGPL-3.0-only** licensing are retained. See [LICENSE](LICENSE) and the [original upstream README](README.upstream.md).

## 中文说明

这是基于 LearnHarness 的独立中文阅读实验版：保留上游的教学、练习、题目判分和知识图谱流程，调整中文界面与排版，并提供实验性的 ACP 转接，让支持表单的客户端访问同一节课。

### 与原版有什么不同

| 项目 | 本仓库的实现与边界 |
| --- | --- |
| 中文界面 | 翻译主要学习页面；高级设置和部分菜单仍有英文。目前直接替换文案，没有语言切换，不能称为完整 i18n。 |
| 阅读外观 | 纸白/酒红的书刊浅色与深色主题，中文字体回退、字号、行距和阅读宽度调整。属于个人设计选择，不代表上游方向。 |
| 教学卡片 | 题目位于正文末尾，桌面可并排显示选项与思路，窄屏纵向排列；桌面保留阅读随想与解题思路。 |
| 手机访问 | ACP 转接向 T3 等客户端提供文字和问答表单；不是将桌面书刊界面搬到手机，也不是官方网页版。 |
| 手机作答 | 提交后自动跟随讲解并显示下一题；思路/随想默认不填，把握程度默认 80。选“不知道”时不记录把握程度。这是自用取舍，不建议当成真实的主观置信度数据。 |
| 打包 | 应用名 LearnHarness Personal，独立数据目录；禁用官方自动更新，避免覆盖定制版。仅提供源码，没有官方签名、公证或安装包。 |

### 数据是否同步

**原版与 Personal 版相互独立。** macOS 默认目录分别是：

- 原版：`~/Library/Application Support/LearnHarness/data`
- 本版：`~/Library/Application Support/LearnHarness Personal/data`

本仓库不包含任何课程、学习记录、账号、模型密钥或预配置线路，也不会自动复制原版数据。曾复制过的数据也只是快照，不会持续同步。不要让两个后端同时写一个目录。

**T3 ↔ Personal** 使用同一个运行中的 Personal 后端和课程记录，不另外复制学习数据库。T3 对话标题与课程标题尚未联动；T3 空闲时可能需要 `/refresh` 更新记录。Mac 必须联网且保持运行，Personal 与远程客户端服务必须打开。

### 安装与构建

使用当前维护的 Node.js 和 npm；CI 使用 Node 26。macOS Apple Silicon 是本版主要验证环境。

```sh
git clone https://github.com/wanghao-SunSky/learnharness-zh.git
cd learnharness-zh
npm ci
npm run desktop:dev
```

自行在设置中配置兼容的模型服务。本项目不提供模型额度、账号或访问凭据，也不保证任何第三方模型线路可用。

构建 macOS ARM64 自用包：

```sh
npm run desktop:personal
codesign --force --deep --sign - "dist-personal/mac-arm64/LearnHarness Personal.app"
```

生成目录为 `dist-personal`。这是本地自签名，不是 Apple 公证；构建所需工具见[上游构建文档](docs/desktop-release.md)。清理脚本只删除本项目的 `dist-personal` 与 `.next/standalone`。Windows/Linux 的本版字体和打包尚未验证。

### ACP 与手机接入

见 [ACP 接入说明](acp/README.md)。链路是：

```text
手机 T3 → T3 的已认证远程连接 → Mac 上的 ACP 转接器
       → Personal 的本地 Unix socket → 同一课程后端 → 你配置的模型服务
```

没有新增公网学习服务，也没有原生 iOS 安装包。Unix socket 仅当前系统用户可访问，ACP 只转发课程相关接口，不导出模型凭据。远程传输、登录和设备授权由客户端负责，不能仅把 Personal 的端口暴露到公网。

### 验证与已知限制

- ACP 回归覆盖选项排序/判分、默认置信度、隐藏信息过滤、跨端作答、防重复、取消恢复、连续六题、会话恢复及分段传输的中文/emoji 解码。
- 中文 UI 使用已有渲染测试与定向检查；具体发布检查记录见 [验证记录](docs/validation.md)。不将模拟后端测试描述为真实手机端到端验收。
- T3 的公式显示、工具记录中的原始 JSON、移动端布局由 T3 控制，本项目未修复其渲染器。已保存的旧乱码不会自动重写。
- 浏览器手机尺寸预览不代表全部 iPhone 场景通过；知识图谱、附件和高级设置仍主要使用桌面版。

### 与上游协作

本仓库是个人实验的可审阅源码，不请求上游合并整套界面或 ACP 行为。优先讨论可独立贡献的 CJK 字体/排版改善，再对齐 [上游 i18n 提案 #407](https://github.com/amosblomqvist/learnharness/issues/407) 的语言设置与翻译结构。书刊主题、ACP 集成和默认 80 分行为保持独立。

本版问题请提交到[本仓库 Issues](https://github.com/wanghao-SunSky/learnharness-zh/issues)，不要把本版独有的问题当作上游缺陷。没有承诺与上游最新版本持续同步。

## English summary

This source fork contains a partial Chinese UI, CJK-oriented reading styles, a book-like light theme, responsive question layouts, and an experimental local ACP adapter. It deliberately uses a separate Personal data directory. Phone access uses a compatible authenticated remote client connected to the running Mac; there is no native iOS application or hosted service here.

It is not an upstream-ready localization patch: strings are still inline, some UI remains English, and defaults reflect one personal workflow. The proposed upstream path is small, independently reviewable typography fixes followed by localization work aligned with issue #407. The ACP adapter and confidence defaults are separate experiments. No personal data, provider credentials, routing configuration, or signed binaries are included.
