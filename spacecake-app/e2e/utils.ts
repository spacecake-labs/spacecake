import { ElectronApplication, Locator, Page } from "@playwright/test"

export async function pressQuickOpen(page: Page) {
  page.keyboard.press("ControlOrMeta+p")
}

export function locateQuickOpenInput(page: Page) {
  return page.getByRole("dialog", { name: "quick open" }).locator("div").nth(1)
}

export function locateQuickOpenList(page: Page) {
  return page.getByRole("listbox", { name: "Suggestions" }).getByRole("option")
}

/**
 * Locates a file/folder button in the sidebar by name.
 * Scopes the search to avoid matching tab bar close buttons.
 */
export function locateSidebarItem(page: Page, name: string): Locator {
  return page.getByTestId("sidebar").getByRole("button", { name })
}

/**
 * Locates a tab in the tab bar by file name.
 */
export function locateTab(page: Page, fileName: string): Locator {
  return page.getByRole("tab", { name: fileName })
}

/**
 * Locates the close button for a tab.
 */
export function locateTabCloseButton(page: Page, fileName: string): Locator {
  return page.getByRole("button", { name: `close ${fileName}` })
}

/**
 * Clicks a menu item in the application menu by label path.
 * Works cross-platform — uses the main process Menu API directly,
 * so the native menu doesn't need to be visible or interactable via DOM.
 *
 * On windows/linux the same menu is shown via the hamburger popup,
 * but native popup menus can't be driven from Playwright either,
 * so this helper is the canonical way to trigger menu actions in e2e tests.
 *
 * @param app - The Electron application instance
 * @param menuLabel - The top-level menu label (e.g. "File")
 * @param itemLabel - The menu item label (e.g. "New File")
 */
export async function clickMenuItem(
  app: ElectronApplication,
  menuLabel: string,
  itemLabel: string,
): Promise<void> {
  const maxRetries = 3
  for (let i = 0; i < maxRetries; i++) {
    try {
      await app.evaluate(
        ({ Menu }, { menuLabel, itemLabel }) => {
          const appMenu = Menu.getApplicationMenu()
          if (!appMenu) throw new Error("no application menu found")
          const topLevel = appMenu.items.find((i) => i.label === menuLabel)
          if (!topLevel?.submenu) throw new Error(`menu "${menuLabel}" not found`)
          const item = topLevel.submenu.items.find((i) => i.label === itemLabel)
          if (!item) throw new Error(`menu item "${itemLabel}" not found in "${menuLabel}"`)
          item.click()
        },
        { menuLabel, itemLabel },
      )
      return
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}

/**
 * Gets all terminal content including scrollback history.
 * Captures visible rows + full scrollback buffer using ghostty-web API.
 *
 * @param page - The Playwright page
 * @returns All terminal lines joined as a single string, or undefined if API unavailable
 */
export async function getTerminalContent(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (globalThis as any).__terminalAPI
    if (!api) return undefined
    return api.getAllLines().join("") as string | undefined
  })
}
