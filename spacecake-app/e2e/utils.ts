import { Locator, Page } from "@playwright/test"

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
  return page.getByRole("button", { name: `Close ${fileName}` })
}
