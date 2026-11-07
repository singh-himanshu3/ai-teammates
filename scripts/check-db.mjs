import nextEnv from "@next/env"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/neon-http"

nextEnv.loadEnvConfig(process.cwd())

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Set it in .env.local.")
}

try {
  const db = drizzle(databaseUrl)
  const result = await db.execute(sql`select 1 as connected`)

  if (result.rows[0]?.connected !== 1) {
    throw new Error("Unexpected connection check result")
  }

  console.log("Drizzle connected to Neon successfully.")
} catch (error) {
  console.error(
    "Database connection check failed. Check DATABASE_URL and network access."
  )
  // Report network/TLS error codes without logging credentials or query details.
  for (let cause = error; cause; cause = cause.cause) {
    if (cause.code) console.error(`Error code: ${cause.code}`)
  }
  process.exitCode = 1
}
