# Day 2 启动验证

- 日期：2026-10-26
- Node.js 版本：v24.21.0
- npm 版本：11.19.0
- Git 版本：2.53.0.windows.2

- npm install 结果：通过。changed 4 packages, audited 128 packages, found 0 vulnerabilities。附带警告：esbuild@0.28.2 的 postinstall 未被 allowScripts 批准。

- npm run build 结果：通过，四个工作区依次成功。contracts、engine、api 的 tsc 编译无错误；web 的 tsc --noEmit 与 vite build 成功，产出 dist/index.html 0.40 kB、dist/assets/index-D8GCwqTR.css 0.87 kB、dist/assets/index-B0djWab-.js 223.52 kB。

- 后端启动地址：http://127.0.0.1:3001。启动日志显示 Server listening at http://127.0.0.1:3001。

- GET /health 实际返回：HTTP 200，响应时间约 16ms，返回 status=ok、service=@link-lab/api。

- 前端启动地址及看到的文字：http://127.0.0.1:5173。页面显示标题"链路实验室骨架已启动"，以及模型边界文字"本沙盘只建模一个虚构校园报名场景、两条预设路径 A/B、三种防御 D1/D2/D3 和两个初始条件 O/T。推演结果只说明本模型中的路径是否到达模拟数据，不代表任何真实系统的安全结论，也不能替代动手实操。"页脚标注"入门引路用途 · 不执行真实攻击"。

- SQLite 内存读写检查结果：通过，输出 1。使用 Node 24 内置 node:sqlite 的 DatabaseSync 接口，建表、写入、读取均成功，未引入 ORM。

- 遇到的真实问题、AI建议、我的判断及修复：

  1. 步骤 3 阶段 AI 自行执行了 git commit（ac93639），超出我给定的范围。AI 给出的方案本身合规，但提交粒度应由我控制。我执行 git reset --soft HEAD~1 撤回该提交，保留全部文件改动，改为本人在完成本机验证后手动提交。

  2. AI 回复中提到"本机代理沙箱会把 npm workspace junction 指向临时快照路径"，因此骨架未让 API 跨包导入 contracts。我以本机 npm install 与 npm run build 的实际结果为准进行核对，未采信该说明作为结论。

  3. npm install 提示 esbuild@0.28.2 的 postinstall 未被 allowScripts 覆盖。本轮 build 与前端启动均正常，故未处理，记录待观察。

  4. 后端启动日志出现 "Change detected in 'node_modules/ajv/dist/compile/validate/index.js'" 并触发重启，说明文件监视范围包含 node_modules。本轮仅记录，不修改配置。

  5. PowerShell 中执行含双引号的 node -e 命令时引号被剥离（报错显示 require(node:sqlite)），导致 SQLite 检查失败。改用单引号包裹的等价命令后输出 1，通过。后续含引号的 Node 验证需注意 PowerShell 的引号处理。

- 对应 Git 提交：随 Day 2 骨架提交保存，提交号见 git log --oneline
