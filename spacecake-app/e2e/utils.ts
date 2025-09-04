import { Page } from "@playwright/test"

export async function pressQuickOpen(page: Page) {
  page.keyboard.press("ControlOrMeta+p")
}

export function locateQuickOpenInput(page: Page) {
  return page.getByRole("dialog", { name: "quick open" }).locator("div").nth(1)
}

export function locateQuickOpenList(page: Page) {
  return page.getByRole("listbox", { name: "Suggestions" }).getByRole("option")
}
