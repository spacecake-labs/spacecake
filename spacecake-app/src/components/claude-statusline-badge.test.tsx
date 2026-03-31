/**
 * @vitest-environment jsdom
 */
import { Provider, createStore } from "jotai"
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ClaudeStatuslineBadge } from "@/components/claude-statusline-badge"
import {
  activeTerminalSurfaceIdAtom,
  claudeRateLimitsAtom,
  statuslineMapAtom,
} from "@/lib/atoms/atoms"
import type { DisplayStatusline } from "@/lib/statusline-parser"

const mockStatusline: DisplayStatusline = {
  model: "Opus",
  contextUsagePercent: 42,
  contextRemainingPercent: 58,
  costUsd: 0.0123,
  cwd: "/home/user/project",
  sessionId: "session-abc",
  timestamp: Date.now(),
  surfaceId: "surface-1",
  rateLimits: null,
}

describe("ClaudeStatuslineBadge", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    store = createStore()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    document.body.removeChild(container)
  })

  async function render() {
    return act(async () => {
      root.render(
        <Provider store={store}>
          <ClaudeStatuslineBadge />
        </Provider>,
      )
    })
  }

  it("renders nothing when no statusline and no rate limits", async () => {
    await render()
    expect(container.querySelector("[title]")).toBeNull()
  })

  it("shows model, context, and cost when no rate limits", async () => {
    store.set(activeTerminalSurfaceIdAtom, "surface-1")
    store.set(statuslineMapAtom, new Map([["surface-1", mockStatusline]]))
    await render()

    const badge = container.firstElementChild
    expect(badge?.textContent).toBe("Opus | 🧠 42% | 💰 $0.01")
    expect(badge?.getAttribute("title")).not.toContain("5h")
    expect(badge?.getAttribute("title")).not.toContain("7d")
  })

  it("always shows 5h rate limit when fiveHour is present", async () => {
    store.set(activeTerminalSurfaceIdAtom, "surface-1")
    store.set(statuslineMapAtom, new Map([["surface-1", mockStatusline]]))
    store.set(claudeRateLimitsAtom, {
      fiveHour: { used_percentage: 23.5, resets_at: 9999999999 },
    })
    await render()

    const badge = container.firstElementChild
    expect(badge?.textContent).toContain("5h: 24%")
  })

  it("shows 5h at 0% usage (no threshold gate)", async () => {
    store.set(claudeRateLimitsAtom, {
      fiveHour: { used_percentage: 0, resets_at: 9999999999 },
    })
    await render()

    const badge = container.firstElementChild
    expect(badge?.textContent).toContain("5h: 0%")
  })

  it("does not show 7d when usage is below 50%", async () => {
    store.set(activeTerminalSurfaceIdAtom, "surface-1")
    store.set(statuslineMapAtom, new Map([["surface-1", mockStatusline]]))
    store.set(claudeRateLimitsAtom, {
      fiveHour: { used_percentage: 23.5, resets_at: 9999999999 },
      sevenDay: { used_percentage: 41.2, resets_at: 9999999999 },
    })
    await render()

    const badge = container.firstElementChild
    expect(badge?.textContent).not.toContain("7d")
  })

  it("shows 7d when usage is at exactly 50%", async () => {
    store.set(claudeRateLimitsAtom, {
      fiveHour: { used_percentage: 10, resets_at: 9999999999 },
      sevenDay: { used_percentage: 50, resets_at: 9999999999 },
    })
    await render()

    const badge = container.firstElementChild
    expect(badge?.textContent).toContain("7d: 50%")
  })

  it("shows 7d when usage is above 50%", async () => {
    store.set(claudeRateLimitsAtom, {
      fiveHour: { used_percentage: 72, resets_at: 9999999999 },
      sevenDay: { used_percentage: 65, resets_at: 9999999999 },
    })
    await render()

    const badge = container.firstElementChild
    expect(badge?.textContent).toContain("5h: 72%")
    expect(badge?.textContent).toContain("7d: 65%")
  })

  it("rate limits remain visible when active surface changes (account-level persistence)", async () => {
    // Set up rate limits with an active statusline on surface-1
    store.set(activeTerminalSurfaceIdAtom, "surface-1")
    store.set(statuslineMapAtom, new Map([["surface-1", mockStatusline]]))
    store.set(claudeRateLimitsAtom, {
      fiveHour: { used_percentage: 55, resets_at: 9999999999 },
    })
    await render()

    // switch to a surface with no statusline data
    await act(async () => {
      store.set(activeTerminalSurfaceIdAtom, "surface-2")
    })

    const badge = container.firstElementChild
    // rate limits still visible even though claudeStatuslineAtom is now null
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain("5h: 55%")
  })

  it("includes reset time in title tooltip for 5h", async () => {
    const farFutureEpoch = Math.floor(Date.now() / 1000) + 7200 // 2 hours from now
    store.set(claudeRateLimitsAtom, {
      fiveHour: { used_percentage: 40, resets_at: farFutureEpoch },
    })
    await render()

    const badge = container.firstElementChild
    const title = badge?.getAttribute("title") ?? ""
    expect(title).toContain("5h: 40% (resets in")
  })
})
