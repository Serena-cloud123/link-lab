# 链路实验室

面向网安初学者的攻防因果教学沙盘：通过改变初始条件和防御措施，理解校园报名数据泄露路径为何成立或被阻断。

## 当前阶段

Day 4：路径 A 纯规则函数。场景与契约沿用 Day 3，路径 A 的 A1—A3 事件已可计算；路径 B、运行接口、数据库与前端交互尚未实现。

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
npm run dev:web   # http://127.0.0.1:5173
npm run dev:api   # http://127.0.0.1:3001
npm run build
```

后端健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:3001/health
```

预期：`{"status":"ok","service":"@link-lab/api"}`。

可选环境变量：复制 `apps/api/.env.example` 为 `apps/api/.env`。`.env` 不进入版本库。

## 目录结构

| 路径 | 职责 |
| --- | --- |
| `scenarios` | 场景静态定义（JSON） |
| `apps/web` | React + TypeScript + Vite 前端 |
| `apps/api` | Node.js + TypeScript + Fastify 后端 |
| `packages/contracts` | 前后端共享契约类型 |
| `packages/engine` | 确定性规则引擎（本阶段仅占位） |

本阶段未实现：路径 B 判定、完整 RunResult、运行接口、32 组完整运行、O/T 滑块、React Flow 画布、动画、数据库业务表和模型 API。构建产物写入各自 `dist/`，不进入版本库。
