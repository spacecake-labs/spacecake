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

  test("switching between core.py and empty.py updates editor", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow();

    // copy both fixtures into the temp workspace
    const coreFixture = path.join(process.cwd(), "tests/fixtures/core.py");
    const emptyFixture = path.join(process.cwd(), "tests/fixtures/empty.py");
    const coreDest = path.join(tempTestDir, "core.py");
    const emptyDest = path.join(tempTestDir, "empty.py");
    fs.copyFileSync(coreFixture, coreDest);
    fs.copyFileSync(emptyFixture, emptyDest);

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await window.getByRole("button", { name: "open folder" }).click();

    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible();

    // open core.py and verify python blocks are visible
    await window.getByRole("button", { name: "core.py" }).first().click();
    await window.getByText("🐍").first().click();
    await expect(window.getByText("import").first()).toBeVisible();

    // switch to empty.py and verify default toolbar state
    await window.getByRole("button", { name: "empty.py" }).first().click();
    // wait until header reflects the newly selected file path (contains 'empty.py')
    await expect
      .poll(async () =>
        window.evaluate(
          () => document.querySelector("header")?.textContent || ""
        )
      )
      .toContain("empty.py");
    // verify the editor shows content from empty.py
    await expect(window.getByText("An empty file.").first()).toBeVisible();
  });

  test("switching between files in different folders updates editor", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow();

    // create nested folder and copy fixtures
    const nestedFolder = path.join(tempTestDir, "nested");
    fs.mkdirSync(nestedFolder, { recursive: true });
    const coreFixture = path.join(process.cwd(), "tests/fixtures/core.py");
    const emptyFixture = path.join(process.cwd(), "tests/fixtures/empty.py");
    const coreDest = path.join(tempTestDir, "core.py");
    const emptyDest = path.join(nestedFolder, "empty.py");
    fs.copyFileSync(coreFixture, coreDest);
    fs.copyFileSync(emptyFixture, emptyDest);

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await window.getByRole("button", { name: "open folder" }).click();

    await expect(
      window.getByRole("button", { name: "create file or folder" })
    ).toBeVisible();

    // open core.py and verify python content
    await window.getByRole("button", { name: "core.py" }).first().click();
    await window.getByText("🐍").first().click();
    await expect(window.getByText("import").first()).toBeVisible();

    // expand nested folder and open empty.py
    await window.getByRole("button", { name: "nested" }).first().click();
    await window.getByRole("button", { name: "empty.py" }).first().click();

    // wait for selection to reflect switch
    await expect
      .poll(async () =>
        window.evaluate(
          () => document.querySelector("header")?.textContent || ""
        )
      )
      .toContain("empty.py");

    // verify editor shows content from empty.py
    await expect(window.getByText("An empty file.").first()).toBeVisible();
  });
});
