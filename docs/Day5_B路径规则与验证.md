# Day 5：路径 B 规则与验证

## 今日边界

只实现 B1—B5 的确定性事件与路径结果，不改场景、契约或 32 行期望 CSV。

## 事件规则

B1=3，B2=4，B3=5，B4=6，B5=7。

O 在 B2 检查；T、D2 在 B5 检查；D3 在实际执行的 B4 到达 N6 时告警。

B2 被拒后，B3、B4、B5 仍保留事件位置，结果为 skipped，且没有 B 告警。

## 人工预期案例

| O | T | D2 | D3 | B2 | B4 告警 | B5 | B 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 关 | 有 | 关 | 开 | rejected | 无 | skipped | blocked at B2 |
| 开 | 有 | 关 | 关 | passed | 无 | data-arrived | reached |
| 开 | 有 | 关 | 开 | passed | N6 | data-arrived | reached |
| 开 | 无 | 关 | 开 | passed | N6 | rejected | blocked at B5 |
| 开 | 有 | 开 | 开 | passed | N6 | rejected | blocked at B5 |
| 开 | 无 | 开 | 开 | passed | N6 | rejected，记录 T 与 D2 均不满足 | blocked at B5 |

## 两个容易出错的细节

- B5 同时记录 T、D2 两项检查。两者都不满足时，两项都要显示；firstBlockedStepId 仍是 B5，解释不要只归咎于其中一项。
- B4 发生的告警不能因为 B5 随后被拒而消失。反过来，O 关闭使 B4 根本没执行时，不能产生 B 告警。

## AI 协作与修正

原始 Prompt 要求：只实现 evaluatePathB，固定事件下标 3—7，O 在 B2 检查，T 与 D2 在 B5 检查，D3 只在 B4 到达 N6 时告警，B2 被拒后 B3—B5 标为 skipped 且不得伪造检查或告警，D1 与 presetId 不参与 B 的判定。

AI 首次给出的方案中，事件结构、T/D2 位置、skipped 处理均正确，未出现把 T/D2 放回 B4、遗漏 B1=3 或 B3=5、把 D3 当成阻断三类错误。

我指出的不足：AI 的测试计划未覆盖 Day 5 指南第四步要求的三项断言——每次调用都返回 5 个事件且下标恒为 [3,4,5,6,7]、D1 开关不改变 B、presetId 不改变 B。要求补充为对同一组 conditions 分别改变 D1 与 presetId 的全等比较，而不是仅检查代码未读取这些字段。

AI 据此补齐两个独立性用例，最终测试为 14 项通过（A 的 5 项 + B 的 9 项）。

## 本机验收

| 命令 | 结果 |
| --- | --- |
| npm run test --workspace @link-lab/engine | 退出码 0，2 个测试文件，14 tests passed |
| npm run build | 退出码 0，四个 workspace 全部通过 |
| npm run typecheck | 退出码 0，contracts 先构建，四个 workspace 通过 |
| git diff --check | 仅 CRLF 换行提示 |
| git status --short | 仅 README.md 与 engine/src/index.ts 被修改，另三个为新增；scenarios、contracts、expected-runs.csv、pathA.ts、pathA.test.ts 均未出现 |

测试覆盖：6 组事件级情况（B2 被拒、全通过、全通过+D3、T 拒绝+D3、D2 拒绝+D3、T 与 D2 双拒+D3），D1 与 presetId 独立性各 1 项，32 行 CSV 的 pathBReached 比对 1 项。

CSV 仅断言 pathBReached，未比较 pathAReached 与 alertCount（后者是 A+B 总告警数）。因此本日不能声称 32 组完整运行已通过。

Day 5 的准确完成表述：路径 A、B 已分别能生成确定性事件，B 的最终到达结果已与 32 行标准答案逐行核对。Day 6 再组合两个结果，核对每一行的 pathAReached、pathBReached 和总 alertCount。

