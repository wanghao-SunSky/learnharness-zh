# 分享非官方中文实验仓库，并请教 CJK 排版细节改进意向

感谢 Amos Blomqvist 及各位贡献者开发并开源 LearnHarness，这套学习工具在日常使用中非常有帮助。

近期我基于上游 `v0.5.0`（commit `713377f366771e3e4730e6acd1bc290e0ebc6d6e`）整理了一个独立公开的非官方中文实验仓库：https://github.com/wanghao-SunSky/learnharness-zh ，完整保留了上游提交历史、作者与 contributors 归属及 `AGPL-3.0-only` 许可证（合成示例界面预览可直接在该仓库 [README](https://github.com/wanghao-SunSky/learnharness-zh#readme) 查看）。

分支内的改动偏向个人阅读习惯与本地实验：采用局部中文界面直接替换，未做语言开关，部分界面仍保留英文；加入书刊风浅/深色主题、CJK 字体栈、17px 字号、1.8 行距及题目末尾布局；Personal 数据目录与原版隔离且不自动同步；ACP 客户端默认答题把握设为 80（仅为操作默认值，非真实主观置信度）；另含实验性本地 Unix socket ACP 接入，让 T3 等支持表单的客户端共享运行中的本地 Personal 后端（需 Mac 与宿主持续运行，并非托管服务或本项目原生 iOS 应用）。

发帖主要是致谢并分享实验记录，不请求合并整套分支——书刊主题、个人默认项与本地 ACP 留在个人分支即可。想顺带请教两点：
1. 在保持上游默认外观的前提下，小范围的 CJK 字体与行高排版微调是否欢迎？
2. 界面翻译部分我愿直接对齐 #407（issue）与 #457（PR），避免引入竞争性的 i18n 设计。

若此类分享更适合转至 Discussion 或并入 #407 讨论，请随时告知，再次感谢维护！
