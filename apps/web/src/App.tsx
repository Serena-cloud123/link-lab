export default function App() {
  return (
    <main className="shell">
      <p className="stage">Day 2 · 项目骨架</p>
      <h1>链路实验室骨架已启动</h1>
      <p className="lead">
        当前只验证前后端可以运行。路径判定、场景配置、O/T 滑块、React Flow
        画布、动画、数据库业务表和模型 API 均未实现。
      </p>

      <section className="boundary" aria-labelledby="boundary-title">
        <h2 id="boundary-title">模型边界</h2>
        <p>
          本沙盘只建模一个虚构校园报名场景、两条预设路径 A/B、三种防御
          D1/D2/D3 和两个初始条件 O/T。
        </p>
        <p>
          推演结果只说明本模型中的路径是否到达模拟数据，不代表任何真实系统的安全结论，也不能替代动手实操。
        </p>
      </section>

      <p className="hint">入门引路用途 · 不执行真实攻击</p>
    </main>
  );
}
