import "server-only"

import { drizzle } from "drizzle-orm/neon-http"

import * as schema from "./schema"

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Set it in .env.local.")
}

export const db = drizzle(databaseUrl, { schema })
