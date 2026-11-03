# Day 11：事件播放与规则状态可视化

## 今日边界

只消费现有 RunResult，不修改规则和接口。工作台按 `eventIndex` 播放八条事件，显示对应的静态状态及白名单动画。残余路径与条件只引用 `pathResults`、`events`、`conditionChecks`。

不做：数据库、AI API、保存、回放、模板解释落库。今日展示的条件理由与残余路径说明来自引擎已有数据，不称为「已落库的 AI 解释」。

## 显示规则

播放下标只取 `RunResult.events` 的 0—7。播放、暂停、上一步、下一步、跳转都只改变当前下标；动效时长不能产生新的业务事件或改写结果。

| 引擎事件 | 工作台展示 | 必须同时保留的文字 |
| --- | --- | --- |
| passed | 当前步骤的主流线经过对应边 | 步骤、起终节点、已有条件检查 |
| skipped | 该步骤没有活动流线；底图连线仍可辨认 | 「未执行」及此前被拒的步骤 |
| rejected | 活动流线在检查点停止并轻微回弹 | 被拒位置、所有未满足的检查理由 |
| data-arrived | 活动流线穿过终点，到达 N7 | 「报名明细已到达（模拟）」 |
| 事件带 alert | 从 `alert.interfaceNodeId` 发侧向脉冲；主流线状态照旧 | 「检测到敏感请求，未自动阻断」 |

关闭动画或系统设置减少动态效果时，直接显示同一事件的最终静态状态，文字与节点、边状态不得缺失。

三个检查点：B2 的 O 拒绝发生在 N4；A3 的 D1 护栏在 N3→N7；B5 的 T/D2 检查在 N6→N7。B5 若 T 无权限且 D2 开启，要显示两条未满足理由，不能只画一个「D2 阻断」。

## 四组人工预期

| 配置 | 要跳到的下标 | 应看到什么 | 实测 |
| --- | --- | --- | --- |
| A，只开 D1+D3（A-101） | 1、2、6 | A2 在 N3 告警；A3 被 D1 拒；B4 在 N6 告警，B 仍可继续 | ✓ 下标 1 有流线与 N3 侧向脉冲；下标 2 流线停在 N3 附近（`--flow-target: 96`）且为红色虚线；下标 6 有流线与 N6 脉冲 |
| B，只开 D3（B-001） | 4、5、6、7 | B2 因 O 关闭被拒；B3—B5 未执行；B4 没有告警 | ✓ 下标 4 流线停在 N4 前（`--flow-target: 18`）；下标 5—7 无流线；下标 6 flow=0、alert=0，N6 无脉冲 |
| C，只开 D3（C-001） | 6、7 | B4 到 N6 并告警；B5 才因 T 无权限被拒 | ✓ 下标 6 有流线与 N6 脉冲；下标 7 流线停在 N6→N7 之间（`--flow-target: 26`），未穿过 N7 |
| A，只开 D1 | 2、7 | A 被挡住，B 到达；残余说明引用 B2、B5 的已满足检查 | ✓ 下标 2 A3 已拒绝、N7 无到达徽标；下标 7 显示「报名明细已到达（模拟）」与 N7 徽标脉冲；残余说明列出 B2 的 O 检查与 B5 的 T、D2 检查 |

## 无动画与取消规则

- 关闭动画开关与 `prefers-reduced-motion` 已由 B 段实施，均为真实实现，不是占位。
- 关闭动画后，同一 `eventIndex` 的文字和静态状态仍完整。
- 跳转或换配置时，旧过渡与旧脉冲立即取消。
- 新运行从事件下标 0 开始，不沿用上次的画面。
- 播放与开关动画都不产生新的 POST。

## 残余路径说明

从 `pathResults` 找仍为 `reached` 的路径，再引用该路径已执行事件的 `conditionChecks.reason`。例如 A 只 D1 后显示「路径 B 仍到达模拟数据」，并列出 B2 的 O 检查、B5 的 T 与 D2 检查。两路都阻断时只写「两条已建模路径均未到达模拟数据」，不写「系统已安全」。

## AI 协作记录

### 我的原始 Prompt

**A 段**：只做 eventIndex 控制、静态图状态、当前事件说明与残余路径条件。要求：下标只取 `events` 0—7；passed / skipped / rejected / data-arrived 各自的静态呈现；事件带 alert 时在 `alert.interfaceNodeId` 显示告警标记；八条事件全保留，A1/B1 同边但高亮须区分 `pathId` 与 `stepId`；新运行从 0 开始；只读现有 RunResult、不新增前端判定；不做任何运动、回弹、脉冲。

**B 段**：仅加入动画白名单允许的动效。要求：passed 流线、skipped 无流线但底图仍在、rejected 在检查点停止回弹且不得穿过 N7、data-arrived 穿透并标「模拟」；alert 脉冲只在当前事件含 alert 时出现，B4 skipped 时不得在 N6 出现脉冲；CSS 时间只决定视觉过渡；暂停、跳转、切预设、O/T 或防御变化、新响应到来时取消旧过渡；提供关闭动画开关并尊重 `prefers-reduced-motion`；关闭后静态信息完整。

### AI 方案要点

- **A 段**：`playback.ts` 三个纯函数——`clampIndex`、`derivePlaybackView`（从 events 派生静态图状态）、`buildResidualReport`（残余说明原样引用引擎 reason）；`PlaybackBar` 与 `CurrentEventPanel` 两个展示组件；图下固定一行 `当前事件：路径 X · stepId（状态）` 作为区分 A1/B1 的锚点
- **B 段**：`animationKey = runEpoch-index-animationsEnabled` 强制 remount 取消旧动画；自定义 `LabEdge` 承载流线；全部 keyframes 挂在 `.animations-enabled` 父选择器下

### 我的补充与落实

| # | 补充 | 落实 |
| --- | --- | --- |
| 1 | 残余说明需处理 reached 路径无 conditionChecks 的情况 | 追加「该路径的各步骤均无额外条件检查，按基础步骤到达」，并加测试 |
| 2 | 残余说明的 reason 必须原样取自引擎，不得硬编码 | 只做 `check.reason` 拼接；测试用实际字段值构造断言 |
| 3 | `.at(-1)` 需 ES2022 lib | 确认 `lib: ["ES2022", "DOM", "DOM.Iterable"]` |
| 4 | A 段的关闭动画开关归属需注明 | Day 11 文档注明该项由 B 段实施，B 段已完成 |
| 5 | 补「下标变化不触发 POST」断言 | 播放、上一步、下一步、跳转后断言 mock 调用次数不变 |
| 6 | animationKey 不能拼 `runVersionRef.current` | 改用 `runEpoch` state，在三处递增 |
| 7 | `matchMedia` 监听需 cleanup | effect 返回 `removeEventListener`，空 deps |
| 8 | localStorage 读写需 try/catch | 隐私模式静默降级 |
| 9 | rejected 停靠不能统一 85% | 按 stepId 固化：A3=0.12、B2=0.9、B5=0.82 |
| 10 | alert 脉冲条件不得依据 `defenses.includes("D3")` | 判定为当前事件对象是否存在 `alert` 字段，并加注释与测试 |
| 11 | overlay 定位须基于节点屏幕坐标 | 改用自定义 edge 组件，与底图共享 pane transform |

## A 段实测（历史记录）

- `npm run build`：通过（contracts / engine / api / web 四包）
- `npm run typecheck`：通过（所有 workspace；`.at(-1)` 依赖 ES2022 lib 已在 apps/web tsconfig 确认包含）
- `npm run test`：web 33（playback.test 11 + App.test 22）、api 13、engine 23
- B 段完成后 web 测试增至 35

## A 段交付时的完成表述（历史记录）

用户能通过上一步/下一步/跳转/播放控制当前事件下标（0—7），看到对应步骤在图上的静态状态：passed 高亮、rejected 虚线被拒、skipped 灰色未执行、data-arrived N7 标记、alert 徽标挂在对应接口节点但主流线不变。A1/B1 共用 N1→N2 物理连线但高亮与标签始终按 pathId + stepId 区分，不合并。右侧面板完整展示当前事件的 stepId / 起终节点 / outcome 中文 / 所有 conditionChecks（引擎原样 reason），以及残余路径说明：reached 路径引用已执行条件检查，两路阻断时仅输出一句固定文案。播放与任何下标变化都不产生 POST；切换预设、O/T、防御、或新响应到来时 eventIndex 重置到 0。残余路径中所有 reason 来自引擎已有数据，不硬编码、不称为「已落库的 AI 解释」。

该阶段未做（B 段）：任何流线运动、回弹、侧向脉冲、过渡动画；关闭动画开关与 prefers-reduced-motion；残余路径自动建议。

## B 段实测（Console 计数）

预设 A + D1 + D3：

| 下标 | 事件 | flow-overlay | alert-pulse | arrived-pulse |
| --- | --- | --- | --- | --- |
| 0 | A1 passed | 1 | 0 | 0 |
| 1 | A2 passed + alert | 1 | 1 | 0 |
| 2 | A3 rejected | 1（`--flow-target: 96`） | 0 | 0 |
| 6 | B4 passed + alert | 1 | 1 | 0 |
| 7 | B5 data-arrived | 1 | 0 | 1 |

预设 B + D3：下标 4（B2 rejected）flow=1、`--flow-target: 18`；下标 6（B4 skipped）flow=0、alert=0，N6 无脉冲。

预设 C + D3：下标 7（B5 rejected）flow=1、class 含 `flow-overlay-path-rejected`、`--flow-target: 26`，流线停在 N6→N7 之间未穿过 N7。

关闭动效后三类 overlay 全为 0，静态标签、虚线、徽标、文字与理由完整可读。

## 真实 Bug 与修复（B 段动画层）

**现象**：B 段完成后，静态状态（边高亮、虚线、徽标、文字、理由）全部正确，但三种动效——活动流线、告警侧向脉冲、N7 到达脉冲——一个都没有出现。

**如何发现**：在真实浏览器里以间隔 500ms 连续截两张图，两张完全相同；未采信 AI 报告中「已完成」的结论。

**诊断过程**：

1. Console 检查 `.animations-enabled` 已挂在 graph-container 上 → 排除父选择器拦截
2. 检查样式表，`@keyframes` 共 5 个（flowPassed / flowDataArrived / flowRejected / alertPulse / arrivedPulse）已进入 sheet → 排除样式层缺失
3. 检查 DOM，`[class*="flow-overlay"]` 数量恒为 0，而 `.alert-pulse-overlay` 在带 alert 的下标下为 1 → 问题只在流线层
4. 检查取 path 的选择器：

```js
containerRef.current.querySelector(`.react-flow__edge.path-${activeEdgeId} path`)
// activeEdgeId = "N1->N2" 时成为
// .react-flow__edge.path-N1->N2 path
