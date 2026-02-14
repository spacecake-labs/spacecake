/**
 * @vitest-environment jsdom
 */
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TabItem } from "@/components/tab-bar/tab-item"
import { Tabs, TabsList } from "@/components/ui/tabs"

describe("TabItem", () => {
  let container: HTMLDivElement | null = null
  let root: ReturnType<typeof createRoot> | null = null

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root?.unmount()
    })
    if (container) {
      document.body.removeChild(container)
    }
  })

  function renderTab(onClose: (e: React.MouseEvent) => void) {
    return act(async () => {
      root!.render(
        <Tabs value="test-id">
          <TabsList>
            <TabItem
              id="test-id"
              fileName="test.md"
              filePath="/test.md"
              isActive={true}
              onClose={onClose}
            />
          </TabsList>
        </Tabs>,
      )
    })
  }

  it("middle-click calls onClose", async () => {
    const mockOnClose = vi.fn()
    await renderTab(mockOnClose)

    const tabSpan = container!.querySelector("span.flex.shrink-0")!
    await act(async () => {
      tabSpan.dispatchEvent(new MouseEvent("mousedown", { button: 1, bubbles: true }))
    })

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it("left-click does not call onClose", async () => {
    const mockOnClose = vi.fn()
    await renderTab(mockOnClose)

    const tabSpan = container!.querySelector("span.flex.shrink-0")!
    await act(async () => {
      tabSpan.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }))
    })

    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it("right-click does not call onClose", async () => {
    const mockOnClose = vi.fn()
    await renderTab(mockOnClose)

    const tabSpan = container!.querySelector("span.flex.shrink-0")!
    await act(async () => {
      tabSpan.dispatchEvent(new MouseEvent("mousedown", { button: 2, bubbles: true }))
    })

    expect(mockOnClose).not.toHaveBeenCalled()
  })
})
