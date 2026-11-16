export const PAID_PLAN = "user:pro"
export const PAID_PLAN_SLUG = "pro"
export const PAID_PLAN_REQUIRED = "PAID_PLAN_REQUIRED"
export const PAID_PLAN_MESSAGE =
  "Upgrade to Pro to create or use bots and sandboxes."
export const paidPlanFailure = {
  success: false as const,
  code: PAID_PLAN_REQUIRED,
  error: PAID_PLAN_MESSAGE,
  fieldErrors: undefined,
}

export function isPaidPlanError(error: unknown) {
  return (
    error === PAID_PLAN_MESSAGE ||
    (error instanceof Error && error.message.includes(PAID_PLAN_MESSAGE))
  )
}

export class PaidPlanRequiredError extends Error {
  constructor() {
    super(PAID_PLAN_MESSAGE)
    this.name = "PaidPlanRequiredError"
  }
}

type Subscription = {
  subscriptionItems: {
    status: string
    periodStart: number
    periodEnd: number | null
    endedAt: number | null
    isFreeTrial: boolean
    plan: { slug: string; forPayerType: string } | null
  }[]
}

/** Clerk keeps canceled subscriptions entitled until the paid period ends. */
export function hasPaidSubscription(
  subscription: Subscription,
  now = Date.now()
) {
  return subscription.subscriptionItems.some(
    (item) =>
      item.plan?.slug === PAID_PLAN_SLUG &&
      item.plan.forPayerType === "user" &&
      !item.isFreeTrial &&
      item.periodStart <= now &&
      (item.endedAt === null || item.endedAt > now) &&
      (item.periodEnd === null || item.periodEnd > now) &&
      (item.status === "active" ||
        (item.status === "canceled" &&
          item.periodEnd !== null &&
          item.periodEnd > now))
  )
}
