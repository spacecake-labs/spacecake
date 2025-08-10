/* */

import { test, expect } from "./fixtures";

test.describe("theme toggle", () => {
  test("toggles theme and persists selection", async ({ electronApp }) => {
    const appWindow = await electronApp.firstWindow();

    await expect(appWindow.locator("body")).toBeVisible();

    // capture initial state from the root html element
    const isDarkBefore = await appWindow.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );

    // click the toggle button (always present in header)
    await appWindow.getByRole("button", { name: "toggle theme" }).click();

    // wait for the class to flip, and verify dark/light are mutually exclusive
    await expect
      .poll(async () =>
        appWindow.evaluate(() => {
          const cl = document.documentElement.classList;
          return {
            hasDark: cl.contains("dark"),
            hasLight: cl.contains("light"),
          };
        })
      )
      .toEqual({ hasDark: !isDarkBefore, hasLight: isDarkBefore });

    // verify persisted theme is now explicit (light or dark)
    const persisted = await appWindow.evaluate(() => {
      const v = localStorage.getItem("spacecake-theme");
      return v ? JSON.parse(v) : null;
    });
    expect(["light", "dark"]).toContain(persisted as string);

    // toggle back; class should restore to original state and remain exclusive
    await appWindow.getByRole("button", { name: "toggle theme" }).click();
    await expect
      .poll(async () =>
        appWindow.evaluate(() => {
          const cl = document.documentElement.classList;
          return {
            hasDark: cl.contains("dark"),
            hasLight: cl.contains("light"),
          };
        })
      )
      .toEqual({ hasDark: isDarkBefore, hasLight: !isDarkBefore });
  });
});
