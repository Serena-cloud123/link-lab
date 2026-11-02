# 链路实验室

面向网安初学者的攻防因果教学沙盘：通过改变初始条件和防御措施，理解校园报名数据泄露路径为何成立或被阻断。

## 当前阶段

Day 10：同条件基线与干预对比。在固定场景版本、O、T 下，把一次真实的 `defenses: []` 运行存为内存基线快照（含该次 input 与 result），随后开启防御时展示基线与当前运行的 A/B 结果、首次阻断位置/原因与 alertCount 差异（「由到达变为阻断」「保持到达」「原本已阻断」及双向告警差异）。O/T 变化或切预设立即使旧基线失效，迟到的旧响应不会恢复对比；补跑基线走独立轨道，不改防御开关、不覆盖当前干预结果，一次点击一次 POST。前端仍只比较两份后端响应，不重算 O/T/D1/D2/D3 规则。前端交互测试扩到 13 项。逐帧播放、流线动画、残余路径建议、SQLite、AI 解释、保存回放仍未实现。

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

本阶段未实现：O/T 自由滑块、D1/D2/D3 防御选择、逐帧播放与流线动画、运行的保存与历史回放、SQLite 业务表、CORS 和 AI 解释。构建产物写入各自 `dist/`，不进入版本库。
