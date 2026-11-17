export const USAGE_LIMITS = {
  aiMicrodollars: 5_000_000,
  sandboxSeconds: 20 * 3600,
  sandboxes: 3,
  sessionSeconds: 15 * 60,
  stopMarginSeconds: 60,
  maxOutputTokens: 4096,
} as const

export class UsageLimitError extends Error {
  constructor(message: string) {
    super(`Usage limit: ${message} View Usage in your account menu.`)
    this.name = "UsageLimitError"
  }
}

export function isUsageLimitError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).includes(
    "Usage limit:"
  )
}

// Standard online rates, verified 2026-11-16. Cache reads are deliberately
// charged at the ordinary input rate. No hosted search or other paid tools.
// https://aistudio.google.com/docs/pricing#gemini-3.6-flash
// https://console.groq.com/docs/model/openai/gpt-oss-120b
export function modelRate(provider: "google" | "groq", now = Date.now()) {
  if (provider === "groq") return { input: 0.15, output: 0.6, maxInput: 131072 }
  const promotional = now < Date.UTC(2027, 0, 1)
  return {
    input: promotional ? 0.75 : 1.5,
    output: promotional ? 3.75 : 7.5,
    maxInput: 1048576,
  }
}

export function aiCost(
  rate: ReturnType<typeof modelRate>,
  input: number,
  output: number
) {
  if (![input, output].every((n) => Number.isSafeInteger(n) && n >= 0))
    throw new Error("Invalid provider token usage.")
  // USD per million tokens equals microdollars per token.
  return Math.ceil(input * rate.input + output * rate.output)
}
