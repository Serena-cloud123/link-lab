# 链路实验室

面向网安初学者的攻防因果教学沙盘：通过改变初始条件和防御措施，理解校园报名数据泄露路径为何成立或被阻断。

## 当前阶段

Day 12：显式保存与规则模板解释。工作台的「运行结果」面板底部有「保存此配置的推演」入口，仅在当前运行成功（`done`）时出现；点击后只把该次运行的 `RunInput` 快照提交到 `POST /api/runs`，服务器用同一个确定性引擎重算 `RunResult`，生成一句规则模板解释，连同输入、结果、场景版本一次性写入 SQLite，返回记录 ID。`GET /api/runs/:id` 只读库，不重新推演、不重新生成解释。原有 `POST /api/evaluations` 保持无持久化，滑块、防御开关与基线补跑都不自动保存。历史列表与逐帧回放、版本核对仍未实现。

「一句话解释（规则模板）」由确定性模板生成，不是大模型输出；界面按响应的 `explanationSource` 字段标注来源。

## 学习目标

1. 判断一条攻击路径继续推进需要哪些条件。
2. 区分“检测到请求”和“阻断了请求”。
3. 解释阻断一条路径后，为什么仍可能存在另一条路径。

## 模型边界

只建模一个虚构校园报名场景、两条预设路径、三种防御和两个初始条件。推演结果只适用于这些已建模路径，不代表真实系统的安全结论。不执行真实攻击。本工具是入门引路，不替代动手实操。

## 核对局限

历史记录只保存场景版本号，未保存场景内容摘要。因此「核对当前版本」只能比较版本号并用当前场景重算，不能证明当时的场景内容与现在逐字相同。版本不一致时不做重算，旧记录仍可只读回放。


## 阅读顺序

1. docs/需求边界.md
2. docs/动画白名单.md
3. docs/工作台草图.md
4. docs/访谈笔记.md

## 运行方法

环境：Node.js v24.21.0，npm 11.19.0，Git 2.53.0.windows.2。使用 Node 内置 `node:sqlite`，无 ORM。数据库默认落在 `apps/api/data/link-lab.db`，目录自动创建，`src` 启动与 `dist` 启动指向同一文件；可用 `DATABASE_PATH` 覆盖（相对路径以仓库根为基准）。

```powershell
npm install
npm run build       # 首次使用，或修改过 contracts / engine 之后必须先执行
npm run dev:api     # http://127.0.0.1:3001
npm run dev:web     # http://127.0.0.1:5173
npm run typecheck
npm run test
```

注意：`npm run dev:api` 会先构建 contracts 与 engine。**不要直接进入 `apps/api` 目录跑 `npm run dev`**，此时 engine 可能未构建，会因找不到 `@link-lab/engine` 的 dist 入口而失败。

前端通过 Vite 开发代理把 `/api` 转发到 `http://127.0.0.1:3001`，使用工作台时需同时运行 `dev:api` 与 `dev:web`。

构建产物模式（运行 `dist` 里的入口）：

```powershell
npm run build
npm start --workspace @link-lab/api
```

后端健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:3001/health
```

预期：`{"status":"ok","service":"@link-lab/api"}`。

读取固定场景：

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/scenarios/campus-registration
```

运行一次推演（A-101：O 开、T 有、D1+D3）：

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:3001/api/evaluations -ContentType 'application/json' -Body '{"scenarioId":"campus-registration","conditions":{"O":"open","T":"granted"},"defenses":["D1","D3"]}'
```
保存一次推演（A-101：O 开、T 有、D1+D3）：

```powershell
$body = @{
  scenarioId = "campus-registration"
  conditions = @{ O = "open"; T = "granted" }
  defenses = @("D1", "D3")
} | ConvertTo-Json -Depth 8

$saved = Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:3001/api/runs `
  -ContentType 'application/json' `
  -Body $body

$saved.id
$saved.explanation


预期：`pathResults` 为 A `blocked`、B `reached`，`alertCount` 为 2，`events` 共 8 条。

非法输入（缺字段、非法值、重复防御、多余字段）返回 400，不进入引擎。

可选环境变量：复制 `apps/api/.env.example` 为 `apps/api/.env`。`.env` 不进入版本库。

## 目录结构

| 路径 | 职责 |
| --- | --- |
| `scenarios` | 场景静态定义（JSON） |
| `apps/web` | React + TypeScript + Vite 前端（场景介绍 / 沙盘工作台 / 学习记录三页骨架，静态图与基线运行） |
| `apps/api` | Node.js + TypeScript + Fastify 后端（健康检查、固定场景、推演接口） |
| `packages/contracts` | 前后端共享契约类型 |
| `packages/engine` | 确定性规则引擎（路径 A/B、`evaluateRun` 与 32 组验收已实现） |

本阶段未实现：P2 最少新增措施分析、外部模型 API 的一句话解释、账号体系与多场景。历史列表、只读回放与同版本显式核对已实现。构建产物写入各自 `dist/`，数据库与 `dist/` 均不进入版本库。