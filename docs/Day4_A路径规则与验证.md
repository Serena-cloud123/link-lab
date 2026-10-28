# Day4_A路径规则与验证

## 四个标准案例（事件级验收）
| D1 | D3 | A1 | A2 | A3 | A 结果 | A 告警 |
| --- | --- | --- | --- | --- | --- | --- |
| 关 | 关 | passed | passed | data-arrived | reached | 0 |
| 关 | 开 | passed | passed＋N3告警 | data-arrived | reached | 1 |
| 开 | 关 | passed | passed | rejected | blocked at A3 | 0 |
| 开 | 开 | passed | passed＋N3告警 | rejected | blocked at A3 | 1 |

注意：原 CSV 的 32 行可检验 A 的最终到达结果，但其中 alertCount 是 A+B 总告警数；Day 4 不能拿它直接要求单路径 A 返回总告警数。

## Day 4 实施记录

### AI 的初步方案

新建 packages/engine/src/pathA.ts（evaluatePathA，固定事件下标 0/1/2）、导出到 index.ts、新建 tests/pathA.test.ts（4 种 D1/D3 组合 + 32 行 CSV 的 pathAReached 比对）、engine/package.json 增加 @link-lab/contracts 依赖与 Vitest、根 package.json 增加 test 脚本并把 typecheck 改为先构建 contracts、README 更新阶段。

### 我纠正的地方

1. PathResult 字段名。AI 方案使用 blockedAt，契约中不存在该字段。实际契约为 pathId、outcome（PathFinalOutcome = "reached" | "blocked"）、firstBlockedStepId、blockedReason。要求改为 firstBlockedStepId，并确认 PathFinalOutcome 已覆盖所需取值，不得为此修改 contracts。
2. 要求单独列出根 package.json 与 README.md 的改动，由我审查后决定是否纳入本次提交。

### 四类错误的审查结果

| 检查项 | 结果 |
| --- | --- |
| A2 告警是否被挪到 A3、是否因 D1 阻断而消失 | 无。告警挂在 A2 事件上，A3 被拒后原样保留 |
| 是否硬编码而无视 scenario.paths 与 sensitiveArrival | 无。步骤从 scenario.paths 查找，到达点取自 a2.sensitiveArrival |
| 是否把 CSV 总 alertCount 当成 A 单独告警数 | 无。引擎不含 alertCount，测试不比较该字段 |
| 是否生成 B 的假事件或修改冻结 CSV | 无。只生成 A1—A3；scenarios 与 expected-runs.csv 未被修改 |

### 本机验收结果

| 命令 | 结果 |
| --- | --- |
| npm run build | 退出码 0，四个 workspace 全部通过 |
| npm run typecheck | 退出码 0，contracts 先构建，四个 workspace 通过 |
| npm run test --workspace @link-lab/engine | 退出码 0，5 tests passed（4 种 D1/D3 组合 + 32 行 CSV 的 pathAReached 比对） |
| git diff --check | 仅 CRLF 换行提示 |
| git status --short | 仅预期的 5 个修改与 3 个新增，scenarios 与 expected-runs.csv 未出现 |

测试报告原样说明：CSV 校验只断言 pathAReached，未比较 pathBReached 与 alertCount，因此不能声称 32 组完整运行已通过。

### 审查后接受的额外改动

| 文件 | 改动 | 理由 |
| --- | --- | --- |
| 根 package.json | typecheck 改为先构建 contracts；新增 test 脚本 | 干净克隆下 engine 找不到 contracts 的声明文件 |
| README.md | 当前阶段改为 Day 4；未实现清单改为"路径 B 判定、完整 RunResult、运行接口、32 组完整运行" | 与实际状态一致 |
| Vitest 版本 | 初装 3.2.7 带 2 个 critical 审计项，升至 5.0.5，最终 0 vulnerabilities | 安全检查要求升级 |

### 今天结束的准确说法

路径 A 的三步事件、D1 阻断和 D3 告警已由测试验证；路径 B 尚未实现。
