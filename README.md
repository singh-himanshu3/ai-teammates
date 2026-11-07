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
