import type { OValue, StepOutcome, TValue } from "@link-lab/contracts";

export const oValueText: Record<OValue, string> = {
  open: "开放",
  closed: "关闭"
};

export const tValueText: Record<TValue, string> = {
  granted: "有权限",
  revoked: "无权限"
};

export const stepOutcomeText: Record<StepOutcome, string> = {
  passed: "请求进入下一步（模拟）",
  rejected: "已拒绝",
  skipped: "未执行",
  "data-arrived": "数据到达（模拟）"
};
