# Day 19：正式录制

## 起点版本

- 起点 HEAD：`23bd506`（`docs: Day 18 复现数据更新为整屏录制第二遍`），与 origin/main 同步，工作区干净
- Day 18 功能验收提交：`fb87729`
- Day 18 复现目录实际克隆自：`a94c313`。该时点远程 HEAD 已是文档提交 `a94c313`，`git diff --name-only fb87729..a94c313` 仅含 `docs/` 与 `evidence/`，应用代码与 `fb87729` 完全相同
- Day 18 文档与技术文档 §8.3 原写「复现目录 HEAD 为 fb87729」有误，本轮已更正为实际值 `a94c313`

## Day 19 补充：重启后逐字段核对

Day 18 文档保留了「当时只证明记录可打开，未逐字段核对」的历史结论，本节是今天新做的验证，不改写原结论。

- 使用的复现目录和数据库：`D:\ago\link-repro-day18`，`apps\api\data\link-lab.db`（Day 18 第二遍的原库，未新建、未删除）。以 `npm start --workspace @link-lab/api` 非监视模式启动，`DATABASE_PATH` 显式指向该文件
- 运行 ID：`4ac93071-dbda-4115-9e4c-eaa7ed9cbd11`，`savedAt` = `2026-11-10T12:37:25.364Z`，即 Day 18 第二遍七步第 6 步保存的那条
- 重启前读取：保存原始响应到 `D:\day19-assets\run-before.json`（1826 字节）与 `learning-before.json`（1975 字节）
- 重启前字段：`scenarioVersion` 1；`input` 为预设 A、O=open、T=granted、`defenses:["D1"]`；`events` 8 条；路径 A `blocked`、路径 B `reached`；`alertCount` 0；`explanation` 为「路径 A 在 A3 被阻断（D1 已开启，管理导出接口拒绝请求），但路径 B 仍到达模拟数据；本次未产生告警。」；`explanationSource` template、`explanationVersion` 1
- 重启前学习记录：`runId` 一致；`predictions` = `{"Q1":"0","Q2":"2","Q3":"0"}`；`feedbacks` 3 条
- 重启后读取：同一窗口、同一 `$runId`，重新请求两个接口
- 运行快照是否逐字段一致：**是**。`runBeforeRaw -ceq runAfterRaw` 为 `True`（1826 字节对 1826 字节，字符串完全相等）
- 三题答案与反馈是否一致：**是**。`learningBeforeRaw -ceq learningAfterRaw` 为 `True`（1975 字节对 1975 字节）
- POST 核对结果：`status` = `match`，`recordScenarioId` 与 `currentScenarioId` 同为 `campus-registration`，`recordScenarioVersion` 与 `currentScenarioVersion` 同为 1
- 核对后原记录是否不变：**是**。运行记录 `True`，学习记录 `True`

比对方法说明：直接比较两次 HTTP 响应的原始 JSON 字符串（`-ceq`），而非解析后逐字段对比，可避免重新序列化造成的假差异。首轮请求因未带 `Content-Type` 返回 415 `FST_ERR_CTP_INVALID_MEDIA_TYPE`，补 `-ContentType "application/json"` 后正常，那次 415 的请求未真正执行核对。

## README 修订与录制提交

README 共修四处：

1. 目录结构表 `apps/web` 行：原「三页骨架，静态图与基线运行」已严重过期，改为如实描述七节点画布、事件下标驱动流线、O/T 两档滑块、三防御、同条件对比、三题与学习记录、只读回放与核对
2. 目录结构表 `apps/api` 行：补上运行保存与读取、学习记录、显式核对
3. 末段：原「本阶段未实现…历史列表、只读回放与同版本显式核对已实现」自相矛盾，改为分明列出「已实现」与「未实现」
4. 干净目录复现段补一条：8 分 25.9 秒是该次成功流程实测值，含当次克隆下载；另一遍 14 分 26.7 秒保留在 Day 18 文档；不能据此承诺任何机器任何网络都在 10 分钟内完成

另修正两处 HEAD 笔误：

- `docs/Day18_最终版复现.md`：复现目录 HEAD 由 `fb87729` 更正为实际的 `a94c313`，并说明两者应用代码相同
- `docs/技术文档_初稿.md` §8.3：同上更正，并加上「Day 19 补做重启后逐字段核对」的指向

README 另有一次更新，发生在本文档定稿之后：

5. 「当前阶段」段由「Day 18：最终版复现」改为「Day 19：功能已冻结，进入交付」，补入 Day 19 重启后逐字段核对的结论（原始响应逐字节一致、显式核对返回 match、核对后记录不变），并指向 `docs/Day19_正式录制.md` 与 `evidence/README.md` 的四条 Prompt 链。提交 `bfb8241`。复现数据与局限未改动，仍指向 Day 18 实测记录

一处未修正的笔误：提交 `bfb8241` 的信息正文把「四条 Prompt 链」误写为「四人份 Prompt 链」。该提交已推送，不能 amend，未追加修正提交；README 正文写的是「四条 Prompt 链」，内容正确。如实记录，不作修饰

功能代码未改动，仍以 `fb87729` 的复现结果为依据。

## 视频检查

- 文件：`D:\ago\演示视频.mp4`，仓库外，不纳入 Git
- 总时长：339 秒（5 分 39 秒），在 5—8 分钟区间内
- 分辨率：1840×1080。高度符合 1080p，宽度不是标准 1920，画面比例为 1.70:1（标准 16:9）。未修正，如实记录
- 字幕：已烧进画面，播放器无法关闭。全片静音，无旁白
- AI 协作段展示内容：链 04 中 Day 17 的四轮往返，画面为 VSCode 打开 `docs/Day16_匿名试用记录.md` 的七条问题，再切至 Trae 里四条 Prompt 与对应回复。取自 `evidence/iterations/04_原始对话_Day15-18.md`
- AI 协作有效时长：录制时未计时，本次未测量，不作「已达标」结论
- 录制方式：一镜到底整屏录制，画面依次为浏览器、VSCode（Day 16 试用记录七条问题）、Trae（Day 17 四轮 Prompt 往返）
- 模型边界与模板来源：片尾字幕含「结果只表示本模型中路径是否到达模拟数据，不代表真实系统已经安全」「攻防因果教学沙盘 · 虚构场景，仅作教学演示」；一句话解释在功能段字幕标注为规则模板生成