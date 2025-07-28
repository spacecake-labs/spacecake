const { _electron: electron } = require("playwright");

(async () => {
  const browser = await electron.launch({
    args: [".vite/build/main.js"],
    cwd: process.cwd(),
    timeout: 60000, // increase timeout to 60 seconds
  });
  const context = await browser.context();
  await context.route("**/*", (route) => route.continue());

  await require("node:timers/promises").setTimeout(3000); // wait for the window to load
  await browser.windows()[0].pause(); // .pause() opens the Playwright-Inspector for manual recording
})();
