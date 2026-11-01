# Day 9：双条件滑块与防御配置

## 今日边界

只改前端配置与提交行为，不改引擎和 API。O/T 为两档滑块；D1/D2/D3 为独立防御选项。有效配置变化调用现有 `POST /api/evaluations`，结果仍以 `RunResult` 为准。

不做：逐帧播放、流线动画、残余路径自动建议、SQLite、AI 解释、保存或回放。

## 提交语义

- 拖动期间只预览，不发送 POST。
- 松手且值改变：发送一次；松手仍为原值：零次。
- 防御有效点击：更新配置并发送一次。
- 切换预设：还原该预设 O/T、防御清空、清掉旧结果；不自动运行。
- 请求未结束前禁止新的配置提交。
- 结果面板展示的是该次请求的 input 快照，不把旧结果标成新结果。

## 交互规则

| 操作 | 界面行为 | POST 次数 |
| --- | --- | --- |
| 拖动 O/T，尚未松手 | 吸附显示两档之一，标明「预览中」 | 0 |
| 松手，最终值与原值不同 | 提交新配置，显示运行中及新结果 | 1 |
| 拖动后回到原值再松手 | 保持原结果 | 0 |
| 键盘调整滑块并结束操作 | 与鼠标提交语义一致 | 每次确认后的有效变更 1 |
| 点击 D1/D2/D3 开关 | 更新该项防御并立即运行 | 每次有效点击 1 |
| 切换 A/B/C 预设 | O/T 回到该预设值，防御清空，旧结果清空 | 0，用户再运行基线 |
| 请求进行中 | 禁止重复提交与切换配置 | 不追加请求 |

选了预设 A 后手动调整 O/T，界面显示「从预设 A 调整」。请求中的 `presetId: "A"` 只表示起点，实际判定仍由当前 `conditions` 决定。

## 人工预期

值来自已冻结的 32 行 CSV。实施前写预期，实施后在浏览器逐项核对。

| 配置 | A | B | 告警 | 重点观察 | 实测 |
| --- | --- | --- | --- | --- | --- |
| A，防御全关 | reached | reached | 0 | 原 Day 8 基线 | 一致 |
| A，只开 D1 | blocked at A3 | reached | 0 | 阻断 A，B 仍可到达 | 一致 |
| A，开 D1+D2+D3 | blocked at A3 | blocked at B5 | 2 | A2、B4 已到达敏感接口，D3 仍告警 | 一致 |
| B，只开 D3 | reached | blocked at B2 | 1 | B4 未执行，不产生 B 告警 | 一致，B3—B5 均为未执行 |
| C，只开 D3 | reached | blocked at B5 | 2 | B4 已到 N6，B5 才因 T 被拒 | 一致，B4 已通过 |
| 从 A 调成 O 关、T 无，开 D1+D2+D3 | blocked | blocked at B2 | 1 | 对应输入 X-111，不新增第四预设 | 一致，显示「从预设 A 调整」，无第四预设按钮 |


前端只发送配置、展示响应，不把这张表复制进页面当判断逻辑。

## 提交去重设计说明

- **ref 作为同步真值**：`conditionsRef`、`previewRef`、`defensesRef`、`presetIdRef`、`submittedConfigRef`、`scenarioRef` 均在产生变更的同一处同步写入，不依赖 `useEffect` 同步 state→ref。
- **`run(nextConditions, nextDefenses)` 是唯一 POST 入口**：始终用参数显式构造 `input`（key 顺序固定），不读可能滞后的 state。内部同步更新 `conditionsRef`、`defensesRef`、`submittedConfigRef`。
- **`commitConditions` 两道门**：
  1. `preview === conditions`（拖回原位）→ 0 POST；
  2. 序列化后与 `submittedConfigRef` 相同（mouseup + blur 重复）→ 0 POST。
  第二道门在第一道门之后，实际不会拦截合法重跑（手动运行走 `run()` 直达，不经 `commitConditions`）。序列化使用固定 key 顺序 `O=${O};T=${T};D=[sorted]`，避免同一配置因 key 顺序不同被当成两个配置。
- **切换预设**：同步重置 `conditionsRef`、`previewRef`、`defensesRef`、`submittedConfigRef`，`runVersionRef` 递增使在途响应失效，`runState` 置 `idle`。保证切完预设后「运行当前配置」不被上一组的去重门挡住。

## AI 协作记录

### 我的原始 Prompt

以下为当日发给 AI 的完整原文：
今天只做《链路实验室》Day 9：在 Day 8 工作台上实现
O/T 两档吸附滑块和 D1/D2/D3 防御选择。

先阅读 docs/需求边界.md、docs/动画白名单.md、
docs/Day8_静态工作台与基线运行.md、
docs/Day9_双条件滑块与防御配置.md，
apps/web/src/App.tsx、api.ts、components/RunResultPanel.tsx、
components/ScenarioGraph.tsx、labels.ts、styles.css，
以及 packages/contracts/src/index.ts。
先列拟修改文件、状态设计、何时发 POST、如何保证一次拖动
最多一次请求、如何防止旧响应对应新配置；等我审查后再编辑。
不要自行 git commit。

实现要求：
1. 从 scenario.presets 取得预设初始 O/T。单独维护滑块预览值、
   已提交的 conditions，以及本次请求 input 快照。
   O/T 各只有两档，清晰标出开放/关闭、有权限/无权限。
 2. 滑块拖动时可以更新预览显示，但不得发送     POST；
    鼠标或触屏松手后，最终值不同才提交一次。
    相同值不提交；取消拖动时恢复已提交值。
    键盘操作也能完成有效提交，不能依赖鼠标。
    松手、失焦等事件即使连续触发也不得重复提交。
 3. D1/D2/D3 独立开关。每次有效点击形成新 defenses 数组，
    立即用新配置请求一次；不通过 useEffect 监听配置变化来发 POST。
    D3 的视觉和文字始终是"记录告警"，不能显示为阻断措施。
 4. 所有请求以明确构造的 nextInput 为准，不依赖刚刚调用
    setState 后可能尚未更新的状态。运行中禁用会导致并发修改
    的控件；失败时标明失败，不把上次结果冒充本次结果。
 5. 选择另一个预设时，O/T 回到该预设值，defenses 回到 []，
    旧结果清空；不自动发送 POST。调整后的界面说明
    "从预设 X 调整"，presetId 不覆盖实际 conditions。
 6. 保留手动"运行当前配置"入口，供切换预设后运行无防御基线。
    结果面板继续展示接口返回的 events、pathResults、
    alertCount 和本次 input；前端不重算成败、告警数或路径条件。
 7. 不改后端、contracts、engine、场景 JSON、32 行 CSV；
    不做逐帧播放、流线动画、残余路径自动建议、
    SQLite、AI 解释、保存或回放。
 8. 为"多次预览只提交一次""回到原值不提交""防御点击
   一次提交一次"加入少量有意义的前端交互测试，
    并在真实浏览器 Network 面板核对鼠标与键盘操作。
    报告真实 build、typecheck、test 结果。

- **方案要点**：refs-as-sync-truth + 单一 `run()` 入口 + 单调版本号 `runVersionRef` 丢弃过期回调。滑块在 `onInput` 仅写预览，在 `onMouseUp/onKeyUp/onTouchEnd/onBlur` 提交；防御点击直接 `run()`；预设切换重置全部 ref 并 bump 版本号。
- **用户五点修正**：
  1. `@testing-library/react` v16 将 `@testing-library/dom` 改为 peerDependency，显式安装 `@testing-library/dom`。
  2. vitest `globals: true` 下 `tsc --noEmit` 会因 `describe/it/expect` 未声明类型失败 → 在 tsconfig `types` 加入 `vitest/globals`，并将 `tests` 加入 `include`。
  3. `previewRef` 等 ref 必须在 `onInput` 等变更处理函数里同步写入，不靠 `useEffect`。
  4. `submittedConfigRef` 第二道门保留但说明不误挡合法重跑，序列化固定 key 顺序。
  5. 切换预设必须同步重置所有 ref + `runVersionRef++` + `runState=idle`。
- **真实 Bug 与修复**：
  - `ResizeObserver is not defined`：`@xyflow/react` 在 jsdom 下需要 `ResizeObserver`，在 `setup.ts` 中提供最小 mock。
  - `TS2578: Unused '@ts-expect-error' directive`：`ResizeObserver` 属 DOM lib 类型，赋值本身不报错，改用 `as unknown as typeof ResizeObserver` 断言。

## 本机验收

### 命令输出（真实）

```
npm install
> added 56 packages, and audited 220 packages in 2m
> found 0 vulnerabilities

npm run build --workspace @link-lab/web
> tsc --noEmit -p tsconfig.json && vite build
> ✓ 194 modules transformed.
> dist/index.html 0.40 kB │ assets/index.css 21.11 kB │ assets/index.js 415.30 kB
> ✓ built in 6.95s

npm run typecheck  (根脚本，覆盖 contracts/engine/web/api)
> @link-lab/web typecheck: tsc --noEmit -p tsconfig.json  (exit 0)
> 全部 workspace typecheck 通过

npm run test  (根脚本，覆盖 web/api/engine)
> @link-lab/web test: 8 tests passed
> @link-lab/api test: 13 tests passed
> @link-lab/engine test: 23 tests passed
```

### 浏览器 Network 实测（真实）

启动 `dev:api` + `dev:web`，在工作台执行：拖 O 滑块→blur 提交→点 D1→点 D3→切预设 B→运行当前配置。

`browser_network_requests` 与后端 pino 日志均显示 **4 次 POST /api/evaluations**（req-5 ~ req-8），全部 200，时间戳互不重叠：

| 操作 | POST | 响应 |
| --- | --- | --- |
| O 滑块 拖到关闭 + blur | req-5 | 200，15ms |
| 点击 D1 | req-6 | 200，2.7ms |
| 点击 D3 | req-7 | 200，1.2ms |
| 切预设 B（0 POST）→ 运行当前配置 | req-8 | 200，1.3ms |

切预设 B 本身 0 POST，旧结果清空、防御归零；再点「运行当前配置」才产生 req-8。

### 截图

- 初始工作台：`docs/screenshots/day9-workbench-initial.png`
- D1 激活 + 结果面板：`docs/screenshots/day9-workbench-result.png`

### 前端交互测试（vitest + RTL，8 项全通过）

1. 拖动滑块（input）不提交
2. 拖动后 mouseUp 提交一次，O=closed
3. 拖到新值再拖回原位，mouseUp 不提交
4. mouseUp 后再 blur 只提交一次（去重）
5. 点击 D1 提交一次，defenses=['D1']
6. D3 标签为「记录告警」，不显示「阻断」
7. 运行中（永不 resolve）点击 D2 与拖动滑块均不产生新提交
8. 切换预设后结果清空且不自动提交

## Day 9 完成表述

用户可在同一个场景中通过 O/T 与 D1/D2/D3 探索配置；每次有效操作对应一次确定性推演，滑块拖动过程不产生运行，结果始终与提交时的输入快照对应。逐帧流线和残余路径讲解留到后续日期。
