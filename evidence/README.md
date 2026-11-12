# 证据索引

本目录保存开发过程的原始证据与 Prompt 链整理稿。每日的核心对话、修正与验证输出按阶段归档。

## 目录分工

| 位置 | 内容 | 性质 |
| --- | --- | --- |
| `iterations/01_原始对话_Day2-6.md` | AI 工具整包导出的原始对话 | 原始文件，不得编辑 |
| `iterations/01_条件与引擎与32条核对.md` | 链 01 的整理稿 | 索引与取舍说明，不替代原始文件 |
| `iterations/02_原始对话_Day7-11.md` | AI 工具整包导出的原始对话 | 原始文件，不得编辑 |
| `iterations/02_两档滑块与规则流线.md` | 链 02 的整理稿 | 索引与取舍说明，不替代原始文件 |
| `iterations/03_原始对话_Day12-13.md` | AI 工具整包导出的原始对话（覆盖 Day 12—13） | 原始文件，不得编辑 |
| `iterations/03_历史回放与版本核对.md` | 链 03 的整理稿 | 索引与取舍说明，不替代原始文件 |
| `iterations/04_原始对话_Day15-18.md` | AI 工具整包导出的原始对话（覆盖 Day 15—18） | 原始文件，不得编辑 |
| `iterations/04_按需修复与最终复现.md` | 链 04 的整理稿 | 索引与取舍说明，不替代原始文件 |
| `docs/Day*_*.md` | 每日实施记录，含 AI 方案要点、我的修正、验证输出 | 过程记录 |
| `docs/screenshots/` | 应用界面截图，命名 `day{日}-{内容}.png` | 产品证据 |

## Prompt 链

按赛题要求，Prompt 链以「一条链覆盖一段连续开发时间」组织，链内包含原始 Prompt、AI 建议、我的取舍、实际修改、真实 Bug 修复与验证输出。

| 链 | 主题 | 计划时间 | 实际时间 | 对应提交 | 整理稿 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | 条件与引擎及 32 条自动核对 | Day 2—6 | 10-26 至 10-30 | 155f710、fb8e851、4717f13、91a7882、d98faa3、610a913、8dea6f2 | `iterations/01_条件与引擎与32条核对.md` | 已封存 |
| 02 | 交互配置、同条件对比与规则状态可视化 | Day 7—11 | 10-31 至 11-04 | cf313aa、ded7996、ac21c23、8b7a3db、6f89f95、a23b073 | `iterations/02_两档滑块与规则流线.md` | 已封存 |
| 03 | 运行保存、历史回放与版本核对 | Day 12—13 | 11-04 至 11-06 | 272fa3e、d0e3a5f、401a074、15b2297、5cb567e、ba19305、5ce5e04、7e6c075、28f2373 | `iterations/03_历史回放与版本核对.md` | 已封存 |
| 04 | 按需修复与最终复现 | Day 15—18 | 11-08 至 11-10 | bb1485b、fbe5bed、fb87729、a94c313、23bd506、94e0f98 | `iterations/04_按需修复与最终复现.md` | 已封存 |

## 链外记录

以下内容不属于三条链，但属于真实的 AI 协作材料，已按日归档在 `docs/`：

| 日 | 主题 | 文件 | 与链的关系 |
| --- | --- | --- | --- |
| Day 7 | 固定场景与确定性推演接口 | `docs/Day7_推演接口与输入校验.md` | 链 02 的起点 |
| Day 8 | 静态工作台与基线运行 | `docs/Day8_静态工作台与基线运行.md`、`docs/screenshots/day8-*.png` | 链 02 的起点材料 |
| Day 9 | 双条件滑块与防御配置 | `docs/Day9_双条件滑块与防御配置.md`、`docs/screenshots/day9-*.png` | 链 02 中段 |
| Day 10 | 同条件基线与干预对比 | `docs/Day10_同条件基线与干预对比.md`、`docs/screenshots/day10-*.png` | 链 02 中段 |
| Day 11 | 事件播放与规则状态可视化 | `docs/Day11_事件播放与规则状态可视化.md` | 链 02 末段 |
| Day 12 | 运行保存与模板解释 | `docs/Day12_运行保存与模板解释.md` | 链 03 前段 |
| Day 13 | 历史回放与版本核对 | `docs/Day13_历史回放与版本核对.md` | 链 03 后段 |
| Day 14 | 复现与交付审查 | `docs/Day14_*.md`、`docs/技术文档_初稿.md` | 链 03 之后，链 04 之前 |
| Day 15 | 浏览器稳定性与素材 | `docs/Day15_浏览器稳定性与素材.md`、`D:\day15-assets` | 链 04 首轮 |
| Day 16 | 匿名试用（无 AI 修改） | `docs/Day16_匿名试用记录.md` | 链 04 第 2 轮的判据来源 |
| Day 17 | 试用反馈修复 | `docs/Day17_试用反馈修复.md` | 链 04 中段 |
| Day 18 | 遗留两项修复与干净目录复现 | `docs/Day18_最终版复现.md`、`evidence/repro/day18/` | 链 04 末段 |
| Day 19 | 重启后逐字段核对与录制（无 AI 参与） | `docs/Day19_正式录制.md` | 链 04 之后 |

## 说明

- 链 01 的原始证据是 Trae 的整包导出文件 `iterations/01_原始对话_Day2-6.md`（约 146 KB，未删改）。整理稿只做索引与取舍说明，不替代原始文件。
- 链 02 的原始证据是 `iterations/02_原始对话_Day7-11.md`（约 244 KB，未删改），整理稿为 `iterations/02_两档滑块与规则流线.md`。
- 链 03 的原始证据是 `iterations/03_原始对话_Day12-13.md`（约 456 KB，未删改），一份导出覆盖 Day 12—13；整理稿为 `iterations/03_历史回放与版本核对.md`。
- 链 04 的原始证据是 `iterations/04_原始对话_Day15-18.md`（约 168 KB，2674 行，未删改），覆盖 Day 15—18；整理稿为 `iterations/04_按需修复与最终复现.md`。Day 16（匿名试用）与 Day 19（重启核对）未使用 AI，无对应对话记录。
- 界面截图统一放 `docs/screenshots/`。

## 冻结范围口径

「冻结文件全程未改」指的是：`packages/engine/src/**`、`scenarios/campus-registration/v1.json`、`packages/engine/tests/expected-runs.csv`，从 Day 1 至当前提交始终未变。

`packages/contracts/src/index.ts` 在 Day 12 有一次纯追加：新增 `packages/contracts/src/records.ts` 承载运行快照类型，`index.ts` 末尾只追加一行 re-export；Day 13 又追加三次：新增 `runs.ts`（历史列表摘要）、`learning.ts`（学习记录与三题）、`verify.ts`（核对响应），`index.ts` 各追加一行导出。四次改动 `git diff --numstat` 均为 `1 0`，删除行数均为 0，未修改任何既有类型、字段或枚举值。详见 `docs/Day12_运行保存与模板解释.md` 与 `docs/Day13_历史回放与版本核对.md`。

`apps/api/src/app.ts` 自 Day 12 起属正常开发范围（新增路由接线），不再列入每日冻结检查。每日冻结检查命令为：