# Day 12：运行保存与模板解释

## 今日目标

显式保存一次确定性推演：服务器根据 RunInput 重新推演，
把输入、RunResult、场景版本和一句规则模板解释一起写入 SQLite。
可以按记录 ID 读回；历史列表与界面回放留到 Day 13。

## 起点核对

- HEAD：`8d04747`（docs: 封存第二条Prompt链与Day7-11原始对话）
- 工作区状态：`git status --short` 无输出
- 构建 `npm run build`：无报错
- 类型检查 `npm run typecheck`：无报错
- 测试 `npm run test`：web 35 passed（2 文件）、api 13 passed（1 文件）、engine 23 passed（3 文件）

## 冻结边界

<!-- 写明本日允许和禁止修改的范围，审核 AI 方案时对照此处。 -->
- 保留现有 `/api/evaluations` 的无持久化行为。
- 只有显式保存才创建记录；基线补跑不自动保存。
- 保存结果由后端调用确定性引擎产生，不信任前端提交的结论。
- 按 ID 读取只读数据库，不重新推演或生成解释。
- 不修改引擎规则、场景 JSON、32 条期望 CSV 和动画规则。

## AI 协作过程

### 第 1 轮：方案

- 我的 Prompt：要求先只出计划、不写文件，说明两条新接口的请求/响应/错误码、数据库位置与测试隔离、服务器重算方式、GET 只读保证、前端保存的竞态处理、文件与测试清单、今天明确不做的内容。附加约束：contracts 只可新增 `records.ts` 并在 `index.ts` 追加一行 re-export（删除行数须为 0）；数据库路径须让 src 与 dist 启动指向同一文件。
- AI 的建议：复用现有 `runInputSchema` 做严格校验；新增 `db.ts`、`explanation.ts`，`app.ts` 只负责接线；`buildServer` 增加第二参数 `{ dbPath }`；用 `import.meta.url` 向上三级推导数据库路径；GET 用一条预编译 SELECT；前端用 `saveTokenRef` + `runVersionRef` 双闸门；测试用 `:memory:` 与临时目录。
- 我的审查与修正：三处打回。①默认路径被放到仓库根 `.data/`，与「固定在 `apps/api/data/`」不符，改为 `../data/link-lab.db`，并要求在 `.gitignore` 显式写入 `apps/api/data/`；②记录字段缺 `savedAt` 与 `explanationSource`（AI 用 `createdAt` 代替前者、完全漏掉后者），要求按 9 个字段对齐；③「GET 不重算」的哨兵测试用 `:memory:` 无效（第二条连接是独立空库），要求改用 `mkdtemp` 临时文件库。

### 第 2 轮：后端保存

- 我的 Prompt：按已审核计划只实现后端与共享响应类型，不动前端；复用严格校验、服务端调用 `evaluateRun`、解释为纯函数、写失败不得报成功、GET 不调用引擎、数据库固定 `apps/api/data/`、测试用独立库并关闭连接、只用参数绑定 SQL。追加四条约束：contracts 删除行数必须为 0；`app.test.ts` 只允许改 `buildServer` 调用、不得弱化既有断言；两路阻断必须逐条写出 `firstBlockedStepId` 与引擎原样 `blockedReason`；报告须贴出 GET 完整 SQL 与保存处理器中调用引擎的那一行。
- AI 的修改：新增 `apps/api/src/db.ts`（路径推导、建表、参数绑定 INSERT/SELECT）、`apps/api/src/explanation.ts`（纯函数模板）、`packages/contracts/src/records.ts`、`apps/api/tests/runs.test.ts`、`apps/api/tests/explanation.test.ts`；修改 `apps/api/src/app.ts`（新增两条路由与 `dbPath` 参数）、`apps/api/src/server.ts`（SIGINT/SIGTERM 与监听失败时关闭连接）、`apps/api/tests/app.test.ts`（仅一行 `buildServer` 调用）、`packages/contracts/src/index.ts`（追加一行 re-export）、`.gitignore`、`apps/api/.env.example`。
- 我的审查与修正：静态核对全部通过——冻结三文件 diff 为空；`git diff --numstat` 下 `index.ts` 为 `1 0`；`app.test.ts` 的 diff 只有 `buildServer` 那一行，13 条既有断言未动；`evaluateRun` 只出现在 `app.ts:96`（原 `/api/evaluations`）与 `app.ts:106`（`POST /api/runs`），`buildRunExplanation` 只在 `app.ts:114`；改动文件清单无 `package.json`/`package-lock.json`。另逐句审了解释模板：四种路径组合各自成句，告警子句固定为「但未自动阻断」，两路阻断写出 `stepId` 与引擎原样 reason，全文无「安全」「实战」「真实环境」「攻击概率」字样。
- 测试结果：api 26 passed（3 文件）、engine 23 passed、web 35 passed；`npm run build` 与 `npm run typecheck` 无报错。提交 `272fa3e`，11 files changed，728 insertions(+)，6 deletions(-)。


### 第 3 轮：工作台保存入口

- 我的 Prompt：只接工作台的显式保存入口；仅在 `runState.status === "done"` 时显示；点击以该次 `runState.input` 调用 `POST /api/runs`；保存中禁用重复点击；成功展示记录 ID、保存时间与库中返回的一句话解释；失败显示错误并允许重试。特别处理竞态：保存未返回时若切预设、改 O/T、改防御或开始新运行，旧响应不得把新运行标记为已保存。学习记录页只如实说明已支持保存。追加约束：请求体禁止携带 `result`/`explanation`；来源标签必须取自响应字段 `explanationSource`，不得硬编码 `"template"`；`id` 与 `savedAt` 取响应字段而非本地时钟；保存入口不得挂进 `run()` 或 `runBaseline()`；不改 `apps/api`、engine、场景 JSON、CSV；既有 35 项测试不得改动或弱化。
- AI 的修改：`apps/web/src/api.ts` 新增 `saveRun(input)`；`apps/web/src/App.tsx` 增加 `saveTokenRef`、`saveInFlightRef`、`mountedRef` 与 `saveState`，新增 `invalidateSave()` 并在 `run()`、`handleSelectPreset()`、`loadScenario()` 三处调用，新增 `handleSaveRun()` 与底部保存区，`explanationSourceLabel()` 从响应字段映射来源；`apps/web/tests/App.test.tsx` 新增 8 项测试。
- 我的审查与修正：先审代码——闸门同时校验 `saveTokenRef` 与 `runVersionRef`，失败分支也有同一校验；请求体为 `JSON.stringify(input)`，无 `result`；来源取自 `record.explanationSource`；`id`、`savedAt` 取自响应。随后浏览器中找不到保存按钮，改从代码核实可见条件：页面默认停在「场景介绍」（`App.tsx:79` 的 `useState<PageId>("intro")`），保存按钮位于 `runState.status === "done"` 分支内、「运行结果」面板最底部（`App.tsx:796—838`），必须先跑一次并向下滚动。这不是代码缺陷，是先前的检验步骤按文档推断、未读代码所致；据此重写步骤后逐项实测。
- 测试结果：web 43 passed（原 35 + 新 8）、api 26 passed、engine 23 passed；`typecheck` 与 `build` 无报错。前端实测：保存成功提示含响应 ID 与 `savedAt`，来源标注为「规则模板」；`/api/runs` 请求体仅含 `RunInput` 字段；保存中连点不产生额外请求；保存未返回时切配置，旧响应未错误归属到新配置；播放跳转不影响已保存提示；停掉 API 后保存显示失败、重启后可重试成功；学习记录页无伪造列表。

## 接口与存储核对

- POST /api/runs：请求体为 `RunInput`（`scenarioId`、可选 `presetId`、`conditions.O/T`、`defenses`），`additionalProperties: false`，携带 `result`/`explanation` 直接 400。成功返回 201 与 `RunRecord`：`id`、`savedAt`、`scenarioId`、`scenarioVersion`、`input`、`result`、`explanation`、`explanationSource`、`explanationVersion`。非法输入 400 且不写库；写入异常 500 且不产生半条记录。
- GET /api/runs/:id：返回 200 与同一结构的 `RunRecord`；不存在 404；读取异常 500。处理器只执行一条预编译 SELECT，不调用 `evaluateRun`，也不调用 `buildRunExplanation`。
- 数据库位置与忽略规则：`apps/api/data/link-lab.db`，目录自动创建；`src` 启动与 `dist` 启动推导出同一绝对路径（实测两行输出完全一致）。`.gitignore` 新增 `apps/api/data/`，`git check-ignore -v apps/api/data/link-lab.db` 命中 `.gitignore:13`。
- 场景版本、解释来源及解释版本：`scenarioVersion=1`、`explanationSource=template`、`explanationVersion=1`；由服务端写入，前端只按字段展示。

## 重启验证

- 保存的记录 ID：`4f87b16b-9b48-468c-8d6c-4e39957e3eb2`
- 重启前：`savedAt` 为 `2026-11-04T05:34:28.270Z`；events 8；A `blocked`（`firstBlockedStepId` 为 A3）、B `reached`；`alertCount` 2；解释为「路径 A 在 A3 被阻断（D1 已开启，管理导出接口拒绝请求），但路径 B 仍到达模拟数据；本次 D3 记录了 2 条敏感请求告警，但未自动阻断。」
- 重启后：同一 ID 查得 `savedAt` 仍为 `2026-11-04T05:34:28.270Z`；解释逐字相同（`-eq` 为 True）；events 仍 8；A 仍 `blocked/A3`、B 仍 `reached`；`alertCount` 仍 2。
- 独立进程旁证：另起一个 `node` 进程用 `node:sqlite` 直接打开磁盘文件查询，`SELECT count(*)` 返回 1，证明记录来自磁盘而非进程内存。
- input、8 条 events、pathResults、解释是否一致：一致。


## 迁移题草案

题目：某社团资料系统关闭了诊断页面，服务令牌仍有读取权限，只开启 D3。
小李说：“D3 记录了请求，所以资料不会到达。”
请指出这句话哪里错；在本沙盘已建模的两条路径内，哪条仍可能到达，为什么？

标准答案：O 关闭使 B 在 B2 被拒，后续步骤未执行；
D3 记录敏感请求但不阻断；D1 未开启时，A 仍可能到达模拟数据。
结论只适用于两条已建模路径。

<!-- 今日只冻结题意与答案，不声称答题界面已经完成。 -->

## 今日交付与遗留

- 实际提交：`272fa3e` feat: 保存确定性推演与模板解释（后端与共享类型）；`feat: 在工作台显式保存运行`（前端保存入口、README、本文档与证据索引，哈希见 `git log`）。
- 原始 Prompt 对话的保存位置：Trae 整包导出，按 Day 13 封存链 03 时统一导出，覆盖 Day 12—13；导出前不以整理稿替代原始记录。
- 已完成：服务器重算并落库的运行保存、只读按 ID 读取、9 字段不可变记录、纯函数规则模板解释、src/dist 同路径、工作台显式保存入口与竞态闸门、迁移题题意与标准答案冻结（不含答题界面）。
- 留给 Day 13：历史列表、记录回放、同版本重算核对，以及版本不匹配时「仍可回放但不声称重新验证通过」的口径。