# LearnHarness 中文版

本项目基于开源桌面学习应用 [LearnHarness](https://github.com/amosblomqvist/learnharness) 制作，加入了常用学习界面的中文文字适配、书刊式浅深色界面美化，以及 ACP 协议接入。你可以在桌面端直接专注学习，也可以通过外部客户端接力同一门课程。

**[下载 macOS 安装包（Apple Silicon .zip）](https://github.com/wanghao-SunSky/learnharness-zh/releases/download/v0.5.0-zh.1/LearnHarness-Personal-0.5.0-zh.1-mac-arm64.zip)**

![深色书刊阅读界面](docs/screenshots/desktop-dark.png)
*深色书刊阅读界面*

## 主要改动

- **中文文字适配**：学习导航、答题与课程交互文案改为中文，重调中文字号、行高与混排断行。
- **书刊式浅深色美化**：打磨浅色与深色两套纸感阅读配色和排版层次，长时间阅读更清爽耐看。
- **ACP 协议接入**：支持在 T3 等客户端中延续同一门课程，手机端可直接阅读课程文字并提交答题表单（使用时需保持 Mac 端应用与客户端宿主运行），配置说明见 [acp/README.md](acp/README.md)。

## 下载与使用

1. 下载上方适用于 **macOS Apple Silicon** 的 `.zip` 压缩包，解压后将应用拖入「应用程序」文件夹。
2. 安装包使用本机 ad-hoc 签名；首次打开若提示系统拦截，前往「系统设置 -> 隐私与安全性」点击底部的「仍要打开」即可。
3. 启动应用后，在「设置」中配置好你的模型接口，即可开始创建和学习课程。

<details>
<summary>从源码自行编译</summary>

在仓库根目录下（推荐使用 Node.js 26）依次执行：

```bash
npm ci
npm run desktop:personal
```
</details>

## 致谢与协议

感谢原作者 Amos Blomqvist 与各位 contributors 开发并开源上游项目 [learnharness](https://github.com/amosblomqvist/learnharness)（本版本基于 `v0.5.0` 制作）。本项目延续 [AGPL-3.0-only](LICENSE) 协议开源；遇到问题或有改进建议欢迎提交至本仓库 [Issues](https://github.com/wanghao-SunSky/learnharness-zh/issues)。
