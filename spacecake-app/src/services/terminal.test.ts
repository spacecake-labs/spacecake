import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { describe, expect, vi, beforeEach } from "vitest"

import { SpacecakeHome } from "@/services/spacecake-home"
import { Terminal } from "@/services/terminal"
import { TerminalError } from "@/types/terminal"

/**
 * Terminal Service Unit Tests
 *
 * Tests the actual Terminal service through Effect layers: PTY lifecycle,
 * output buffering, buffer compaction, tab state, and duplicate ID handling.
 */

// ---------------------------------------------------------------------------
// mocks
// ---------------------------------------------------------------------------

// track data callbacks so tests can simulate PTY output
const dataCallbacks = new Map<string, (data: string) => void>()

const createMockPty = (id: string) => {
  let killed = false
  let exitCb: (() => void) | null = null

  const pty = {
    onData: vi.fn((cb: (data: string) => void) => {
      dataCallbacks.set(id, cb)
    }),
    onExit: vi.fn((cb: () => void) => {
      if (killed) {
        // already killed — fire immediately so waitForExit resolves
        queueMicrotask(cb)
      } else {
        exitCb = cb
      }
      return { dispose: vi.fn() }
    }),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(() => {
      killed = true
      if (exitCb) queueMicrotask(exitCb)
    }),
    pid: 12345,
  }
  return pty
}

// track which pty was created for each spawn call
let lastSpawnedPtyId = 0
const spawnedPtys = new Map<number, ReturnType<typeof createMockPty>>()

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  webContents: {
    fromId: vi.fn(() => null),
  },
}))

vi.mock("@lydell/node-pty", () => ({
  spawn: vi.fn((_shell: string, _args: string[], _opts: Record<string, unknown>) => {
    const id = `mock-pty-${++lastSpawnedPtyId}`
    const pty = createMockPty(id)
    spawnedPtys.set(lastSpawnedPtyId, pty)
    return pty
  }),
}))

vi.mock("@/main-process/default-shell", () => ({
  default: "/bin/bash",
}))

// ---------------------------------------------------------------------------
// test layer
// ---------------------------------------------------------------------------

const TestSpacecakeHome = Layer.succeed(SpacecakeHome, {
  homeDir: "/tmp/test-spacecake",
  appDir: "/tmp/test-spacecake/.app",
  hooksDir: "/tmp/test-spacecake/.app/hooks",
  statuslineScriptPath: "/tmp/test-spacecake/.app/hooks/statusline.sh",
  cliBinDir: "/tmp/test-spacecake/.app/bin",
  bundledCliBinaryPath: null,
  globalBinTarget: "/usr/local/bin/spacecake",
  systemInstalledPath: "",
  cliSourceEntryPath: "",
  isPackaged: false,
} as SpacecakeHome)

const TerminalTestLayer = Terminal.Default.pipe(Layer.provide(TestSpacecakeHome))

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** simulate PTY emitting data for the most recently spawned pty */
const emitData = (data: string) => {
  const id = `mock-pty-${lastSpawnedPtyId}`
  const cb = dataCallbacks.get(id)
  if (cb) cb(data)
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  lastSpawnedPtyId = 0
  spawnedPtys.clear()
  dataCallbacks.clear()
})

describe("Terminal service", () => {
  describe("create and list", () => {
    it.scoped("should create a terminal and list it", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal

        yield* terminal.create("term-1", 80, 24, "/tmp")
        const list = yield* terminal.list()

        expect(list).toHaveLength(1)
        expect(list[0].id).toBe("term-1")
      }).pipe(Effect.provide(TerminalTestLayer)),
    )

    it.scoped("should create multiple terminals", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal

        yield* terminal.create("term-1", 80, 24, "/tmp")
        yield* terminal.create("term-2", 120, 40, "/tmp")
        const list = yield* terminal.list()

        expect(list).toHaveLength(2)
      }).pipe(Effect.provide(TerminalTestLayer)),
    )

    it.scoped("should track surfaceId", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal

        yield* terminal.create("term-1", 80, 24, "/tmp", "surface-abc")
        const list = yield* terminal.list()

        expect(list[0].surfaceId).toBe("surface-abc")
      }).pipe(Effect.provide(TerminalTestLayer)),
    )

    it.scoped("should report has() correctly", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal

        expect(yield* terminal.has("term-1")).toBe(false)
        yield* terminal.create("term-1", 80, 24, "/tmp")
        expect(yield* terminal.has("term-1")).toBe(true)
      }).pipe(Effect.provide(TerminalTestLayer)),
    )
  })

  describe("duplicate ID handling", () => {
    it.scoped("should kill existing terminal when creating with same id", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal

        yield* terminal.create("term-1", 80, 24, "/tmp")
        const firstPty = spawnedPtys.get(1)!

        yield* terminal.create("term-1", 100, 30, "/tmp")

        expect(firstPty.kill).toHaveBeenCalled()
        const list = yield* terminal.list()
        expect(list).toHaveLength(1)
      }).pipe(Effect.provide(TerminalTestLayer)),
    )
  })

  describe("write and resize", () => {
    it.scoped("should write data to pty", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal

        yield* terminal.create("term-1", 80, 24, "/tmp")
        yield* terminal.write("term-1", "ls\n")

        const pty = spawnedPtys.get(1)!
        expect(pty.write).toHaveBeenCalledWith("ls\n")
      }).pipe(Effect.provide(TerminalTestLayer)),
    )

    it.scoped("should resize pty", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal

        yield* terminal.create("term-1", 80, 24, "/tmp")
        yield* terminal.resize("term-1", 120, 40)

        const pty = spawnedPtys.get(1)!
        expect(pty.resize).toHaveBeenCalledWith(120, 40)
      }).pipe(Effect.provide(TerminalTestLayer)),
    )

    it.scoped("should not throw when writing to nonexistent terminal", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal
        yield* terminal.write("nonexistent", "data")
      }).pipe(Effect.provide(TerminalTestLayer)),
    )

    it.scoped("should not throw when resizing nonexistent terminal", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal
        yield* terminal.resize("nonexistent", 80, 24)
      }).pipe(Effect.provide(TerminalTestLayer)),
    )
  })

  describe("output buffering", () => {
    it.scoped("should buffer pty output", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal

        yield* terminal.create("term-1", 80, 24, "/tmp")

        emitData("hello ")
        emitData("world")

        const buffer = yield* terminal.getBuffer("term-1")
        expect(buffer).toBe("hello world")
      }).pipe(Effect.provide(TerminalTestLayer)),
    )

    it.scoped("should return empty string for nonexistent terminal buffer", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal
        const buffer = yield* terminal.getBuffer("nonexistent")
        expect(buffer).toBe("")
      }).pipe(Effect.provide(TerminalTestLayer)),
    )

    it.scoped("should compact buffer when exceeding max size", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal

        yield* terminal.create("term-1", 80, 24, "/tmp")

        // emit enough data to exceed the 100KB buffer cap
        const chunk = "x".repeat(60_000)
        emitData(chunk)
        emitData(chunk) // total = 120KB, triggers compaction

        const buffer = yield* terminal.getBuffer("term-1")
        // buffer should be compacted to MAX_BUFFER_SIZE (100KB)
        expect(buffer.length).toBe(100_000)
      }).pipe(Effect.provide(TerminalTestLayer)),
    )
  })

  describe("kill", () => {
    it.scoped("should kill terminal and remove from list", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal

        yield* terminal.create("term-1", 80, 24, "/tmp")
        yield* terminal.kill("term-1")

        const list = yield* terminal.list()
        expect(list).toHaveLength(0)
        expect(yield* terminal.has("term-1")).toBe(false)
      }).pipe(Effect.provide(TerminalTestLayer)),
    )

    it.scoped("should not throw when killing nonexistent terminal", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal
        yield* terminal.kill("nonexistent")
      }).pipe(Effect.provide(TerminalTestLayer)),
    )
  })

  describe("tab state management", () => {
    it.scoped("should set and get tab state", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal

        const state = {
          tabs: [{ id: "tab-1", surfaceId: "surface-1", label: "bash", cwdPath: "/home/user" }],
          activeId: "tab-1",
        }

        yield* terminal.setTabState("workspace-1", state)
        const result = yield* terminal.getTabState("workspace-1")

        expect(result).toEqual(state)
      }).pipe(Effect.provide(TerminalTestLayer)),
    )

    it.scoped("should return null for unknown workspace", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal
        const result = yield* terminal.getTabState("unknown")
        expect(result).toBeNull()
      }).pipe(Effect.provide(TerminalTestLayer)),
    )

    it.scoped("should overwrite tab state on subsequent set", () =>
      Effect.gen(function* () {
        const terminal = yield* Terminal

        yield* terminal.setTabState("workspace-1", {
          tabs: [{ id: "tab-1", surfaceId: "s-1", label: "bash", cwdPath: "/home/user" }],
          activeId: "tab-1",
        })

        yield* terminal.setTabState("workspace-1", {
          tabs: [
            { id: "tab-1", surfaceId: "s-1", label: "bash", cwdPath: "/home/user" },
            { id: "tab-2", surfaceId: "s-2", label: "zsh", cwdPath: "/home/user/projects" },
          ],
          activeId: "tab-2",
        })

        const result = yield* terminal.getTabState("workspace-1")
        expect(result!.tabs).toHaveLength(2)
        expect(result!.activeId).toBe("tab-2")
      }).pipe(Effect.provide(TerminalTestLayer)),
    )
  })
})

describe("TerminalError", () => {
  it("should create TerminalError with message", () => {
    const error = new TerminalError({ message: "PTY creation failed" })

    expect(error.message).toBe("PTY creation failed")
    expect(error._tag).toBe("TerminalError")
  })

  it("should be instanceof TerminalError", () => {
    const error = new TerminalError({ message: "test error" })
    expect(error).toBeInstanceOf(TerminalError)
  })
})
