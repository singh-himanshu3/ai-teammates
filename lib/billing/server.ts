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
}
