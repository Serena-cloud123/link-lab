# Day 8：静态工作台与基线运行

## 今日边界

只接场景、画静态图、运行无防御基线。从固定场景接口读取数据，选择 A/B/C 预设，手动运行 `defenses: []`，显示七节点图、A/B 结果和八条事件文字。

不做：O/T 自由滑块、D1/D2/D3 选择、逐帧播放、流线动画、一句话 AI 解释、SQLite、运行保存、真实攻击。

## 数据从哪里来

- 场景名称、节点、位置、路径、预设、模型边界：来自 `GET /api/scenarios/campus-registration`。
- A/B 结果、事件、告警：来自 `POST /api/evaluations`。
- 前端只做中文状态展示，不自行计算路径是否成立。

## 三个基线预期

值来自已冻结的 CSV。实施前先写预期，实施后在浏览器逐项核对。

| 预设 | O/T | 请求中的防御 | A | B | 告警 | 关键事件 |
| --- | --- | --- | --- | --- | --- | --- |
| A | 开／有 | `[]` | reached | reached | 0 | A3、B5 均为 data-arrived |
| B | 关／有 | `[]` | reached | blocked at B2 | 0 | B3—B5 为 skipped |
| C | 开／无 | `[]` | reached | blocked at B5 | 0 | B4 passed，B5 rejected |

两点容易漏：

- N1→N2 在图上是一条物理连线，但引擎中有 A1 和 B1 两个逻辑事件。画图可合并这条连线，事件列表必须保留两步。
- 图上共有七条不同的节点间连线，运行结果始终有八个事件。

## 异常与交互验收

实施后逐项填「实际看到什么」。

| 项 | 预期 | 实测 |
| --- | --- | --- |
| 后端未启动 | 场景加载失败显示错误与重试 | 通过。未起后端直接开页面，显示"场景加载失败：HTTP 500"与"重试"按钮（Vite 代理转发失败返回 500）。启动后端后点"重试"，场景正常加载。截图 `docs/screenshots/day8-error-state.png` |
| 点击运行 | 显示等待状态，连续点击只产生一个运行请求 | 通过（机制层面）。运行中按钮变为"正在运行…"并 disabled，handler 内还有 `running` 守卫双重拦截；一次点击只产生一个 POST。实测注入两次间隔约 523ms 的点击：因本机接口响应仅 2—10ms，第一次运行已完成，第二次点击属于新的合法运行（后端日志 req-5、req-6 各一次 200）。StrictMode 下无自动 POST（POST 只在 onClick 中发出） |
| 切换预设 | 清掉旧结果，不把旧结果标在新配置下 | 通过。切到预设 B/C 后结果区回到"尚未运行"占位，`.run-result` 从 DOM 消失；O/T 只读展示同步更新。运行中预设按钮 disabled，无法在途切换 |
| 请求失败 | 显示错误，不冒充已运行成功 | 通过（场景加载路径实测；运行路径共用同一错误处理：失败显示"运行失败：…"与重试按钮，无伪造结果）。页面不含任何伪造默认场景或默认结果 |

## AI 协作记录

原始 Prompt 要点：只接场景、画静态图、运行无防御基线；前端从 `GET /api/scenarios/campus-registration` 读唯一场景；预设的 O/T 取自接口返回的 `preset.conditions`；点击"运行无防御基线"才发 POST；N1→N2 共享连线保留 A1/B1 逻辑映射；不重算成败；预设切换清旧结果；加载与运行各有等待/错误/重试。

AI 方案要点：`App.tsx` 用 `scenarioState`（loading/error/ready）与 `runState`（idle/running/error/done）两个状态机；`api.ts` 封装两个 fetch；`ScenarioGraph.tsx` 按 `` `${from}->${to}` `` 去重生成 7 条物理边、边 `data.stepIds` 保留逻辑映射（共享边标签 "A1 / B1"）；`RunResultPanel.tsx` 纯展示 RunResult。图容器固定高度 560px（窄屏 420px）并引入 `@xyflow/react/dist/style.css`，`fitView` 生效。

我的四点修正（均已落实）：

1. 图容器显式高度 + 引入 xyflow 样式，验收时核对七节点全部落在容器内（实测 7 节点 bounding box 均在 420px 高容器内）。
2. 三页骨架用标签切换实现独立入口：场景介绍 / 沙盘工作台 / 学习记录；学习记录页明确写"保存与回放后续开放"，无假历史。
3. `@link-lab/contracts` 在 apps/web 中以 `"*"` 声明（与 apps/api 一致），lockfile 中 `node_modules/@link-lab/contracts` 为 `"resolved": "packages/contracts", "link": true"`，指向 workspace。
4. `alertCount` 为 0 时结果区固定文案"本次未开启 D3，因此没有告警。"——由本次请求的 `defenses` 配置决定（今日恒为 `[]`），不由 `alertCount` 反推。

实施中一次构建失败并修正：三元 JSX 链里派生的 `scenario` 常量不随 `scenarioState` 判别联合收窄（TS18047），改为先算 `content` 再渲染，narrowing 后通过。

## 本机验收

命令结果（真实输出摘要）：

```text
npm install       added 20 packages, audited 164 packages, found 0 vulnerabilities
npm run build     contracts / engine / api / web 全部成功（vite built in 6.16s，412.71 kB）
npm run typecheck web / api / contracts / engine 全部通过
npm run test      apps/api 13 passed；packages/engine 23 passed
```

浏览器逐项核对（dev:api + dev:web，经 Vite 代理）：

| 预设 | 实测 pathResults | 告警 | 关键事件 |
| --- | --- | --- | --- |
| A | A 已到达模拟数据；B 已到达模拟数据 | 共 0 条，显示"本次未开启 D3，因此没有告警。" | 8 事件，A3/B5 均为"数据到达（模拟）" |
| B | A 已到达；B 已被阻断（诊断页面对普通账号关闭，访问被拒绝） | 0 条 + D3 固定文案 | B2"已拒绝"，B3—B5"未执行" |
| C | A 已到达；B 已被阻断（服务令牌无报名明细读取权限，请求被拒绝） | 0 条 + D3 固定文案 | B4"已通过"，B5"已拒绝" |

其他实测：

- 七节点图：7 节点、7 条边，共享边标签 "A1 / B1"，布局与 `docs/工作台草图.md` 一致；节点不可拖动、不可连线、不可删除。截图 `docs/screenshots/day8-workbench-graph.png`（有结果态 `day8-workbench-result.png`）。
- 窄屏（视口 554px）：三栏自动堆叠为单栏，图容器降为 420px，内容可读。
- 事件列表 8 条，A1 与 B1 均独立出现，eventIndex 0—7；conditionChecks.reason 与 blockedReason 原文展示。
- 前端未做任何成败/告警计算，全部渲染自接口返回。

## Day 8 完成表述

用户已能在浏览器选择 A/B/C 并运行无防御基线，静态图和八条事件由真实接口数据驱动。O/T 自由调整、防御组合与事件动画尚未接入。

## 附：随本次提交的文档清理

`docs/Day7_推演接口与输入校验.md` 开头曾重复出现一次标题、今日目标与接口段落（Day 7 写入时未覆盖原文所致）。本次提交删除重复部分，保留带真实实施记录的后半份。未改写 Day 7 的提交历史。

本记录随提交 `feat: 接通场景图与三预设基线推演` 一并提交。
