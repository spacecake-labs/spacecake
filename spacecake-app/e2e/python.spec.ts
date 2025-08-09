import { test, expect, expectAllNonEmptyLinesVisible } from "./fixtures";
import { stubDialog } from "electron-playwright-helpers";
import path from "path";
import fs from "fs";

test.describe("python e2e", () => {
  test("open workspace and create an empty python file", async ({
    electronApp,
    tempTestDir,
  }, testInfo) => {
    const window = await electronApp.firstWindow();

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await window.getByRole("button", { name: "open folder" }).click();

    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible();

    // create a python file
    await window.getByRole("button", { name: "create file or folder" }).click();
    await window.getByRole("menuitem", { name: "new file" }).click();

    const textbox = window.getByRole("textbox", { name: "filename.txt" });
    await textbox.fill("empty.py");
    await textbox.press("Enter");

    await expect(
      window.getByRole("button", { name: "empty.py" }).first()
    ).toBeVisible();

    // open the newly created file
    await window.getByRole("button", { name: "empty.py" }).first().click();

    // focus the code block toolbar and verify default code block type appears
    await window.getByText("🐍").first().click();
    await expect(window.getByText("file").first()).toBeVisible();

    const expectedFilePath = path.join(tempTestDir, "empty.py");
    expect(fs.existsSync(expectedFilePath)).toBe(true);

    testInfo.annotations.push({
      type: "info",
      description: `created python file: ${expectedFilePath}`,
    });
  });

  test("open workspace and render core.py blocks", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow();

    // copy core.py fixture into the temp workspace
    const fixturePath = path.join(process.cwd(), "tests/fixtures/core.py");
    const destPath = path.join(tempTestDir, "core.py");
    fs.copyFileSync(fixturePath, destPath);

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await window.getByRole("button", { name: "open folder" }).click();

    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible();

    // open the file
    await window.getByRole("button", { name: "core.py" }).first().click();

    // verify blocks are present via toolbar and labels
    await window.getByText("🐍").first().click();
    await expect(window.getByText("import").first()).toBeVisible();
    await expect(window.getByText("Person").first()).toBeVisible();
    await expect(window.getByText("dataclass").first()).toBeVisible();
    await expect(window.getByText("fibonacci").first()).toBeVisible();
    await expect(window.getByText("function").first()).toBeVisible();
    await expect(window.getByText("Calculator").first()).toBeVisible();
    await expect(
      window.getByText("class", { exact: true }).first()
    ).toBeVisible();
    await expect(window.getByText("misc").first()).toBeVisible();

    // verify key lines render
    await expect(window.getByText("class Calculator:").first()).toBeVisible();
    await expect(
      window.getByText("def add(self, a, b):").first()
    ).toBeVisible();
    await expect(window.getByText("return a + b").first()).toBeVisible();

    // additionally, loop through all non-empty lines and ensure they're present
    await expectAllNonEmptyLinesVisible(window, fixturePath);
  });
});
