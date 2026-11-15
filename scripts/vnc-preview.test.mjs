import assert from "node:assert/strict"
import test from "node:test"

import { prepareDesktopPreview, vncWebSocketUrl } from "../lib/agent/vnc.ts"
import {
  allowDesktopDialogChange,
  createVncSession,
} from "../lib/vnc-session.ts"

test("moving between preview and fullscreen retains one VNC connection and target", () => {
  let constructions = 0
  let disconnects = 0
  const target = {
    parentElement: null,
    remove() {
      this.parentElement = null
    },
  }
  const panel = {
    appendChild(node) {
      node.parentElement = this
    },
  }
  const dialog = {
    appendChild(node) {
      node.parentElement = this
    },
  }
  class Client {
    constructor(element, url, options) {
      constructions++
      assert.equal(element, target)
      assert.equal(url, "wss://desktop.example/websockify")
      assert.deepEqual(options, { shared: true })
    }
    disconnect() {
      disconnects++
    }
    focus() {}
  }
  const session = createVncSession(
    target,
    "wss://desktop.example/websockify",
    Client
  )
  session.mount(panel, false)
  assert.equal(session.client.viewOnly, true)
  assert.equal(session.client.focusOnClick, false)
  session.mount(dialog, true)
  assert.equal(target.parentElement, dialog)
  assert.equal(session.client.viewOnly, false)
  assert.equal(session.client.focusOnClick, true)
  session.mount(panel, false)
  assert.equal(target.parentElement, panel)
  assert.equal(constructions, 1)
  assert.equal(disconnects, 0)
  assert.equal(session.client.scaleViewport, true)
  assert.equal(session.client.resizeSession, false)
  session.disconnect()
  assert.equal(disconnects, 1)
  assert.equal(target.parentElement, null)
})

test("fullscreen closes only through its explicit close control", () => {
  for (const reason of [
    "escape-key",
    "outside-press",
    "focus-out",
    "trigger-press",
    "imperative-action",
    "none",
  ]) {
    assert.equal(allowDesktopDialogChange(false, reason), false, reason)
  }
  assert.equal(allowDesktopDialogChange(false, "close-press"), true)
  assert.equal(allowDesktopDialogChange(true, "trigger-press"), true)
})

test("the WebSocket endpoint preserves port-scoped signed authentication", () => {
  assert.equal(
    vncWebSocketUrl("https://6080-signed-token.proxy.example/"),
    "wss://6080-signed-token.proxy.example/websockify"
  )
  assert.equal(
    vncWebSocketUrl("http://localhost:6080/?token=signed"),
    "ws://localhost:6080/websockify?token=signed"
  )
  assert.throws(
    () => vncWebSocketUrl("javascript:invalid"),
    /Invalid desktop preview URL/
  )
})

test("desktop preparation starts a stopped sandbox and signs only VNC port access", async () => {
  const calls = []
  const sandbox = {
    state: "stopped",
    start: async (timeout) => {
      calls.push(["start", timeout])
    },
    computerUse: {
      start: async () => {
        calls.push(["desktop"])
      },
    },
    getSignedPreviewUrl: async (...args) => {
      calls.push(["sign", ...args])
      return {
        url: "https://6080-signed.proxy.example/",
        token: "not-returned-separately",
      }
    },
  }
  const preview = await prepareDesktopPreview(sandbox)
  assert.deepEqual(calls, [["start", 60], ["desktop"], ["sign", 6080, 3600]])
  assert.deepEqual(preview, {
    url: "wss://6080-signed.proxy.example/websockify",
  })
})

test("an already running sandbox is reused and startup failures never issue a preview URL", async () => {
  let starts = 0
  let signed = 0
  const sandbox = {
    state: "started",
    start: async () => {
      starts++
    },
    computerUse: { start: async () => {} },
    getSignedPreviewUrl: async () => {
      signed++
      return { url: "https://6080-signed.proxy.example/" }
    },
  }
  await prepareDesktopPreview(sandbox)
  assert.equal(starts, 0)
  assert.equal(signed, 1)
  sandbox.computerUse.start = async () => {
    throw new Error("Desktop packages missing")
  }
  await assert.rejects(
    prepareDesktopPreview(sandbox),
    /Desktop packages missing/
  )
  assert.equal(signed, 1)
})
