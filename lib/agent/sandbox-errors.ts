import { UsageLimitError } from "../usage/policy.ts"

export class SandboxSetupError extends Error {}

/** Only known, credential-free messages may leave the server. */
export function sandboxErrorMessage(error: unknown) {
  if (error instanceof SandboxSetupError) return error.message
  if (error instanceof UsageLimitError) return error.message
  const status =
    typeof error === "object" && error !== null && "statusCode" in error
      ? error.statusCode
      : undefined
  if (status === 401 || status === 403) {
    return "Daytona rejected the API key or sandbox permissions. Check DAYTONA_API_KEY in both the app server and chat worker."
  }
  if (status === 429) {
    return "Daytona's sandbox quota or rate limit was exceeded. Check the account's limits or stop unused sandboxes, then retry."
  }
  if (status === 400 || status === 422) {
    if (
      error instanceof Error &&
      error.message.includes("organization does not have a default region")
    ) {
      return "Your Daytona organization has no default region. Open the Daytona Dashboard and select a default region for the organization, then reconnect."
    }
    return "Daytona rejected the sandbox configuration. Check DAYTONA_TARGET (us or eu) and DAYTONA_SNAPSHOT, then retry."
  }
  if (status === 404) {
    return "The assigned Daytona sandbox could not be found. Check that the sandbox and API key belong to the same organization."
  }
  return "The sandbox operation failed. Check the sandbox's availability, desktop setup, and Daytona configuration before retrying."
}
