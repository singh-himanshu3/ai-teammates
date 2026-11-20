import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { after, test } from "node:test"
import { sentryOptions, isExpectedError } from "../lib/monitoring/shared.ts"

const state = { initialized: false, options: null, events: [], flushes: 0 }
globalThis.__monitoringTest = state
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@sentry/node" || specifier === "@sentry/nextjs")
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(`
        export const isInitialized = () => globalThis.__monitoringTest.initialized;
        export const init = options => { globalThis.__monitoringTest.options = options; globalThis.__monitoringTest.initialized = true; };
        export const openTelemetryIntegration = () => ({name: "OpenTelemetry"});
        export const captureException = (...args) => globalThis.__monitoringTest.events.push(args);
        export const flush = async () => { globalThis.__monitoringTest.flushes++; return true; };
      `)}`,
      }
    return next(specifier, context)
  },
})
const { reportWorkerError, initializeWorkerMonitoring } =
  await import("../lib/monitoring/worker.ts")
const { reportServerError } = await import("../lib/monitoring/server.ts")
after(() => {
  hooks.deregister()
  delete globalThis.__monitoringTest
})

test("usage limits, plan gates and cancellation are excluded while unexpected errors remain reportable", async () => {
  for (const name of [
    "UsageLimitError",
    "PaidPlanRequiredError",
    "AbortError",
  ]) {
    const error = Object.assign(new Error("Expected refusal"), { name })
    assert.equal(isExpectedError(error), true)
    assert.equal(
      sentryOptions.beforeSend({}, { originalException: error }),
      null
    )
    await reportWorkerError(error, { task: "test" })
    reportServerError(error, "test")
  }
  assert.equal(state.initialized, false)
  assert.equal(state.events.length, 0)
  assert.equal(isExpectedError(new Error("Daytona failed")), false)
})

test("worker errors retain source stacks and context without replacing Trigger's telemetry provider", async () => {
  initializeWorkerMonitoring("PRODUCTION")
  assert.equal(state.options.environment, "production")
  assert.equal(state.options.enableOpenTelemetrySetup, false)
  const stack =
    "Error: Sandbox failed\n    at cleanup (trigger/sandbox-lease.ts:52:9)"
  await reportWorkerError(
    { name: "DaytonaValidationError", message: "Sandbox failed", stack },
    { task: "expire-sandbox-lease", runId: "test-run" }
  )
  const [exception, context] = state.events.at(-1)
  assert.ok(exception instanceof Error)
  assert.equal(exception.name, "DaytonaValidationError")
  assert.equal(exception.stack, stack)
  assert.equal(context.tags.service, "trigger")
  assert.equal(context.tags.task, "expire-sandbox-lease")
  assert.equal(state.flushes, 1)
  reportServerError(new Error("Database failed"), "create-bot")
  assert.equal(state.events.at(-1)[1].tags.operation, "create-bot")
})

test("telemetry omits prompt contents, HTTP bodies, identity, query parameters and console breadcrumbs", () => {
  assert.equal(sentryOptions.dataCollection.userInfo, false)
  assert.deepEqual(sentryOptions.dataCollection.genAI, {
    inputs: false,
    outputs: false,
  })
  assert.deepEqual(sentryOptions.dataCollection.httpBodies, [])
  assert.equal(sentryOptions.dataCollection.databaseQueryData, false)
  assert.equal(sentryOptions.dataCollection.queues, false)
  assert.equal(sentryOptions.dataCollection.urlQueryParams, false)
  assert.equal(
    sentryOptions.beforeBreadcrumb({
      category: "console",
      message: "Private tool output",
    }),
    null
  )
  const navigation = { category: "navigation", message: "Navigated" }
  assert.equal(sentryOptions.beforeBreadcrumb(navigation), navigation)
})
