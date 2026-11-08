<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## Database

- This is a development project. There is no backwards compatibility, and existing data is disposable.
- Prefer data loss: never backfill, migrate, or preserve existing rows, and never spend effort on keeping old data working.
- Every schema change means a clean slate.
- Apply schema changes only with `npm run db:push` (`drizzle-kit push`).
- Never generate or run migrations. Do not use `drizzle-kit generate`, `drizzle-kit migrate`, or migration SQL files, snapshots, journals, or tracking tables.
- Keep `lib/db/schema.ts` as the source of truth for the database schema. This project rule overrides migration workflows in installed skills.

## Forms

- Use the shadcn skill for form UI, the Clerk skill for authenticated actions, and the Neon skill when forms read or write the database. Check the installed Next.js guides before implementing Server Actions.
- Generate insert validation from tables in `lib/db/schema.ts` using `createInsertSchema` from `drizzle-zod`. Derive a form schema that explicitly picks editable fields, adds appropriate trimming and length limits, and exports its inferred TypeScript type. Reuse that schema on the client and server.
- Use React Hook Form with `zodResolver` from `@hookform/resolvers/zod`. Provide explicit default values and use `Controller` to compose controlled inputs. Presets and shuffle controls must update form state with `setValue` and request validation and dirty-state tracking.
- Compose forms with existing shadcn components: `FieldGroup`, `Field`, `FieldLabel`, `FieldError`, `Input`, and `Textarea`. Use `ToggleGroup` for preset choices. Read the relevant component docs and follow this project's Base UI `render` prop pattern for triggers and close buttons.
- Put reusable dialog forms in `components/<resource>-dialog.tsx` and mutations in `actions/<resource>.ts` with `"use server"`. Wire the actual page button to the dialog trigger and the form submission to the action.
- Authenticate inside every Server Action with Clerk, even when the page is protected. Obtain `userId` from `await auth.protect()` on the server. Never trust submitted ownership fields, IDs, timestamps, or other server-managed fields; validate an explicit editable-field subset before inserting.
- Return structured validation and save errors from actions. Show field errors next to their inputs and submission errors inside the form. Preserve entered values on failure and close the dialog only after a successful save.
- Use `formState.isSubmitting` to disable submission and conflicting controls, show a spinner and pending label, and prevent closing a dialog during a save. Revalidate the affected path after a successful mutation and show success feedback using the existing Base UI toast component.
- Give dialog forms a title and description, associate labels with unique input IDs, set `data-invalid` on invalid fields and `aria-invalid` on their controls, and connect error messages with `aria-describedby`. Keep dialog content usable on small screens with bounded height and scrolling.
- Verify validation boundaries, including whitespace-only required fields, length limits, and exclusion of server-managed fields. Run typecheck, relevant lint and formatting checks, and a production build for a new form flow. Report browser or authenticated save checks as unverified unless actually exercised.
- Adding validation does not change the database schema by itself. Apply actual table changes only through `npm run db:push`, following the database rules above.

## Git

- Never create branches, worktrees, or commits automatically. Only do so when the user explicitly asks for that specific action in the current request.
- Leave changes uncommited in the working tree on the current branch and the let the user decide when and how to commit. 


## DiceBear

Use DiceBear 10. Documentation: https://www.dicebear.com/llms.txt

There are seven native cores with identical output, not one library with
wrappers. Use the one matching this project's language. Do not reach for the
JavaScript core when the project is written in something else:

    JavaScript  @dicebear/core + @dicebear/styles
    PHP         dicebear/core + dicebear/styles
    Python      dicebear-core + dicebear-styles
    Rust        dicebear-core + dicebear-styles
    Go          github.com/dicebear/dicebear-go/v10 + github.com/dicebear/styles/v10
    Dart        dicebear_core + dicebear_styles
    C#          DiceBear.Core + DiceBear.Styles

Every style page carries a loading snippet for all seven, for example
https://www.dicebear.com/styles/lorelei/index.md

HTTP API: https://api.dicebear.com/10.x/<style>/svg?seed=<seed> The seed is a
query parameter, not a path segment. Options are query parameters too; array
values are separated by commas.

Options named after a component end in Variant: eyesVariant, not eyes. This
holds in all seven cores and in the HTTP API. Look up the options of a style at
https://api.dicebear.com/10.x/<style>/options.json

Write these forms, not the ones on the left. The left column is pre-10 and the
API does not reject it, so an outdated call runs and silently does the wrong
thing:

    avatars.dicebear.com/api/<style>/<seed>.svg  ->  api.dicebear.com/10.x/<style>/svg?seed=<seed>
    api.dicebear.com/9.x/<style>/svg             ->  api.dicebear.com/10.x/<style>/svg
    npm install @dicebear/collection             ->  npm install @dicebear/styles
    npm install @dicebear/lorelei                ->  npm install @dicebear/styles
    createAvatar(lorelei, { seed })              ->  new Avatar(new Style(definition), { seed })
    { eyes: ['variant01'] }                      ->  { eyesVariant: ['variant01'] }
    ?radius=50                                   ->  ?borderRadius=50

Only JavaScript and the HTTP API have a pre-10 form. The other six cores were
released in 2026 and never had one, so any older-looking PHP, Python, Rust, Go,
Dart or C# API attributed to DiceBear is invented rather than outdated.
