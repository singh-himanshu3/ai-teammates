import { createClerkClient } from "@clerk/backend"
import { hasPaidSubscription, PaidPlanRequiredError } from "./shared.ts"

/** Worker checks use the database-owned user ID, never client entitlement metadata. */
export async function assertPaidUser(userId: string) {
  if (!process.env.CLERK_SECRET_KEY)
    throw new Error(
      "Billing verification is not configured on the chat worker."
    )
  const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
  let subscription
  try {
    subscription = await client.billing.getUserBillingSubscription(userId)
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 404
    )
      throw new PaidPlanRequiredError()
    throw new Error("Could not verify your subscription. Please try again.")
  }
  if (!hasPaidSubscription(subscription)) throw new PaidPlanRequiredError()
  return subscription
}

/** Exact Clerk period, never a client timestamp or a calendar-month reset. */
export async function getPaidPeriod(userId: string) {
  const subscription = await assertPaidUser(userId)
  const now = Date.now()
  const item = subscription.subscriptionItems.find((item) =>
    hasPaidSubscription({ subscriptionItems: [item] }, now)
  )
  if (!item || !item.periodEnd || item.periodEnd <= item.periodStart)
    throw new Error("Your subscription's billing period could not be verified.")
  return {
    userId,
    startsAt: new Date(item.periodStart),
    endsAt: new Date(item.periodEnd),
  }
}
