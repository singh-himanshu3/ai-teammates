# Next.js template

This is a Next.js template with shadcn/ui.

## Authentication

Clerk manages sign-in, sign-up, sessions, and account settings. Run `npm run dev`
and use **Create account** in the navigation to get started.

- `/` is public.
- `/sign-in` and `/sign-up` use Clerk's prebuilt authentication forms.
- `/dashboard` checks `await auth.protect()` on the server and requires a session.
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

The `todos` table has a generated UUID, required title, completion status
(default `false`), and creation timestamp. TypeScript types `Todo` and `NewTodo`
are exported from `lib/db/schema.ts`.
Use schema pushes only; do not generate or run migrations. Review the proposed
changes and confirm the target database when running `db:push`.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```
