# 链路实验室

面向网安初学者的攻防因果教学沙盘：通过改变初始条件和防御措施，理解校园报名数据泄露路径为何成立或被阻断。

## 当前阶段

Day 11：事件播放与规则状态可视化。工作台按 `eventIndex` 播放八条事件，静态状态全部由 `RunResult.events` 派生：passed 高亮、rejected 停靠被拒、skipped 灰显未执行、data-arrived 标记 N7、alert 徽标挂在 `alert.interfaceNodeId` 且不改主流线状态。动效严格限定在动画白名单内——流线推进、拒绝停靠回弹、到达穿透、D3 侧向脉冲；关闭动效或系统减少动态效果时，同一事件下标的文字与静态状态完整可读。A1/B1 共用 N1→N2 物理连线但高亮始终按 pathId + stepId 区分。残余路径说明原样引用引擎已记录的条件检查，两路阻断时只写「两条已建模路径均未到达模拟数据」。前端交互与纯函数测试共 35 项。运行保存、模板解释落库、历史回放仍未实现。

## 学习目标

1. 判断一条攻击路径继续推进需要哪些条件。
2. 区分“检测到请求”和“阻断了请求”。
3. 解释阻断一条路径后，为什么仍可能存在另一条路径。

## 模型边界

只建模一个虚构校园报名场景、两条预设路径、三种防御和两个初始条件。推演结果只适用于这些已建模路径，不代表真实系统的安全结论。不执行真实攻击。本工具是入门引路，不替代动手实操。

## 阅读顺序

1. docs/需求边界.md
2. docs/动画白名单.md
3. docs/工作台草图.md
4. docs/访谈笔记.md

## 运行方法

环境：Node.js v24.21.0，npm 11.19.0，Git 2.53.0.windows.2。使用内置 `node:sqlite`，本阶段尚未连接数据库。

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

本阶段未实现：运行保存与历史回放、SQLite 业务表、模板解释落库、一句话 AI 解释、P2 最少新增措施分析。构建产物写入各自 `dist/`，不进入版本库。
