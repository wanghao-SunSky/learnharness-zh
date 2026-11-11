# LearnHarness Personal 实验性本地 ACP 转接器

本目录提供一个运行在 macOS 本机的实验性 ACP（Agent Client Protocol）转接器，用于让支持表单提问（`elicitation.form`）的客户端直接读写**正在运行的 `LearnHarness Personal` 课程后端**。

它不会另起一套教学引擎，也不会复制课程数据库，而是复用桌面端现有的题目乱序、判分规则、课程历史与模型配置。开发时基于 T3 Code `0.1.7` 对接测试；其他客户端若要接入，必须支持 ACP 表单能力。

## 运行架构与边界

- **本地通信路径**：打包后的 `LearnHarness Personal` 启动时，会在 `~/Library/Application Support/LearnHarness Personal/acp/bridge.sock` 创建本地 Unix socket（目录权限 `0700`，socket 权限 `0600`），仅放行课程列表、单课读取/流式订阅及提交消息/答案这几个接口（`GET /api/chats`、`GET /api/chats/:id`、`GET /api/chats/:id/stream`、`POST /api/chats`、`POST /api/chat`），桌面访问令牌只在本机应用进程间使用，不向客户端导出模型密钥。
- **安全前提**：同一系统登录用户下的进程均可访问该 Unix socket，它用于隔离外部网络而非防备同账号下的其他本地软件。切勿把后端改成无鉴权的公网 HTTP 端口。
- **仅限 Personal 打包壳**：纯网页开发命令 `npm run dev` 不会启动 `bridge.sock`，必须先构建并打开 `LearnHarness Personal` 桌面应用。上游原版 `LearnHarness` 使用独立的数据目录（`~/Library/Application Support/LearnHarness/data`），本转接器不会连接或同步原版数据。

## macOS 安装与客户端配置

1. 先构建并打开 `LearnHarness Personal`，在桌面端“设置 → 模型服务”中自行配置可用模型（本仓库不内置任何指定线路或密钥）。
2. 在仓库根目录构建、测试并安装独立运行时：

```sh
npm ci --prefix acp
npm run --prefix acp build
npm test --prefix acp
node acp/install-runtime.mjs
command -v node
```

`install-runtime.mjs` 会把零外部依赖的 `bridge.mjs` 与 `core.mjs` 复制到 `~/Library/Application Support/LearnHarness Personal/acp/runtime/`（无需携带 `node_modules`），并在终端打印 `bridge.mjs` 的绝对路径。

3. 在客户端（如 T3 Code）的 ACP Provider 设置中填入：
   - **可执行文件**：`command -v node` 输出的 Node 绝对路径；
   - **启动参数**：`install-runtime.mjs` 输出的 `.../acp/runtime/bridge.mjs` 绝对路径。

图形界面启动的客户端往往不继承终端 `PATH`，也不一定会展开 `~`，请务必填写完整绝对路径。可通过环境变量 `LH_ACP_SOCKET` 与 `LH_ACP_STATE_DIR` 覆盖默认 socket 和会话别名目录（默认会话映射保存在 `~/Library/Application Support/LearnHarness Personal/acp/sessions`）。

## 模型归属规则

连接成功后，转接器对客户端显示名称为 `LearnHarness 中文学习`，并只暴露一个逻辑模型项 `LearnHarness · 课程原有模型`（`learnharness-configured`），不支持在客户端侧直接切换底层模型：

- **已有课程**：始终沿用该课程创建或桌面端已绑定的固定模型；
- **新建课程**：自动使用 `LearnHarness Personal` 当前的全局默认模型。修改桌面端全局默认模型只对之后新建的课程生效，不会改动已有课程。

## 课程交互与个人默认取舍

- **新建与恢复**：可在客户端会话列表中直接加载已有的桌面课程，也可以直接输入学习主题新建课程（仅在首次发送有效学习文本时才会在后端真正建课，客户端健康检查不会产生空课）。
- **连续答题流**：单次请求在课程仍有待答题时会保持活跃；提交一道题后，转接器会自动流式输出老师讲解，并在出现下一道题时自动弹出新表单，无需每题手动唤醒。
- **精简表单与默认把握程度**：为减少手机端翻页和输入步骤，ACP 表单只保留核心作答项，默认省略桌面端可选的“解题思路”与“阅读随想”。客观题（`quiz`）在表单未传把握程度时默认填入 `80`（范围 0–100）；若选择“暂时不知道”，则按上游规则不记录把握程度。**注意：`80` 纯属个人省事设置，不代表真实主观置信度评估。**
- **中断、刷新与跨端协同**：
  - 点击停止/取消只会结束当前客户端等待，未答题目仍保留在课程中；重新发送 `继续`（或 `continue`、`/continue`）即可再次拉起表单。
  - 发送 `/refresh` 可主动同步最新课程记录；当上一轮后端生成报错且无待答题时，发送 `/retry` 可触发重试。
  - 若等待作答期间已在 Mac 桌面端答完同一题，转接器会检测到后端题目变更并自动撤回客户端挂起表单，避免重复提交。

## 手机远程接入与已知限制

- **远程连接由客户端负责**：手机访问需保持 Mac 开机、联网且同时运行 `LearnHarness Personal` 与客户端宿主服务，并由用户单独配置客户端自身的远程登录与认证通道。本仓库不提供内网穿透、账号体系或原生 iOS 安装包。
- **呈现能力限制**：客户端仅接收纯文本与表单结构，不会呈现桌面端的书刊浅色/深色排版；数学公式渲染效果以及工具调用原始 JSON 的展示方式取决于客户端自身（T3 当前的公式与原始 JSON 显示问题未在本项目中修改）。
- **功能与同步限制**：客户端只支持纯文本输入，上传附件、操作知识图谱和修改高级设置仍需回到桌面端；桌面课程标题与客户端会话标题不会双向同步；网络流已按 UTF-8 字符串流解码以保证跨分包中文和 emoji 不断字，但如果早期客户端历史消息中已存有损坏乱码，转接器不会自动改写历史数据。

## 维护与测试说明

- 修改 `acp/core.ts` 后，需执行 `npm run --prefix acp build` 重新打包 `acp/core.mjs`，运行 `npm test --prefix acp`（或 `node --test acp/bridge.test.mjs`），再执行 `node acp/install-runtime.mjs` 更新运行时并重启客户端持有的 ACP 进程。
- 若修改了 `electron/main.cjs` 或 `electron/acp-bridge.cjs`，需重新构建 `LearnHarness Personal` 桌面应用；`acp/package-shell.mjs` 仅用于开发阶段向显式指定的本地 `LearnHarness Personal.app` 副本热更新壳文件，不属于常规安装步骤。
- `acp/bridge.test.mjs` 中的 12 项测试使用合成课程夹具、模拟模型流与临时本地 socket 验证协议与状态机，不替代真实 iPhone 或第三方模型服务的端到端测试。
