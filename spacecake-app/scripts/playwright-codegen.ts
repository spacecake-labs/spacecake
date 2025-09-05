import { setTimeout } from "node:timers/promises"

import { _electron } from "playwright"

;(async () => {
  const browser = await _electron.launch({
    args: [".vite/build/main.js"],
    cwd: process.cwd(),
    timeout: 30000,
  })
  const context = browser.context()
  await context.route("**/*", (route) => route.continue())

  await setTimeout(3000) // wait for the window to load
  await browser.windows()[0].pause() // .pause() opens the Playwright-Inspector for manual recording
})()
