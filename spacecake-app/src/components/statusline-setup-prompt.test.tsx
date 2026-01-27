/**
 * @vitest-environment jsdom
 */
import * as React from "react"
import { act } from "react"
import type { FileSystemError } from "@/services/file-system"
import { createStore, Provider } from "jotai"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { left, right } from "@/types/adt"
import type { ElectronAPI, StatuslineConfigStatus } from "@/types/electron"
import {
  resetStatuslinePromptDismissed,
  StatuslineSetupPrompt,
} from "@/components/statusline-setup-prompt"

// vi.hoisted runs before vi.mock hoisting, so the atom is available.
// require() is necessary here because vi.hoisted executes before ES imports resolve.
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
    claude: {
      notifySelectionChanged: async () => {},
      notifyAtMentioned: async () => {},
      onStatusChange: () => () => {},
      onOpenFile: () => () => {},
      onStatuslineUpdate: () => () => {},
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
              overrides.readError as FileSystemError
            )
          }
          return right<FileSystemError, StatuslineConfigStatus>(
            overrides.readResult ?? { configured: false, isSpacecake: false }
          )
        }),
        update: vi.fn(async () => {
          if (overrides.updateError) {
            return left<FileSystemError, void>(
              overrides.updateError as FileSystemError
            )
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
const waitForEffects = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 50)))

describe("StatuslineSetupPrompt", () => {
  let container: HTMLDivElement
  let root: Root
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    localStorage.clear()
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

  const renderPrompt = () => {
    act(() => {
      root.render(
        <Provider store={store}>
          <StatuslineSetupPrompt />
        </Provider>
      )
    })
  }

  const setServerReady = async () => {
    await act(async () => {
      store.set(mockServerReadyAtom, true)
    })
    await waitForEffects()
  }

  describe("visibility conditions", () => {
    it("does not render when server is not ready", () => {
      window.electronAPI = createMockElectronAPI({
        readResult: { configured: false, isSpacecake: false },
      })

      renderPrompt()

      expect(container.querySelector("[class*='alert']")).toBeNull()
    })

    it("shows prompt when server ready and statusline not configured", async () => {
      window.electronAPI = createMockElectronAPI({
        readResult: { configured: false, isSpacecake: false },
      })

      renderPrompt()
      await setServerReady()

      expect(container.textContent).toContain("enable statusline integration")
      expect(container.textContent).toContain(
        "enable real-time status updates from Claude Code."
      )
    })

    it("shows prompt when statusline configured but not pointing to spacecake", async () => {
      window.electronAPI = createMockElectronAPI({
        readResult: {
          configured: true,
          isSpacecake: false,
          command: "/other/script.sh",
        },
      })

      renderPrompt()
      await setServerReady()

      expect(container.textContent).toContain("enable statusline integration")
      expect(container.textContent).toContain(
        "Claude's statusline is configured but not pointing to Spacecake."
      )
    })

    it("does not show prompt when already configured for spacecake", async () => {
      window.electronAPI = createMockElectronAPI({
        readResult: {
          configured: true,
          isSpacecake: true,
          command: "/spacecake/script.sh",
        },
      })

      renderPrompt()
      await setServerReady()

      expect(container.textContent).not.toContain(
        "enable statusline integration"
      )
    })

    it("does not show prompt when previously dismissed", async () => {
      localStorage.setItem(
        "spacecake:statusline-prompt-dismissed",
        JSON.stringify(true)
      )

      window.electronAPI = createMockElectronAPI({
        readResult: { configured: false, isSpacecake: false },
      })

      renderPrompt()
      await setServerReady()

      expect(container.textContent).not.toContain(
        "enable statusline integration"
      )
    })
  })

  describe("user interactions", () => {
    it("calls update API when enable button is clicked", async () => {
      const mockApi = createMockElectronAPI({
        readResult: { configured: false, isSpacecake: false },
      })
      window.electronAPI = mockApi

      renderPrompt()
      await setServerReady()

      const enableButton = Array.from(
        container.querySelectorAll("button")
      ).find((btn) => btn.textContent === "enable statusline")
      expect(enableButton).toBeTruthy()

      await act(async () => {
        enableButton!.click()
      })
      await waitForEffects()

      expect(mockApi.claude.statusline.update).toHaveBeenCalled()
    })

    it("hides prompt after successful setup", async () => {
      const mockApi = createMockElectronAPI({
        readResult: { configured: false, isSpacecake: false },
        updateResult: undefined,
      })
      window.electronAPI = mockApi

      renderPrompt()
      await setServerReady()

      const enableButton = Array.from(
        container.querySelectorAll("button")
      ).find((btn) => btn.textContent === "enable statusline")

      await act(async () => {
        enableButton!.click()
      })
      await waitForEffects()

      expect(container.textContent).not.toContain(
        "enable statusline integration"
      )
    })

    it("shows error message when setup fails", async () => {
      const errorMessage = "Failed to write settings file"
      const mockApi = createMockElectronAPI({
        readResult: { configured: false, isSpacecake: false },
        updateError: { description: errorMessage },
      })
      window.electronAPI = mockApi

      renderPrompt()
      await setServerReady()

      const enableButton = Array.from(
        container.querySelectorAll("button")
      ).find((btn) => btn.textContent === "enable statusline")

      await act(async () => {
        enableButton!.click()
      })
      await waitForEffects()

      // Error should be displayed
      expect(container.textContent).toContain(errorMessage)
      // Prompt should still be visible for retry
      expect(container.textContent).toContain("enable statusline integration")
    })

    it("shows loading state while setting up", async () => {
      // Create a promise we control
      let resolveUpdate!: (value: unknown) => void
      const updatePromise = new Promise((resolve) => {
        resolveUpdate = resolve
      })

      const mockApi = createMockElectronAPI({
        readResult: { configured: false, isSpacecake: false },
      })
      mockApi.claude.statusline.update = vi.fn(() => updatePromise as never)
      window.electronAPI = mockApi

      renderPrompt()
      await setServerReady()

      const enableButton = Array.from(
        container.querySelectorAll("button")
      ).find((btn) => btn.textContent === "enable statusline")

      await act(async () => {
        enableButton!.click()
      })

      // Should show loading state
      expect(container.textContent).toContain("setting up...")

      // Resolve the promise
      await act(async () => {
        resolveUpdate(right(undefined))
      })
      await waitForEffects()
    })

    it("dismisses prompt when not now button is clicked", async () => {
      window.electronAPI = createMockElectronAPI({
        readResult: { configured: false, isSpacecake: false },
      })

      renderPrompt()
      await setServerReady()

      const notNowButton = Array.from(
        container.querySelectorAll("button")
      ).find((btn) => btn.textContent === "not now")
      expect(notNowButton).toBeTruthy()

      await act(async () => {
        notNowButton!.click()
      })
      await waitForEffects()

      expect(container.textContent).not.toContain(
        "enable statusline integration"
      )
      // Should persist dismissal
      expect(
        localStorage.getItem("spacecake:statusline-prompt-dismissed")
      ).toBe("true")
    })

    it("dismisses prompt when X button is clicked", async () => {
      window.electronAPI = createMockElectronAPI({
        readResult: { configured: false, isSpacecake: false },
      })

      renderPrompt()
      await setServerReady()

      const dismissButton = container.querySelector(
        "button[aria-label='dismiss']"
      ) as HTMLButtonElement
      expect(dismissButton).toBeTruthy()

      await act(async () => {
        dismissButton.click()
      })
      await waitForEffects()

      expect(container.textContent).not.toContain(
        "enable statusline integration"
      )
    })
  })

  describe("resetStatuslinePromptDismissed", () => {
    it("clears the dismissed state from localStorage", () => {
      localStorage.setItem(
        "spacecake:statusline-prompt-dismissed",
        JSON.stringify(true)
      )

      resetStatuslinePromptDismissed()

      expect(
        localStorage.getItem("spacecake:statusline-prompt-dismissed")
      ).toBeNull()
    })
  })

  describe("error handling", () => {
    it("logs error when reading statusline config fails", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      window.electronAPI = createMockElectronAPI({
        readError: { description: "Permission denied" },
      })

      renderPrompt()
      await setServerReady()

      expect(consoleSpy).toHaveBeenCalledWith(
        "failed to read statusline config:",
        expect.objectContaining({ description: "Permission denied" })
      )

      consoleSpy.mockRestore()
    })

    it("only fetches config once even when server ready toggles", async () => {
      const mockApi = createMockElectronAPI({
        readResult: { configured: false, isSpacecake: false },
      })
      window.electronAPI = mockApi

      renderPrompt()
      await setServerReady()

      // Toggle server ready off and back on
      await act(async () => {
        store.set(mockServerReadyAtom, false)
      })
      await act(async () => {
        store.set(mockServerReadyAtom, true)
      })
      await waitForEffects()

      // Should only have been called once due to hasFetchedRef
      expect(mockApi.claude.statusline.read).toHaveBeenCalledTimes(1)
    })
  })
})
