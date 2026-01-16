import { vi } from "vitest"

// only set up DOM mocks in jsdom environment
if (typeof window !== "undefined") {
  // Tell React that we're in a test environment (suppresses act() warnings)
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  // mock window.matchMedia for mermaid and theme provider
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  // mock localStorage for jotai
  const localStorageMock = (() => {
    let store: Record<string, string> = {}

    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value.toString()
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        store = {}
      },
    }
  })()

  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
  })
}
