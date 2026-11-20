# Sentry monitoring

The `ai-teammates` Sentry organization and project receive this application's
browser, Next.js server/edge, handled server-action, chat-turn and final task
failure events. The public DSN lives in `lib/monitoring/shared.ts`. It is not a
secret. `NEXT_PUBLIC_SENTRY_DSN` can override it for another destination.

## Runtime configuration

- `instrumentation-client.ts` initializes browser error capture, navigation
  tracing and masked Session Replay. Feedback is available programmatically;
  no feedback widget is injected into the chat UI.
- `instrumentation.ts` loads the server/edge configuration and registers Next's
  request-error hook. `app/global-error.tsx` captures React render failures.
- `reportServerError` reports action failures that are caught and returned to
  the UI instead of thrown.
- `trigger.config.ts` initializes worker monitoring and captures final task
  failures. `teammateChat.onTurnComplete` also reports failed turns that do not
  terminate the long-lived chat task.
- Workers keep Trigger's existing OpenTelemetry provider. Sentry links error
  context to the active trace without installing another provider. Worker
  performance traces continue to be available in Trigger.

Next.js traces are sampled at 100% during development and 10% in production.
Replay samples 10% of sessions and captures error sessions, with all text and
inputs masked and media blocked. No canvas recording integration is enabled.
Automatic collection of AI prompts/results, task arguments, database parameters,
HTTP bodies, headers, cookies, query values and user identity is disabled.
Console breadcrumbs are omitted because existing logs may include tool output.
Avoid putting private data in exception messages or manually supplied metadata.

Routine plan refusals, usage-limit errors and cancellation are filtered out.
They should remain user-facing errors without becoming Sentry incidents.

## Build authentication and readable stack traces

`SENTRY_AUTH_TOKEN` is a secret used only for build-time release/source-map
uploads. Keep it in `.env.local` for local Next builds, the Railway service's
secret variables for web builds, and the deployment shell/CI for Trigger builds.
Do not put it in a `NEXT_PUBLIC_` variable or source control.

The Next.js Sentry wrapper uploads web source maps and deletes the generated maps
after upload. Railway's commit SHA supplies the production release. The Trigger
esbuild extension uploads worker maps on deployment, using the bundler-injected
release to match runtime events. Both upload to the same Sentry project.

When deploying Trigger, expose only the needed build token to the deployment
process. Do not use the entire local `.env.local` as production configuration:
its `tr_dev_...` key must never replace the existing production `tr_prod_...` key.

## Verification and rollout

The setup was verified through a genuine error in the running Next.js app:
[AI-TEAMMATES-1](https://ai-teammates.sentry.io/issues/AI-TEAMMATES-1),
`Error: Sentry setup verification: ai-teammates 2026-11-20`.
Sentry returned a TypeScript file, line number and source context. The temporary
verification endpoint was removed afterward; it is not a permanent public route.

Run `node --test --test-concurrency=1 scripts/*.test.mjs` for regression tests,
including expected-error filtering and serialized worker-stack preservation.
Run the typechecker, lint and production build before shipping. Deployment is
separate: push the approved changes to Railway's source branch and deploy the
updated Trigger tasks, then confirm events from the production environment.
