# 链路实验室

面向网安初学者的攻防因果教学沙盘：通过改变初始条件和防御措施，理解校园报名数据泄露路径为何成立或被阻断。

## 当前阶段

Day 19：功能已冻结，进入交付。P0/P1 全部完成：三页七步闭环、O/T 两档吸附滑块松手才提交、事件下标驱动的规则状态流线（未执行消失、被拒撞护栏回弹、到达穿透、D3 侧向告警）、同条件基线与干预对比、三题含迁移题、运行保存、只读回放与零副作用版本核对。默认一句话解释由确定性规则模板生成并随运行一次落库，回放只读库、不重新生成；可选模型 API 未接入。干净目录按本 README 实测复现的数据见下方「干净目录复现」，分段耗时、落库证据与局限见 docs/Day18_最终版复现.md 与 evidence/repro/day18/；Day 19 补做了重启后逐字段核对（运行记录与学习记录原始响应逐字节一致，显式核对返回 match，核对后记录不变），过程见 docs/Day19_正式录制.md。开发全程的 AI 协作记录已封存为四条 Prompt 链，见 evidence/README.md。

「一句话解释（规则模板）」由确定性模板生成，不是大模型输出；界面按响应的 `explanationSource` 字段标注来源。

## 学习目标

1. 判断一条攻击路径继续推进需要哪些条件。
2. 区分“检测到请求”和“阻断了请求”。
3. 解释阻断一条路径后，为什么仍可能存在另一条路径。

## 五分钟体验路线

1. 场景介绍页 → 进入沙盘工作台 → 选预设 A
2. 防御全关，运行一次无防御基线
3. 播放下标 0—7，逐步读每一步的条件检查理由
4. 开 D1 重跑，看路径 A 在哪一步被拒、残余路径引用哪些条件
5. 对照基线与干预的差异
6. **先保存本次运行，再答三题并提交学习记录**——答题区需要一条已保存的运行才能提交
7. 学习记录页打开该记录回放，再点「核对当前版本」

回放只读库中旧快照，不重新推演；核对是在版本一致时主动重算，两者不是同一个动作。

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
npm ci
npm run build       # 首次使用，或修改过 contracts / engine 之后必须先执行
npm run dev:api     # http://127.0.0.1:3001
npm run dev:web     # http://127.0.0.1:5173
npm run typecheck
npm run test
```

`npm ci` 按 `package-lock.json` 安装锁定版本，与提交时的依赖树一致。需要更新依赖时才用 `npm install`，那不属于复现流程。


注意：`npm run dev:api` 会先构建 contracts 与 engine。**不要直接进入 `apps/api` 目录跑 `npm run dev`**，此时 engine 可能未构建，会因找不到 `@link-lab/engine` 的 dist 入口而失败。

前端通过 Vite 开发代理把 `/api` 转发到 `http://127.0.0.1:3001`，使用工作台时需同时运行 `dev:api` 与 `dev:web`。

### 干净目录复现（Day 18 实测）

- 验收提交：fb87729
- 环境：Node v24.21.0、npm 11.19.0；本次 npm 缓存为热（Day 14 那次为冷缓存，两者仅构建与运行段可比）
- 克隆（含下载）：1 分 38.7 秒
- npm ci：13.3 秒；npm run build：27.7 秒
- 克隆到构建完成合计（T1）：2 分 20.1 秒
- 启动 API 与 Web 到页面可交互（T2a）：1 分 2.4 秒
- 按本文「五分钟体验路线」走完七步，含逐事件阅读与三题作答（T2b）：3 分 21.4 秒
- 完整流程总计（含下载）：8 分 25.9 秒；不含下载：6 分 47.2 秒
- 纯机器段（npm ci + build + test + 起服务 + 重启收尾，不含克隆与七步人工阅读）：约 3 分 16 秒
- 克隆后 apps/api/data/link-lab.db 不存在，首次启动自动创建空库
- 干净目录测试结果与主仓库一致：web 66、api 48、engine 23，合计 137 项通过
- 上述 8 分 25.9 秒是该次成功流程的实测值，含当次克隆下载；首次克隆曾连接重置后重试，另一遍较慢的数据（14 分 26.7 秒）仍保留在 docs/Day18_最终版复现.md。**不能据此承诺任何机器任何网络都在 10 分钟内完成**；机器段稳定在 3 分半左右，人工阅读与克隆下载是主要波动来源

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
```

预期：`pathResults` 为 A `blocked`、B `reached`，`alertCount` 为 2，`events` 共 8 条。

非法输入（缺字段、非法值、重复防御、多余字段）返回 400，不进入引擎。

可选环境变量：复制 `apps/api/.env.example` 为 `apps/api/.env`。`.env` 不进入版本库。

## 目录结构

| 路径 | 职责 |
| --- | --- |
| `scenarios` | 场景静态定义（JSON） |
| `apps/web` | React + TypeScript + Vite 前端：场景介绍、沙盘工作台、学习记录三页；含七节点画布与事件下标驱动的流线、O/T 两档滑块与三防御、同条件基线与干预对比、三题与学习记录、只读回放与版本核对 |
| `apps/api` | Node.js + TypeScript + Fastify 后端：健康检查、固定场景、即时推演、运行保存与读取、学习记录、显式核对；SQLite 无 ORM |
| `packages/contracts` | 前后端共享契约类型 |
| `packages/engine` | 确定性规则引擎（路径 A/B、`evaluateRun` 与 32 组验收已实现） |

已实现：场景介绍、工作台、学习记录三页；七步学习闭环；运行保存；历史列表、只读回放与同版本显式核对；三题含迁移题。未实现：P2 最少新增措施分析、外部模型 API 的一句话解释、账号体系与多场景。构建产物写入各自 `dist/`，数据库与 `dist/` 均不进入版本库。