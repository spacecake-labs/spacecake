import { _electron } from "playwright";
import { setTimeout } from "node:timers/promises";

(async () => {
  const browser = await _electron.launch({
    args: [".vite/build/main.js"],
    cwd: process.cwd(),
    timeout: 60000, // increase timeout to 60 seconds
  });
  const context = browser.context();
  await context.route("**/*", (route) => route.continue());

  await setTimeout(3000); // wait for the window to load
  await browser.windows()[0].pause(); // .pause() opens the Playwright-Inspector for manual recording
})();
