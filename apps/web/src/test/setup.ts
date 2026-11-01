import "@testing-library/jest-dom/vitest";

// jsdom 不提供 ResizeObserver，@xyflow/react 依赖它，这里提供最小 mock。
class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
