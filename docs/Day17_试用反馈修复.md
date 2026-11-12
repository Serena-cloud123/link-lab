# Day 17 试用反馈修复

## 起点

Day 16 三名匿名试用（P01—P03），核心教学点「告警 ≠ 阻断」成立——三人皆理解，P01 自己试出。同时汇总 7 条问题，见 `docs/Day16_匿名试用记录.md`。本轮按优先级修复，原则是不碰引擎、不碰冻结文件、不改滑块交互逻辑。

## 修复清单

| # | 反馈 | 处理 | 位置 |
| --- | --- | --- | --- |
| 1 | 不知道扮演安全人员，担心操作真实系统 | 首页改为四段说明：这是什么 / 两条路 / 你要做的 / 全程虚构可重置 | App.tsx |
| 2 | O/T 需靠滑块标题反推 | 预设上方加 O/T 全称图例；滑块标签带（O）（T） | App.tsx |
| 3 | 选完三题才发现提交前必须保存 | 保存块移入答题区，复用既有 `handleSaveRun` | App.tsx |
| 4 | 「已通过」被读成好事 | 改为「请求进入下一步（模拟）」 | labels.ts / playback.ts |
| 5 | 防御按钮像已开启的状态灯 | 本轮未处理，列入后续 | — |
| 6 | 「基线 / 补跑 / 覆盖」堆在同一段 | 本轮未处理，列入后续 | — |
| 7 | UUID、UTC 时间、开发阶段标题、术语 | UUID 改为「已保存到学习记录」；ISO 改本地可读；阶段标题改「攻防因果教学沙盘 · 虚构场景，仅作教学演示」；术语替换；graphAnchor 分隔符改 `·` | App.tsx / styles.css / labels.ts / playback.ts |

## 回归

- build / typecheck / test 全绿：web 66、api 48、engine 23，共 137
- 浏览器六条验收全部通过，重点第 5 条：先选完三题再点保存，三个选项保持选中，提交后反馈与所选答案一致
- 滑块拖动「原地松手 / 换档松手 / 拖回原值松手」对应请求数 0 / 1 / 0，与改动前一致

## 冻结与约束检查

- `git diff -- packages/engine/src packages/engine/tests/expected-runs.csv scenarios/campus-registration/v1.json packages/contracts/` 无输出
- 滑块 `min/max/step/onMouseUp/onKeyUp/onBlur/onTouchEnd` 零改动
- `styles.css` 仅新增 32 行，无删除
- 保存块的 `saveState / saveInFlightRef / saveTokenRef / runVersionRef` 为整体平移，`+` 侧与 `-` 侧逐字一致

## 视频与技术文档

- 三段素材已录，位于仓库外 `D:\day15-assets\`：滑块 00:22、流线 00:41、回放 01:18
- 分镜脚本曾建于 `docs/视频分镜脚本.md`（`587e46d`），Day 19 因改为一镜到底加字幕的录制方式而移除该文件
- 技术文档 §9 试用验证已补入 `docs/技术文档_初稿.md`（`dda22fb`）