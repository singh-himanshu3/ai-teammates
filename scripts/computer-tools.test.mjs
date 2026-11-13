import assert from "node:assert/strict"
import { Readable } from "node:stream"
import test from "node:test"

import { convertToModelMessages } from "ai"

import { createComputerTools } from "../lib/agent/computer-tools.ts"

function fixture(state = "started") {
  const files = new Map([["/workspace/notes.txt", Buffer.from("Hello")]])
  const calls = []
  const sandbox = {
    id: "assigned-sandbox",
    state,
    start: async () => {
      calls.push("start")
      sandbox.state = "started"
    },
    waitUntilStarted: async () => {
      calls.push("wait")
      sandbox.state = "started"
    },
    process: {
      executeCommand: async (...args) => {
        calls.push(args)
        return { exitCode: 7, result: "Command failed" }
      },
    },
    fs: {
      getFileDetails: async (path) => ({ size: files.get(path).length }),
      downloadFileStream: async (path) => Readable.from([files.get(path)]),
      uploadFile: async (content, path) => {
        files.set(path, content)
      },
      listFiles: async () =>
        [...files.entries()].map(([name, content]) => ({
          name,
          isDir: false,
          size: content.length,
        })),
    },
    computerUse: {
      start: async () => {
        calls.push("desktop")
      },
      screenshot: {
        takeCompressed: async () => ({
          screenshot: "data:image/jpeg;base64,c2NyZWVu",
        }),
      },
      mouse: {
        click: async (...args) => {
          calls.push(["click", ...args])
        },
        move: async (...args) => {
          calls.push(["move", ...args])
        },
        scroll: async (...args) => {
          calls.push(["scroll", ...args])
          return true
        },
      },
      keyboard: {
        type: async (...args) => {
          calls.push(["type", ...args])
        },
        press: async (...args) => {
          calls.push(["press", ...args])
        },
      },
    },
  }
  return { sandbox, files, calls }
}

async function execute(tool, input = {}, abortSignal) {
  return tool.execute(await tool.inputSchema.parseAsync(input), {
    toolCallId: "test-call",
    messages: [],
    abortSignal,
  })
}

test("tools reject missing sandbox assignments without accepting a caller's sandbox ID", async () => {
  const tools = createComputerTools(async () => null)
  await assert.rejects(
    execute(tools.bash, { command: "pwd", sandboxId: "other-bot" }),
    /no sandbox assigned/
  )
})

test("stopped sandboxes start on demand and retain command exit codes", async () => {
  const { sandbox, calls } = fixture("stopped")
  const tools = createComputerTools(async () => sandbox)
  const result = await execute(tools.bash, {
    command: "exit 7",
    cwd: "/workspace",
    timeout: 12,
  })
  assert.equal(calls[0], "start")
  assert.equal(calls[1][1], "/workspace")
  assert.equal(calls[1][3], 12)
  assert.equal(result.exitCode, 7)
  assert.equal(result.output, "Command failed")
  assert.ok(!calls.includes("desktop"))
})

test("file tools round trip Unicode contents inside the resolved sandbox", async () => {
  const { sandbox, files } = fixture()
  const tools = createComputerTools(async () => sandbox)
  await execute(tools.writeFiles, {
    files: [{ path: "/workspace/new.txt", content: "Hello 🌍" }],
  })
  assert.ok(Buffer.isBuffer(files.get("/workspace/new.txt")))
  assert.equal(
    (await execute(tools.readFile, { path: "/workspace/new.txt" })).content,
    "Hello 🌍"
  )
  assert.equal(
    (await execute(tools.listFiles, { path: "/workspace" })).files.length,
    2
  )
})

test("large text and command outputs are bounded and marked truncated", async () => {
  const { sandbox, files } = fixture()
  files.set("/workspace/large.txt", Buffer.from("x".repeat(60000)))
  sandbox.process.executeCommand = async () => ({
    exitCode: 0,
    result: "x".repeat(60000),
  })
  const tools = createComputerTools(async () => sandbox)
  const file = await execute(tools.readFile, { path: "/workspace/large.txt" })
  assert.equal(file.content.length, 50000)
  assert.equal(file.truncated, true)
  const command = await execute(tools.bash, { command: "some-output" })
  assert.equal(command.output.length, 50000)
  assert.equal(command.truncated, true)
  files.set("/workspace/large.txt", Buffer.alloc(1_000_001))
  await assert.rejects(
    execute(tools.readFile, { path: "/workspace/large.txt" }),
    /exceeds 1 MB/
  )
})

test("desktop tools initialize the desktop once and forward coordinates and modifiers", async () => {
  const { sandbox, calls } = fixture()
  const tools = createComputerTools(async () => sandbox)
  await execute(tools.mouseClick, {
    x: 10,
    y: 20,
    button: "right",
    clicks: 2,
    modifiers: ["shift"],
  })
  await execute(tools.mouseMove, { x: 30, y: 40 })
  await execute(tools.mouseScroll, {
    x: 30,
    y: 40,
    direction: "down",
    amount: 5,
  })
  await execute(tools.keyboardType, { text: "hello" })
  await execute(tools.keyboardPress, { key: "c", modifiers: ["ctrl"] })
  assert.equal(calls.filter((call) => call === "desktop").length, 1)
  assert.deepEqual(calls[1], ["click", 10, 20, "right", false, 2, ["shift"]])
  assert.deepEqual(calls.at(-1), ["press", "c", ["ctrl"]])
})

test("aborted calls never resolve or start a sandbox", async () => {
  let resolved = false
  const tools = createComputerTools(async () => {
    resolved = true
    return fixture().sandbox
  })
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    execute(tools.mouseMove, { x: 0, y: 0 }, controller.signal),
    { name: "AbortError" }
  )
  assert.equal(resolved, false)
})

test("cancellation between file writes skips remaining files", async () => {
  const { sandbox, files } = fixture()
  const controller = new AbortController()
  sandbox.fs.uploadFile = async (content, path) => {
    files.set(path, content)
    controller.abort()
  }
  const tools = createComputerTools(async () => sandbox)
  await assert.rejects(
    execute(
      tools.writeFiles,
      {
        files: [
          { path: "/first", content: "one" },
          { path: "/second", content: "two" },
        ],
      },
      controller.signal
    ),
    { name: "AbortError" }
  )
  assert.equal(files.has("/first"), true)
  assert.equal(files.has("/second"), false)
})

test("remote failures surface sanitized errors", async (t) => {
  t.mock.method(console, "error", () => {})
  const tools = createComputerTools(async () => {
    throw new Error("private credentials")
  })
  await assert.rejects(
    execute(tools.listFiles, { path: "/" }),
    (error) =>
      error.message.includes("sandbox operation failed") &&
      !error.message.includes("private credentials")
  )
})

test("screenshots convert to model image content on later turns and text when switching models", async () => {
  const { sandbox } = fixture()
  const tools = createComputerTools(async () => sandbox)
  const screenshot = await execute(tools.viewScreen)
  assert.equal(screenshot.base64, "c2NyZWVu")
  const history = [
    {
      id: "assistant",
      role: "assistant",
      parts: [
        {
          type: "tool-viewScreen",
          toolCallId: "screen-call",
          state: "output-available",
          input: {},
          output: screenshot,
        },
      ],
    },
  ]
  const messages = await convertToModelMessages(history, { tools })
  const result = messages.find((message) => message.role === "tool").content[0]
    .output
  assert.equal(result.type, "content")
  assert.equal(result.value[0].type, "file")
  assert.equal(result.value[0].mediaType, "image/jpeg")
  const textTools = createComputerTools(async () => sandbox, {
    supportsImages: false,
  })
  const textMessages = await convertToModelMessages(history, {
    tools: textTools,
  })
  assert.ok(!JSON.stringify(textMessages).includes("c2NyZWVu"))
})

test("text-only model can show screenshots to users but cannot privately inspect them", async () => {
  const { sandbox, calls } = fixture()
  const tools = createComputerTools(async () => sandbox, {
    supportsImages: false,
  })
  await assert.rejects(execute(tools.viewScreen), /cannot inspect screenshots/)
  assert.equal(calls.length, 0)
  const shown = await execute(tools.showScreen)
  assert.equal(shown.base64, "c2NyZWVu")
})

test("tool schemas reject invalid coordinates, timeouts, and empty write batches", () => {
  const tools = createComputerTools(async () => null)
  assert.equal(
    tools.mouseClick.inputSchema.safeParse({ x: -1, y: 2 }).success,
    false
  )
  assert.equal(
    tools.bash.inputSchema.safeParse({ command: "pwd", timeout: 121 }).success,
    false
  )
  assert.equal(
    tools.writeFiles.inputSchema.safeParse({ files: [] }).success,
    false
  )
})

test("screen compression stays within stream limits without changing desktop coordinates", async () => {
  const { sandbox } = fixture()
  const options = []
  sandbox.computerUse.screenshot.takeCompressed = async (settings) => {
    options.push(settings)
    return {
      screenshot: settings.quality === 75 ? "x".repeat(700001) : "c2NyZWVu",
    }
  }
  const tools = createComputerTools(async () => sandbox)
  const screen = await execute(tools.showScreen)
  assert.equal(screen.base64, "c2NyZWVu")
  assert.deepEqual(
    options.map((settings) => settings.quality),
    [75, 45]
  )
  assert.ok(options.every((settings) => settings.scale === undefined))
  sandbox.computerUse.screenshot.takeCompressed = async () => ({
    screenshot: "x".repeat(700001),
  })
  await assert.rejects(execute(tools.showScreen), /desktop resolution/)
})

test("each action resolves the current sandbox relationship instead of reusing a stale association", async () => {
  const first = fixture()
  const second = fixture()
  second.sandbox.id = "new-assignment"
  let current = first.sandbox
  const tools = createComputerTools(async () => current)
  await execute(tools.writeFiles, {
    files: [{ path: "/first", content: "first" }],
  })
  current = second.sandbox
  await execute(tools.writeFiles, {
    files: [{ path: "/second", content: "second" }],
  })
  assert.equal(first.files.has("/first"), true)
  assert.equal(first.files.has("/second"), false)
  assert.equal(second.files.has("/second"), true)
})

test("file reads enforce the byte limit even when metadata understates the size", async () => {
  const { sandbox } = fixture()
  sandbox.fs.getFileDetails = async () => ({ size: 0 })
  let stream
  sandbox.fs.downloadFileStream = async () => {
    stream = Readable.from([Buffer.alloc(600000), Buffer.alloc(600000)])
    return stream
  }
  const tools = createComputerTools(async () => sandbox)
  await assert.rejects(
    execute(tools.readFile, { path: "/growing-file" }),
    /exceeds 1 MB/
  )
  assert.equal(stream.destroyed, true)
})
