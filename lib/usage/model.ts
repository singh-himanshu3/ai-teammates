import { type LanguageModelMiddleware } from "ai"
import { currentUsagePeriod, reserveAi, settleAi } from "./ledger.ts"
import { aiCost, modelRate, USAGE_LIMITS } from "./policy.ts"

/** Runs for EVERY provider call, including tool-loop steps and handoffs. */
export function usageMiddleware(
  userId: string,
  provider: "google" | "groq"
): LanguageModelMiddleware {
  return {
    specificationVersion: "v4",
    transformParams: async ({ params }) => ({
      ...params,
      maxOutputTokens: USAGE_LIMITS.maxOutputTokens,
    }),
    wrapStream: async ({ doStream }) => {
      const period = await currentUsagePeriod(userId)
      const rate = modelRate(provider)
      // Reserve the documented entire input window, rather than pretending a
      // character estimate can bound image, tool, and reasoning token costs.
      const maximum = aiCost(rate, rate.maxInput, USAGE_LIMITS.maxOutputTokens)
      const id = await reserveAi(
        period.id,
        maximum,
        provider === "google" ? "Gemini 3.6 Flash" : "GPT OSS 120B"
      )
      const result = await doStream()
      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream({
            async transform(chunk, controller) {
              if (chunk.type === "finish") {
                const input = chunk.usage.inputTokens.total
                const output = chunk.usage.outputTokens.total
                if (input !== undefined && output !== undefined) {
                  const actual = aiCost(rate, input, output)
                  if (actual > maximum)
                    throw new Error(
                      "Provider usage exceeded its reserved maximum."
                    )
                  await settleAi(id, actual, input, output)
                }
              }
              controller.enqueue(chunk)
            },
          })
        ),
      }
      // On abort, network failure or missing usage, retain the maximum debit:
      // a failed request may still have been billed by the provider.
    },
    // This agent streams exclusively; block accidental unmetered generate calls.
    wrapGenerate: async () => {
      throw new Error("Non-streaming generation is not enabled.")
    },
  }
}
