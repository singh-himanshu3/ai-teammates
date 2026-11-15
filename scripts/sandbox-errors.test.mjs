import assert from "node:assert/strict"
import test from "node:test"

import {
  sandboxErrorMessage,
  SandboxSetupError,
} from "../lib/agent/sandbox-errors.ts"

test("missing organization region explains the required dashboard setup", () => {
  const error = Object.assign(
    new Error(
      "This organization does not have a default region. Please open the Daytona Dashboard to set a default region."
    ),
    { statusCode: 400 }
  )
  assert.match(sandboxErrorMessage(error), /organization has no default region/)
  assert.match(sandboxErrorMessage(error), /Dashboard/)
})

test("known API failures produce actionable errors without echoing server details", () => {
  for (const [statusCode, expected] of [
    [401, /API key/],
    [403, /permissions/],
    [429, /quota/],
    [422, /configuration/],
    [404, /could not be found/],
  ]) {
    const error = Object.assign(new Error("private credential or URL"), {
      statusCode,
    })
    const message = sandboxErrorMessage(error)
    assert.match(message, expected)
    assert.ok(!message.includes("private credential"))
  }
})

test("unknown exceptions stay sanitized and explicitly safe setup errors remain actionable", () => {
  assert.ok(
    !sandboxErrorMessage(new Error("private credential")).includes(
      "private credential"
    )
  )
  assert.equal(
    sandboxErrorMessage(
      new SandboxSetupError("DAYTONA_API_KEY is not configured.")
    ),
    "DAYTONA_API_KEY is not configured."
  )
})
