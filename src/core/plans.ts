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

/** The fastest a watch may run: the plan's minimum, or the site's politeness floor when that is slower. */
export function minInterval(plan: Plan, site?: { minIntervalSec?: number }): number {
  return Math.max(PLANS[plan].minIntervalSec, site?.minIntervalSec ?? 0);
}

export function clampInterval(plan: Plan, sec: number, site?: { minIntervalSec?: number }): number {
  return Math.max(minInterval(plan, site), Math.min(3600, Math.round(sec)));
}

/** Interval of a new watch: as fast as the plan allows, unless the site asks for a calmer default. */
export function defaultInterval(plan: Plan, site?: { minIntervalSec?: number; defaultIntervalSec?: number }): number {
  return clampInterval(plan, Math.max(PLANS[plan].minIntervalSec, site?.defaultIntervalSec ?? 0), site);
}

/** Pro days the inviter and the invited friend each get. */
export const REFERRAL_DAYS = 7;
