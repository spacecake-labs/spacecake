/**
 * @vitest-environment jsdom
 */
import { Provider, createStore } from "jotai"
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ModeToggle } from "@/components/mode-toggle"
import { themeAtom } from "@/lib/atoms/atoms"

describe("ModeToggle", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    store = createStore()
    localStorage.clear()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    document.body.removeChild(container)
  })

  function render() {
    return act(async () => {
      root.render(
        <Provider store={store}>
          <ModeToggle />
        </Provider>,
      )
    })
  }

  it("defaults to light when system preference is light", async () => {
    // matchMedia mock returns matches: false by default (light)
    store.set(themeAtom, "system")
    await render()

    const btn = container.querySelector('[aria-label="switch to dark mode"]')
    expect(btn).toBeTruthy()
  })

  it("toggles from light to dark", async () => {
    store.set(themeAtom, "light")
    await render()

    const btn = container.querySelector('[aria-label="switch to dark mode"]')
    expect(btn).toBeTruthy()

    await act(async () => {
      btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(store.get(themeAtom)).toBe("dark")

    const nextBtn = container.querySelector('[aria-label="switch to light mode"]')
    expect(nextBtn).toBeTruthy()
  })

  it("toggles from dark to light", async () => {
    store.set(themeAtom, "dark")
    await render()

    const btn = container.querySelector('[aria-label="switch to light mode"]')
    expect(btn).toBeTruthy()

    await act(async () => {
      btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(store.get(themeAtom)).toBe("light")
  })

  it("persists theme to localStorage via atomWithStorage", async () => {
    store.set(themeAtom, "light")
    await render()

    const btn = container.querySelector('[aria-label="switch to dark mode"]')
    await act(async () => {
      btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    const persisted = localStorage.getItem("spacecake-theme")
    expect(persisted).not.toBeNull()
    expect(JSON.parse(persisted!)).toBe("dark")
  })

  it("renders all variants", async () => {
    for (const variant of ["icon", "compact", undefined] as const) {
      await act(async () => {
        root.render(
          <Provider store={store}>
            <ModeToggle variant={variant} />
          </Provider>,
        )
      })

      const btn = container.querySelector('[aria-label*="switch to"]')
      expect(btn, `variant=${variant} should render a toggle button`).toBeTruthy()
    }
  })
})
