import { createStore, Provider, useAtomValue } from "jotai"
/**
 * @vitest-environment jsdom
 */
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { FileSystemError } from "@/services/file-system"
import type { ElectronAPI, StatuslineConfigStatus } from "@/types/electron"

import {
  statuslineConflictAtom,
  useStatuslineAutoSetup,
} from "@/components/statusline-setup-prompt"
import { left, right } from "@/types/adt"

// vi.hoisted runs before vi.mock hoisting, so the atom is available.
const { mockServerReadyAtom } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { atom } = require("jotai") as typeof import("jotai")
  return { mockServerReadyAtom: atom(false) }
})

vi.mock("@/providers/claude-integration-provider", () => ({
  claudeServerReadyAtom: mockServerReadyAtom,
}))

/**
 * Creates a minimal mock ElectronAPI for statusline testing
 */
const createMockElectronAPI = (overrides: {
  readResult?: StatuslineConfigStatus
  readError?: { description: string }
  updateResult?: void
  updateError?: { description: string }
}) => {
  const api: Partial<ElectronAPI> = {
    isPlaywright: false,
    claude: {
      notifySelectionChanged: async () => {},
      notifyAtMentioned: async () => {},
      onStatusChange: () => () => {},
      onOpenFile: () => () => {},
      onStatuslineUpdate: () => () => {},
      onStatuslineCleared: () => () => {},
      ensureServer: async () => {},
      tasks: {
        startWatching: async () => right(undefined),
        list: async () => right([]),
        stopWatching: async () => right(undefined),
        onChange: () => () => {},
      },
      statusline: {
        read: vi.fn(async () => {
          if (overrides.readError) {
            return left<FileSystemError, StatuslineConfigStatus>(
              overrides.readError as FileSystemError,
            )
          }
          return right<FileSystemError, StatuslineConfigStatus>(
            overrides.readResult ?? {
              configured: false,
              isSpacecake: false,
              isInlineSpacecake: false,
            },
          )
        }),
        update: vi.fn(async () => {
          if (overrides.updateError) {
            return left<FileSystemError, void>(overrides.updateError as FileSystemError)
          }
          return right<FileSystemError, void>(overrides.updateResult)
        }),
        remove: async () => right(undefined),
      },
    },
  }
  return api as ElectronAPI
}

/**
 * Helper to wait for async effects to settle
 */
const waitForEffects = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)))

/** Thin wrapper component that calls the hook and renders nothing */
function AutoSetupHarness() {
  useStatuslineAutoSetup()
  return null
}

/** Wrapper that reads the conflict atom and reports via callback */
function ConflictReader({ onConflict }: { onConflict: (v: unknown) => void }) {
  const conflict = useAtomValue(statuslineConflictAtom)
  React.useEffect(() => {
    onConflict(conflict)
  })
  return null
}

describe("useStatuslineAutoSetup", () => {
  let container: HTMLDivElement
  let root: Root
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    store = createStore()
    store.set(mockServerReadyAtom, false)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  const renderHook = () => {
    act(() => {
      root.render(
        <Provider store={store}>
          <AutoSetupHarness />
        </Provider>,
      )
    })
  }

  const setServerReady = async () => {
    await act(async () => {
      store.set(mockServerReadyAtom, true)
    })
    await waitForEffects()
  }

  it("auto-configures when configured is false", async () => {
    const mockApi = createMockElectronAPI({
      readResult: {
        configured: false,
        isSpacecake: false,
        isInlineSpacecake: false,
      },
    })
    window.electronAPI = mockApi

    renderHook()
    await setServerReady()

    expect(mockApi.claude.statusline.read).toHaveBeenCalledTimes(1)
    expect(mockApi.claude.statusline.update).toHaveBeenCalledTimes(1)
  })

  it("silently migrates old inline spacecake config", async () => {
    const mockApi = createMockElectronAPI({
      readResult: {
        configured: true,
        isSpacecake: false,
        isInlineSpacecake: true,
        command: "bash -c 'socketPath=\"${HOME}/.claude/spacecake.sock\"; exit 0'",
      },
    })
    window.electronAPI = mockApi

    renderHook()
    await setServerReady()

    expect(mockApi.claude.statusline.update).toHaveBeenCalledTimes(1)
  })

  it("sets conflict atom when configured but not spacecake", async () => {
    const mockApi = createMockElectronAPI({
      readResult: {
        configured: true,
        isSpacecake: false,
        isInlineSpacecake: false,
        command: "/other/script.sh",
      },
    })
    window.electronAPI = mockApi

    let latestConflict: unknown = undefined
    act(() => {
      root.render(
        <Provider store={store}>
          <AutoSetupHarness />
          <ConflictReader onConflict={(v) => (latestConflict = v)} />
        </Provider>,
      )
    })
    await setServerReady()

    expect(mockApi.claude.statusline.update).not.toHaveBeenCalled()
    expect(latestConflict).toEqual({ command: "/other/script.sh" })
  })

  it("does nothing when already configured for spacecake", async () => {
    const mockApi = createMockElectronAPI({
      readResult: {
        configured: true,
        isSpacecake: true,
        isInlineSpacecake: false,
        command: "/spacecake/script.sh",
      },
    })
    window.electronAPI = mockApi

    let latestConflict: unknown = "initial"
    act(() => {
      root.render(
        <Provider store={store}>
          <AutoSetupHarness />
          <ConflictReader onConflict={(v) => (latestConflict = v)} />
        </Provider>,
      )
    })
    await setServerReady()

    expect(mockApi.claude.statusline.update).not.toHaveBeenCalled()
    expect(latestConflict).toBeNull()
  })

  it("logs error when reading statusline config fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    window.electronAPI = createMockElectronAPI({
      readError: { description: "Permission denied" },
    })

    renderHook()
    await setServerReady()

    expect(consoleSpy).toHaveBeenCalledWith(
      "failed to read statusline config:",
      expect.objectContaining({ description: "Permission denied" }),
    )

    consoleSpy.mockRestore()
  })

  it("only fetches config once even when server ready toggles", async () => {
    const mockApi = createMockElectronAPI({
      readResult: {
        configured: false,
        isSpacecake: false,
        isInlineSpacecake: false,
      },
    })
    window.electronAPI = mockApi

    renderHook()
    await setServerReady()

    await act(async () => {
      store.set(mockServerReadyAtom, false)
    })
    await act(async () => {
      store.set(mockServerReadyAtom, true)
    })
    await waitForEffects()

    expect(mockApi.claude.statusline.read).toHaveBeenCalledTimes(1)
  })
})

describe("StatuslineConflictLink (via statuslineConflictAtom)", () => {
  let container: HTMLDivElement
  let root: Root
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    store = createStore()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  it("conflict atom starts as null", () => {
    expect(store.get(statuslineConflictAtom)).toBeNull()
  })

  it("conflict atom can be set and cleared", () => {
    store.set(statuslineConflictAtom, { command: "/other/script.sh" })
    expect(store.get(statuslineConflictAtom)).toEqual({
      command: "/other/script.sh",
    })

    store.set(statuslineConflictAtom, null)
    expect(store.get(statuslineConflictAtom)).toBeNull()
  })
})
