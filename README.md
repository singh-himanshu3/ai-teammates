# Next.js template

This is a Next.js template with shadcn/ui.

## Authentication

Clerk manages sign-in, sign-up, sessions, and account settings. Run `npm run dev`
and use **Create account** in the navigation to get started.

- `/` checks `await auth.protect()` on the server and requires a session.
- `/sign-in` and `/sign-up` use Clerk's prebuilt authentication forms.
- `/dashboard` is an authenticated redirect to the chat workspace at `/`.
- `/` opens your newest chat when one exists; otherwise it shows bot creation.
- The account menu includes profile settings and sign out.

The project is linked to the `ai-teammates` Clerk application. Local development
keys are in the ignored `.env.local`; never commit them. On another machine,
authenticate with `npx clerk@latest auth login`, link the same application, and
run `npx clerk@latest env pull`. Configure production keys in your hosting
environment before deploying.

Keep authorization checks next to private data, Route Handlers, and Server
Actions as those are added. Clerk's provider and navigation alone do not protect
new routes. See the [Clerk Next.js guide](https://clerk.com/docs/nextjs/getting-started/quickstart).

## Database

Drizzle ORM uses the Neon HTTP driver. The existing ignored `.env.local` supplies
`DATABASE_URL` (pooled, for application queries) and `DATABASE_URL_UNPOOLED`
(direct, for Drizzle Kit). Configure both variables in other environments too.
Drizzle Kit loads `.env*` files using Next.js's environment loader.

Import `db` from `@/lib/db` in Server Components, Server Actions, or Route Handlers:

```ts
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

const result = await db.execute(sql`select 1 as connected`)
```

The database module is marked `server-only`. Keep Clerk authorization checks next
to queries that access private data. The HTTP driver supports individual queries
and batched transactions; use the WebSocket driver if interactive transactions
are needed. See the [Drizzle Neon guide](https://orm.drizzle.team/docs/connect-neon).

Define tables in `lib/db/schema.ts`, then use:

- `npm run db:check` — verify connectivity with a read-only query.
- `npm run db:push` — apply the schema directly to the configured database.
- `npm run db:studio` — browse the database in Drizzle Studio.

The `bots` table stores an indexed external user ID, name, avatar seed, job,
optional instructions and sandbox ID, and creation timestamp. Drizzle generates
Nano IDs for the primary key and default avatar seed when inserting rows.
TypeScript types `Bot` and `NewBot` are exported from `lib/db/schema.ts`.
Use schema pushes only; do not generate or run migrations. Review the proposed
changes and confirm the target database when running `db:push`.

## Billing

Clerk Billing uses personal subscriptions. Pro (`pro`) costs $20 USD/month and
unlocks all bot and sandbox features; free accounts cannot create, edit, delete,
or use bots, group chats, or sandbox desktops. Blocked actions show an error
toast with a **View pricing** button linking to `/pricing`. Pricing is not in
the sidebar. Clerk's pricing table handles checkout and subscription changes.

The plan catalog is in `clerk-billing.json`. Preview and apply it to a linked
Clerk instance with:

```bash
npx clerk@latest config patch --file clerk-billing.json --dry-run
npx clerk@latest config patch --file clerk-billing.json --yes
```

The currently linked development instance has billing enabled and both Free
and Pro configured. Production requires its own Clerk production instance
and connected payment gateway.

The app checks Clerk's personal `user:pro` entitlement. Trigger workers check
the chat owner's current subscription through Clerk's Backend API before model
steps and sandbox access, including already-open sessions. `CLERK_SECRET_KEY`
must be set in both the Next.js server and Trigger worker, targeting the same
Clerk instance. Existing application keys remain unchanged. Local startup:

```bash
npm run dev
# In a second terminal; explicitly loads .env.local for the worker:
npm run trigger:dev
```

Use the matching production Clerk key in deployed workers; never put secrets
in source control. No webhook mirror, balance, ledger, or usage-metering table
is used: Clerk remains the subscription source of truth. The billing SDK and
browser bundle versions are pinned because the billing APIs are experimental.

Run the billing and authorization tests with:

```bash
node --experimental-strip-types --test scripts/billing.test.mjs scripts/group-chat-actions.test.mjs
```

## AI chat

Chat pages use AI Elements and the AI SDK's `useChat` hook with a Trigger.dev
chat transport. The `teammate-chat` agent persists conversation history and
loads the bot's name, job, instructions, and sandbox relationship each turn.
Authenticated Server Actions authorize session access and transcript loading.

Set the keys for the providers you want to use in `.env.local` or your hosting
environment (keys stay on the server):

```dotenv
GOOGLE_GENERATIVE_AI_API_KEY=...
GROQ_API_KEY=...
```

The model dropdown defaults to Google (Gemini 3.6 Flash) and also offers Groq
(GPT OSS 120B), using their direct SDK providers. The selected model is shown
in the composer and highlighted with a checkmark in the dropdown. Model IDs
are defined in `trigger/chat.ts`. Configure provider keys in the Trigger.dev
worker environment as well.

## Computer tools

Set `DAYTONA_API_KEY` in both the Next.js server and Trigger.dev worker environments.
Tools and the desktop viewer operate on the sandbox referenced by the bot's
`sandboxId` in `lib/db/schema.ts`. If a bot has no sandbox yet, its first
computer-tool call or desktop-preview connection creates one and stores the ID
on the bot. Each bot uses a stable sandbox name so retries recover an
existing creation. Sandboxes start on demand and stop after five idle minutes.
Select a default region for the organization in the Daytona Dashboard before
creating sandboxes. Daytona requires this account setting even when a request
specifies a region. Optionally set `DAYTONA_TARGET` to `us` or `eu` to override
where new sandboxes run after the organization has been configured.
Desktop actions require a snapshot with Daytona computer-use support; set
`DAYTONA_SNAPSHOT` in the worker environment to select a custom snapshot, or omit
it to use Daytona's default. `DAYTONA_API_URL`, if set, is explicitly passed to
the SDK.

The desktop panel lazily loads a read-only noVNC preview. Click it to open an
interactive fullscreen dialog. One RFB client and canvas are reused between the
two views, including when hiding and reopening the panel. Only the dialog's
close button dismisses fullscreen; Escape and outside interactions do not.
Access is authorized through Clerk and a one-hour, port-scoped signed Daytona
preview URL. Use Reconnect if the connection closes or its credentials expire.

The agent can run Bash commands, read and write UTF-8 files, list directories,
and control the desktop mouse and keyboard. Actions run sequentially, with up to
20 model steps per turn. Commands have a maximum timeout of 120 seconds. Stopping
generation skips queued actions, but an already submitted Daytona request may
finish; command timeouts bound command execution.

`viewScreen` supplies an image to the model without rendering its tool call or
screenshot in chat. `showScreen` displays a screenshot when the user asks to see
the screen. Private observations remain part of persisted agent history and are
hidden during transcript replay. Gemini supports visual inspection; GPT OSS can
display screenshots for the user but cannot inspect them.

Run the mocked tool checks with:

```bash
node --experimental-strip-types --test scripts/computer-tools.test.mjs
node --experimental-strip-types --test scripts/sandbox-provisioning.test.mjs
node --experimental-strip-types --test scripts/vnc-preview.test.mjs
node --experimental-strip-types --test scripts/sandbox-errors.test.mjs
```

## Group chats

Each bot's sandbox starts with a blank `MEMORY.md` in its working directory.
The `getMemory` and `setMemory` tools read and save this file using the active
bot's sandbox relationship. Before every model step, the worker loads that
bot's memory into its instructions, including after a handoff. Recall works
across private and group chats without relying on the model to choose a read
tool. Full memory contents are omitted from the chat's tool cards.

Reading a bot with no sandbox returns empty memory without creating one; the
first save provisions the sandbox. Memory follows the bot across chats and
stops, stays separate from other bots, and is lost if its sandbox is deleted.
Access failures are reported as unavailable memory rather than empty notes.

Choose **Create a groupchat** from the sidebar's + menu, name the group, and
select at least two bots. Pick a bot in the message composer's dropdown before
sending a message; that bot starts the turn using the group's shared history.
It can use `handoff` when another group member's job is a better fit. The
receiving bot continues automatically with its own instructions and sandbox.
Each contribution shows its bot's name and avatar. Handoffs cannot revisit a
bot, and a turn allows at most three handoffs. Group chats do not have a
desktop panel.

Click a group's name in the chat header to rename it, add or remove members,
or delete it with confirmation. Updates require at least two bots. Deleting
the group keeps its bots and their direct chats.

Run the group validation and recipient-selection checks with:

```bash
node --experimental-strip-types --test scripts/group-chat.test.mjs
node --experimental-strip-types --test scripts/group-chat-actions.test.mjs
node --experimental-strip-types --test scripts/handoff.test.mjs
node --experimental-strip-types --test scripts/memory.test.mjs
```

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button"
```
