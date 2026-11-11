## 验证记录与限制

- **已验证项（源码提交 `e5900f6`）**：已完成类型检查、163 项定向 UI 与设置测试、12 项 ACP mock 测试，以及私有路径与凭据定向扫描；远程 CI（[Actions Run #43020448357](https://github.com/wanghao-SunSky/learnharness-zh/actions/runs/43020448357)）已通过，该结果仅对应源码提交 `e5900f6`。
- **未覆盖限制**：未运行完整上游测试套件，未执行新一轮生产打包，未在 Windows 与 Linux 上做视觉核对，也未在真实 iPhone 上完成端到端实测；展示截图基于合成 TCP 示例与桌面浏览器手机宽度预览生成，并非真机验收。

```sh
npm ci
npm run typecheck
NODE_ENV=test node --import tsx --test tests/render-cards.test.tsx tests/render-composer.test.tsx tests/render-graph-chrome.test.tsx tests/render-minimal-home.test.tsx tests/render-new-session.test.tsx tests/render-phase-divider.test.tsx tests/render-plan-block.test.tsx tests/render-sidebar.test.tsx tests/settings-pure.test.ts
npm ci --prefix acp
npm run --prefix acp build
npm test --prefix acp
```
