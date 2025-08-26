import { Page } from "@playwright/test"

export function getEditorElement(
  page: Page,
  parentSelector = ".ContentEditable__root"
) {
  const selector = `${parentSelector} div[contenteditable="true"]`
  return page.locator(selector).first()
}

export async function focusEditor(
  page,
  parentSelector = ".ContentEditable__root"
) {
  const locator = getEditorElement(page, parentSelector)
  await locator.focus()
}
