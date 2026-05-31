export type InvestmentPlan = {
  daily_return_percent: number | string;
  duration_days: number | string;
};

export type InvestmentCycle = {
  carried_yield_usd?: number | string | null;
  created_at?: string | null;
  daily_credit_usd?: number | string | null;
  duration_days?: number | string | null;
};

const creditDayMs = 24 * 60 * 60 * 1000;

export function calculatePlanValues(principal: number, plan: InvestmentPlan) {
  const dailyPercent = Number(plan.daily_return_percent || 0);
  const durationDays = Math.max(Number(plan.duration_days || 0), 0);
  const dailyCredit = Number((principal * (dailyPercent / 100)).toFixed(2));
  const projectedReturn = Number((dailyCredit * durationDays).toFixed(2));
  return { dailyCredit, durationDays, projectedReturn };
}

export function calculateCarriedYield(investment: InvestmentCycle) {
  const carriedYield = Number(investment.carried_yield_usd || 0);
  const dailyCredit = Number(investment.daily_credit_usd || 0);
  const durationDays = Math.max(Number(investment.duration_days || 0), 0);
  const startedAt = Date.parse(String(investment.created_at || ""));
  const elapsedMs = Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : 0;
  const completedDays = Math.min(durationDays || Number.MAX_SAFE_INTEGER, Math.floor(elapsedMs / creditDayMs));
  return Number((carriedYield + (dailyCredit * completedDays)).toFixed(2));
}
