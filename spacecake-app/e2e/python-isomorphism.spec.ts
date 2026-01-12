import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "./fixtures"

test.describe("python isomorphism e2e", () => {
  test("core.py maintains isomorphism through editor roundtrip (complex structures and async functions)", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // create a python file with comprehensive content including nested structures and async
    const coreContent = `"""A file to test block parsing."""

from datetime import datetime
import asyncio
from typing import List, Optional

@dataclass
class Person:
    name: str
    age: int

def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

class Calculator:
    def add(self, a, b):
        return a + b

class OuterClass:
    """Outer class with nested structure."""
    
    def __init__(self):
        self.value = 42
    
    class InnerClass:
        def inner_method(self):
            pass

def outer_function():
    """Function with nested function."""
    def inner_function():
        return "nested"
    return inner_function()

async def async_function():
    """Async function for testing."""
    await asyncio.sleep(0.1)
    return "async result"

class AsyncClass:
    async def async_method(self):
        await asyncio.sleep(0.1)
        return "async method result"

# some misc code
x = 42
y = "hello"

if __name__ == "__main__":
    print("main")`

    const destPath = path.join(tempTestDir, "core.py")
    fs.writeFileSync(destPath, coreContent, "utf-8")

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // open the file
    await window.getByRole("button", { name: "core.py" }).first().click()
    await expect(window.getByTestId("lexical-editor")).toBeVisible()

    // verify the file loads with all rich (basic elements)
    await window.getByText("🐍").first().click()
    await expect(window.getByText("import").first()).toBeVisible()
    await expect(window.getByText("Person").first()).toBeVisible()
    await expect(window.getByText("dataclass").first()).toBeVisible()
    await expect(window.getByText("fibonacci").first()).toBeVisible()
    await expect(window.getByText("function").first()).toBeVisible()
    await expect(window.getByText("Calculator").first()).toBeVisible()
    await expect(
      window.getByText("class", { exact: true }).first()
    ).toBeVisible()
    await expect(window.getByText("misc").first()).toBeVisible()

    // verify complex nested structures are present
    await expect(window.getByText("OuterClass").first()).toBeVisible()
    await expect(window.getByText("outer_function").first()).toBeVisible()

    // verify async functions are present
    await expect(window.getByText("async_function").first()).toBeVisible()
    await expect(window.getByText("AsyncClass").first()).toBeVisible()

    // save the file without any changes
    const saveBtn = window.getByRole("button", { name: "save", exact: true })
    await saveBtn.click()

    // verify the file was saved with the exact same content
    const savedContent = fs.readFileSync(destPath, "utf-8")
    expect(savedContent).toBe(coreContent)

    // verify file modification time has been updated (indicating save occurred)
    const savedStats = fs.statSync(destPath)
    expect(savedStats.mtimeMs).toBeGreaterThan(0)
  })

  test("empty python file maintains isomorphism through editor roundtrip", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // create an empty python file
    const emptyPyPath = path.join(tempTestDir, "empty.py")
    fs.writeFileSync(emptyPyPath, "", "utf-8")

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // open the empty file
    await window.getByRole("button", { name: "empty.py" }).first().click()

    // verify empty file loads (should show as a single file block)
    await window.getByText("🐍").first().click()
    await expect(window.getByText("file").first()).toBeVisible()

    // save the file
    const saveBtn = window.getByRole("button", { name: "save", exact: true })
    await saveBtn.click()

    // verify content remains empty
    const savedContent = fs.readFileSync(emptyPyPath, "utf-8")
    expect(savedContent).toBe("")
  })

  test("python file with only comments maintains isomorphism through editor roundtrip", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow()

    // create a python file with comment content
    const commentContent = "# just a comment\n# another comment\n"
    const commentPyPath = path.join(tempTestDir, "comments.py")
    fs.writeFileSync(commentPyPath, commentContent, "utf-8")

    // open the temp test directory as workspace
    await waitForWorkspace(window)

    // open the comments file
    await window.getByRole("button", { name: "comments.py" }).first().click()

    // verify comments file loads (should show as a single file block)
    await window.getByText("🐍").first().click()
    await expect(window.getByText("file").first()).toBeVisible()

    // verify comments are visible
    await expect(window.getByText("just a comment").first()).toBeVisible()
    await expect(window.getByText("another comment").first()).toBeVisible()

    // save the file without any changes
    const saveBtn = window.getByRole("button", { name: "save", exact: true })
    await saveBtn.click()

    // verify content remains identical
    const savedContent = fs.readFileSync(commentPyPath, "utf-8")
    expect(savedContent).toBe(commentContent)
  })
})
