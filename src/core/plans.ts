import type { Plan } from "../types.js";

export interface PlanLimits {
  maxWatches: number;
  minIntervalSec: number;
  aiPerDay: number;
  scansPerDay: number;
  scanPages: number;
}

export const PLANS: Record<Plan, PlanLimits> = {
  free: { maxWatches: 3, minIntervalSec: 300, aiPerDay: 50, scansPerDay: 2, scanPages: 5 },
  pro: { maxWatches: 25, minIntervalSec: 60, aiPerDay: 1000, scansPerDay: 20, scanPages: 20 },
};

export const INTERVAL_CHOICES = [60, 120, 300, 600, 1800];

export function clampInterval(plan: Plan, sec: number): number {
  return Math.max(PLANS[plan].minIntervalSec, Math.min(3600, Math.round(sec)));
}

/** Pro days the inviter and the invited friend each get. */
export const REFERRAL_DAYS = 7;
