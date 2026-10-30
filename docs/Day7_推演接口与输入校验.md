# Day 7：推演接口与输入校验

## 今日目标

固定场景经后端读取；合法 RunInput 调用 evaluateRun，返回 RunResult。本日不保存运行。

## 接口

- GET /health：维持原有行为。
- GET /api/scenarios/campus-registration：返回版本 1 的固定场景。
- POST /api/evaluations：接收 RunInput，返回 RunResult；不保存运行。

## 输入边界

- scenarioId 只能是 campus-registration。
- conditions 必须同时含 O、T；O 只能 open/closed，T 只能 granted/revoked。
- defenses 是 D1/D2/D3 的数组，不接受重复项。
- presetId 可不填；填入时只能是 A/B/C，不得覆盖 conditions。
- 缺字段、非法值和多余字段返回 400，不进入引擎。

## 人工验收案例

| 输入 | A | B | 总告警 |
| --- | --- | --- | --- |
| A-101：O 开、T 有、D1+D3 | blocked | reached | 2 |
| B-001：O 关、T 有、仅 D3 | reached | blocked | 1 |

## AI 协作与验证记录
# Day 7：推演接口与输入校验

## 今日目标

固定场景经后端读取；合法 RunInput 调用 evaluateRun，返回 RunResult。本日不保存运行。

## 接口

- GET /health：维持原有行为。
- GET /api/scenarios/campus-registration：返回版本 1 的固定场景。
- POST /api/evaluations：接收 RunInput，返回 RunResult；不保存运行。

## 输入边界

- scenarioId 只能是 campus-registration。
- conditions 必须同时含 O、T；O 只能 open/closed，T 只能 granted/revoked。
- defenses 是 D1/D2/D3 的数组，不接受重复项。
- presetId 可不填；填入时只能是 A/B/C，不得覆盖 conditions。
- 缺字段、非法值和多余字段返回 400，不进入引擎。

## 人工验收案例

| 输入 | A 预期 | B 预期 | 告警预期 | 实测（开发模式 / 构建后模式） |
| --- | --- | --- | --- | --- |
| A-101：O 开、T 有、D1+D3 | blocked | reached | 2 | 两种模式一致：A blocked（A3，D1）、B reached、alertCount 2、events 8 |
| B-001：O 关、T 有、仅 D3 | reached | blocked | 1 | 两种模式一致：A reached、B blocked、alertCount 1、events 8 |

## AI 协作与验证记录

### 原始 Prompt

本日实际发给 AI 的 Prompt 要求：只接通「HTTP 请求 → 校验输入 → 读取固定场景 → evaluateRun → 返回事件与路径结果」，形成无持久化的最小推演接口；先列出拟修改文件、两个新接口的请求/响应、输入校验方案、开发模式与构建后如何加载 engine 和场景 JSON、测试方案，等我审查后再编辑，不得自行 commit。

实现约束共 10 条，其中关键几条：不改场景 JSON、共享契约、引擎规则和 32 行 CSV；`GET /health` 保持原响应；`GET /api/scenarios/campus-registration` 不返回预填 outcome、不接受用户指定任意文件路径；`POST /api/evaluations` 不加 `runId`、`savedAt` 或保存文案；在 HTTP 边界做运行时校验，缺字段、非法值、多余字段返回 400 且不进入引擎；Fastify 默认会移除多余字段，若约定是返回 400 必须调整配置并用测试证实；engine 从 `@link-lab/engine` 已构建产物导入，不跨目录引用 `packages/engine/src`；场景 JSON 在源码与 dist 两种模式下都要能找到并分别验证；用 Fastify inject 写测试并在测试后关闭 app。

### AI 给出的方案要点

- 路由挂 body JSON Schema，校验通过后才由 handler 调用引擎
- 主动指出 Fastify 5 默认 `removeAdditional: true` 会静默删除多余字段，需显式改为 `false` 并用测试证实
- 场景 JSON 用 `new URL("../../../scenarios/campus-registration/v1.json", import.meta.url)` 定位，理由是 `apps/api/src/` 与 `apps/api/dist/` 距仓库根同为三级
- engine 通过 `@link-lab/engine` 包入口使用，走包 `exports` 指向的 `dist/index.js`
- 调整根脚本，使 `dev:api`、`typecheck`、`test` 先构建 contracts 与 engine

### 我的修正

| 项 | AI 原方案 | 我的处理 | 理由 |
| --- | --- | --- | --- |
| 校验实现方式 | 询问是否要「Schema + 手写校验函数双保险」 | 只用 JSON Schema | 8 组 400 测试即为校验生效的证据，无需第二层实现 |
| 构建前置局限 | 称「直接进 apps/api 跑 dev 会失败」但未写文档 | 要求写进 README | 否则干净克隆复现时必踩 |
| `start` 脚本 | 未确认是否存在即用于验收 | 要求先确认，且必须执行 `dist/server.js` | 否则构建后模式验收无法运行 |
| vitest 版本 | 未说明 | 要求与 engine 现有版本一致 | 避免 lockfile 出现两份 vitest |

### 实施记录

| 文件 | 动作 |
| --- | --- |
| `apps/api/src/app.ts` | 模块加载时读取固定场景（`import.meta.url` 定位，读取失败报出完整路径）；新增 GET 场景与 POST 推演两个路由；Fastify 设置 `ajv.customOptions.removeAdditional: false`；仅用 JSON Schema 校验 |
| `apps/api/package.json` | 增加 `@link-lab/engine`、`@link-lab/contracts` workspace 依赖；`vitest` 版本与 engine 一致（`^5.0.5`）；新增 `test` 脚本；`start` 保持执行 `dist/server.js` |
| `apps/api/tests/app.test.ts` | 新建 13 项 `inject` 测试，`afterAll` 关闭 app |
| `package.json` | `dev:api`、`typecheck`、`test` 前置构建 contracts 与 engine；`build` 原顺序保留 |
| `README.md` | Day 7 状态、构建先行说明、接口复现命令 |
| `docs/Day7_推演接口与输入校验.md` | 本记录 |

未修改：`packages/contracts`、`packages/engine`（含判定函数与测试）、`scenarios/campus-registration/v1.json`、`expected-runs.csv`。

### 接口行为

- `GET /health` 响应保持 `{"status":"ok","service":"@link-lab/api"}`。
- `GET /api/scenarios/campus-registration` 返回唯一的固定场景，字段为 `id`、`version`、`title`、`boundary`、`nodes`、`paths`、`initialConditions`、`defenses`、`presets`；不返回预填 outcome，也不接受用户指定文件路径。
- `POST /api/evaluations` 校验通过后直接返回 `evaluateRun(scenario, input)` 的 `RunResult`，未增加 `runId`、`savedAt` 或保存文案。

### 输入校验

仅使用 JSON Schema，不额外写手写校验函数：

- 顶层与 `conditions` 均 `additionalProperties: false`，`required` 覆盖 `scenarioId`、`conditions`、`defenses` 及 `O`、`T`。
- `scenarioId` 使用 `const: "campus-registration"`；`presetId` 可选枚举 A/B/C。
- `defenses` 枚举 D1/D2/D3，`uniqueItems: true` 拒绝重复。
- Fastify 默认 `removeAdditional: true` 会静默删除多余字段，已显式改为 `false`，并由测试与真实请求证实返回 400。
- 校验在进入 handler 之前完成；测试对每个 400 用例断言响应中不存在 `events` 与 `pathResults`，即未进入引擎。

关于 `coerceTypes`：Fastify 默认可能把 `defenses: "D1"` 转成 `["D1"]`。今日不要求拒绝标量，测试未依赖该行为，也未对这类输入做任何断言。

### 测试

`apps/api/tests/app.test.ts` 共 13 项：

- `/health` 保持原响应
- GET 场景：id、version、boundary、7 节点、A/B 路径、O/T、D1/D2/D3、A/B/C 预设齐全，响应文本不含 `outcome`
- A-101：A blocked、B reached、alertCount 2、events 8
- B-001：A reached、B blocked、alertCount 1；B2 rejected，B3—B5 skipped
- presetId 传 A/B/C 与不传，三次 `RunResult` 完全相等
- 8 组 400：缺 defenses、缺 conditions.T、scenarioId 非法、O 非法、defenses 含 D4、defenses 重复、顶层多余字段、conditions 内多余字段，均断言 400 且无 `events`/`pathResults`

结果：

```text
apps/api: 1 test file, 13 tests passed
packages/engine: 3 test files, 23 tests passed
