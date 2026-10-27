# Day3_数据契约与规则表

## 业务词典

| 名称 | 含义 | 特别注意 |
| --- | --- | --- |
| O | 普通账号能否打开诊断页面 | 这是初始条件 |
| T | 服务令牌原本有无明细读取权限 | 也是初始条件 |
| D1 | 修复管理导出接口权限检查 | 只影响路径 A |
| D2 | 收紧服务令牌权限 | 只影响路径 B |
| D3 | 对到达敏感接口的请求产生告警 | 不影响任何路径成败 |
| 路径 A | 普通账号→应用→管理导出接口→明细 | D1 开启则在导出接口被拒 |
| 路径 B | 普通账号→应用→诊断页→令牌→数据服务→明细 | O 关闭则后续未执行；O 开但 T 无或 D2 开，则在数据服务被拒 |

## 事件判定依据

两条路径从同一初始状态独立评估，固定顺序为 A 后 B。A 成功后仍评估 B。敏感接口即使拒绝了请求，只要请求确实到达，D3 仍可产生告警。O 关闭时 B 到不了数据服务，因此没有 B 告警。T 无权限或 D2 开启时，B 的请求已经到达数据服务，随后被拒，因此开启 D3 时仍有 B 告警。

这一段比"成功／失败"表更重要：它决定将来流线是消失、撞护栏，还是穿透。


## Day 3 实施记录

### AI 提出的字段设计

场景 JSON：七节点（N1—N7，含 label、description、canvasX、canvasY）、两条路径（A：N1→N2→N3→N7；B：N1→N2→N4→N5→N6→N7）、initialConditions（O: open/closed，T: granted/revoked）、defenses（D1 blocksPath A、D2 blocksPath B、D3 alerts）、三个预设（A/B/C）。不含预先算好的 outcome、不含可执行脚本、不含第四个用户可选预设。

契约类型：NodeId、PathId、StepId、ConditionId、ConditionValue、DefenseId、PresetId、Node、PathStep、Path、InitialConditionConfig、DefenseConfig、Preset、Scenario、RunInput、ConditionCheck、StepOutcome、PathEvent、Alert、PathResult、RunResult。

### 我纠正的地方

1. 路径 B 的 T 与 D2 检查位置。AI 初稿把 condition T 与 barrier D2 放在 B4（N5→N6）。改为 B4（N5→N6）不带条件检查，B5（N6→N7）带 condition T 与 barrier D2。理由：T 是服务令牌属性，但检查发生在数据服务读取明细之前，不是令牌向数据服务发请求时。
2. 敏感接口到达点。要求明确 A2 到达 N3、B4 到达 N6，写入步骤元数据（sensitiveArrival），不由前端猜测。
3. PathOutcome 改名为 StepOutcome。整条路径是否到达明细、首次阻断步骤与原因由 PathResult 单独记录；告警为事件上的独立字段，不作为互斥的步骤结果。
4. ConditionCheck 需能引用 O、T、D1、D2，记录实际值、是否满足与解释；O 与 T 取值类型分别约束，不允许 O=granted 或 T=open。
5. RunInput 的 conditions 为判定依据；presetId 只表示起始预设，用户调整后不得用预设覆盖实际条件。
6. 推演表事件编号。AI 将 B2 写成 eventIndex 3，应为 4。完整编号 A1=0、A2=1、A3=2、B1=3、B2=4、B3=5、B4=6、B5=7。
7. 推演表仅列 A2/A3/B2/B4/B5，要求 A1、B1、B3 同样作为事件存在（outcome passed），分别占住 eventIndex 0、3、5，否则被阻断路径的后续步骤无法保留占位。

### 三种情况的事件与告警预期（AI 推演，我已核对）

| 配置 | 关键事件 | 告警数 |
| --- | --- | --- |
| A 预设 + D1 + D3 | A2 到达 N3（告警）→ A3 被 D1 拒；B4 到达 N6（告警）→ B5 到达明细 | 2 |
| B 预设 + 仅 D3 | A2 到达 N3（告警）→ A3 到达；B2 被 O 拒 → B3/B4/B5 未执行 | 1 |
| C 预设 + 仅 D3 | A2 到达 N3（告警）→ A3 到达；B4 到达 N6（告警）→ B5 被 T 拒 | 2 |

三组告警数与 expected-runs.csv 中 A-101、B-001、C-001 一致。

### 本机验收结果

| 检查 | 结果 |
| --- | --- |
| JSON 解析场景版本 | 1 |
| CSV 行数 | 32 |
| CSV 分组 | A 8、B 8、C 8、X 8 |
| npm run build | 四个 workspace 全部通过 |
| npm run typecheck | 四个 workspace 全部通过 |
| git diff --check | 仅 CRLF 换行提示，无空白错误 |

### 遇到的问题

PowerShell 5.1 的 Get-Content -Raw 默认按系统 ANSI（GBK）读取，直接解析 UTF-8 的 scenarios/campus-registration/v1.json 时中文乱码并吞掉后续引号，报 "传入的对象无效，应为':'或'}'"。改用 -Encoding UTF8 后正常解析，version 输出 1。文件本身编码无误。

git diff --check 提示 "LF will be replaced by CRLF the next time Git touches it"，属 Windows 换行符行为，不影响内容。

### 关于标准答案的效力说明

标准答案 CSV 由需求规则独立确定，早于引擎实现。Day 3 只验证文件可解析、类型可构建，尚未验证推演正确性。引擎实现后的正确性核对留给 Day 4—6。
