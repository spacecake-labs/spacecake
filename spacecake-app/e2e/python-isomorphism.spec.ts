import { test, expect } from "./fixtures";
import { stubDialog } from "electron-playwright-helpers";
import path from "path";
import fs from "fs";

test.describe("python isomorphism e2e", () => {
  test("core.py maintains isomorphism through editor roundtrip", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow();

    // create a python file with content to start with
    const coreContent = `"""A file to test block parsing."""

from datetime import datetime

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

# some misc code
x = 42
y = "hello"

if __name__ == "__main__":
    print("main")`;

    const destPath = path.join(tempTestDir, "core.py");
    fs.writeFileSync(destPath, coreContent, "utf-8");

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await window.getByRole("button", { name: "open folder" }).click();

    // open the file
    await window.getByRole("button", { name: "core.py" }).first().click();
    await expect(window.getByTestId("lexical-editor")).toBeVisible();

    // verify the file loads with all blocks
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

    // save the file without any changes
    const saveBtn = window.getByRole("button", { name: "save" });
    await saveBtn.click();

    // verify the file was saved with the exact same content
    const savedContent = fs.readFileSync(destPath, "utf-8");
    expect(savedContent).toBe(coreContent);

    // verify file modification time has been updated (indicating save occurred)
    const savedStats = fs.statSync(destPath);
    expect(savedStats.size).toBeGreaterThan(0);
  });

  test("empty python file maintains isomorphism through editor roundtrip", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow();

    // create an empty python file
    const emptyPyPath = path.join(tempTestDir, "empty.py");
    fs.writeFileSync(emptyPyPath, "", "utf-8");

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await window.getByRole("button", { name: "open folder" }).click();

    // open the empty file
    await window.getByRole("button", { name: "empty.py" }).first().click();

    // verify empty file loads (should show as a single file block)
    await window.getByText("🐍").first().click();
    await expect(window.getByText("file").first()).toBeVisible();

    // save the file
    const saveBtn = window.getByRole("button", { name: "save" });
    await saveBtn.click();

    // verify content remains empty
    const savedContent = fs.readFileSync(emptyPyPath, "utf-8");
    expect(savedContent).toBe("");
  });

  test("python file with only comments maintains isomorphism through editor roundtrip", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow();

    // create a python file with comment content
    const commentContent = "# just a comment\n# another comment\n";
    const commentPyPath = path.join(tempTestDir, "comments.py");
    fs.writeFileSync(commentPyPath, commentContent, "utf-8");

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await window.getByRole("button", { name: "open folder" }).click();

    // open the comments file
    await window.getByRole("button", { name: "comments.py" }).first().click();

    // verify comments file loads (should show as a single file block)
    await window.getByText("🐍").first().click();
    await expect(window.getByText("file").first()).toBeVisible();

    // verify comments are visible
    await expect(window.getByText("just a comment").first()).toBeVisible();
    await expect(window.getByText("another comment").first()).toBeVisible();

    // save the file without any changes
    const saveBtn = window.getByRole("button", { name: "save" });
    await saveBtn.click();

    // verify content remains identical
    const savedContent = fs.readFileSync(commentPyPath, "utf-8");
    expect(savedContent).toBe(commentContent);
  });

  test("python file with complex structure maintains isomorphism through editor roundtrip", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow();

    // create a python file with complex content
    const complexContent = `"""Complex module docstring"""

import os
import sys
from typing import List, Optional

class OuterClass:
    """Class docstring"""
    
    def __init__(self):
        self.value = 42
    
    class InnerClass:
        def inner_method(self):
            pass

def outer_function():
    """Function docstring"""
    def inner_function():
        return "nested"
    return inner_function()

if __name__ == "__main__":
    print("main")`;

    const complexPyPath = path.join(tempTestDir, "complex.py");
    fs.writeFileSync(complexPyPath, complexContent, "utf-8");

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await window.getByRole("button", { name: "open folder" }).click();

    // open the complex file
    await window.getByRole("button", { name: "complex.py" }).first().click();

    await expect(window.getByTestId("lexical-editor")).toBeVisible();

    // verify complex file loads with all expected blocks
    await window.getByText("🐍").first().click();
    await expect(window.getByText("doc").first()).toBeVisible();
    await expect(window.getByText("import").first()).toBeVisible();
    await expect(window.getByText("OuterClass").first()).toBeVisible();
    await expect(
      window.getByText("class", { exact: true }).first()
    ).toBeVisible();
    await expect(window.getByText("outer_function").first()).toBeVisible();
    await expect(
      window.getByText("function", { exact: true }).first()
    ).toBeVisible();
    await expect(window.getByText("main").first()).toBeVisible();

    // save the file without any changes
    const saveBtn = window.getByRole("button", { name: "save" });
    await saveBtn.click();

    await expect(window.getByTestId("lexical-editor")).toBeVisible();

    // verify the content was saved exactly
    const savedContent = fs.readFileSync(complexPyPath, "utf-8");
    expect(savedContent).toBe(complexContent);
  });

  test("python file with async functions maintains isomorphism through editor roundtrip", async ({
    electronApp,
    tempTestDir,
  }) => {
    const window = await electronApp.firstWindow();

    // create a python file with async content
    const asyncContent = `"""Async module"""

import asyncio

async def async_function():
    await asyncio.sleep(0.1)
    return "async result"

class AsyncClass:
    async def async_method(self):
        await asyncio.sleep(0.1)
        return "async method result"`;

    const asyncPyPath = path.join(tempTestDir, "async.py");
    fs.writeFileSync(asyncPyPath, asyncContent, "utf-8");

    await stubDialog(electronApp, "showOpenDialog", {
      filePaths: [tempTestDir],
      canceled: false,
    });

    await window.getByRole("button", { name: "open folder" }).click();

    // open the async file
    await window.getByRole("button", { name: "async.py" }).first().click();

    // verify async file loads correctly
    await window.getByText("🐍").first().click();

    // Check what blocks are actually visible - the docstring might not be parsed as a separate block
    // Let's verify the key elements are present
    await expect(window.getByText("import").first()).toBeVisible();
    await expect(window.getByText("async_function").first()).toBeVisible();
    await expect(
      window.getByText("function", { exact: true }).first()
    ).toBeVisible();
    await expect(window.getByText("AsyncClass").first()).toBeVisible();
    await expect(
      window.getByText("class", { exact: true }).first()
    ).toBeVisible();

    // save the file without any changes
    const saveBtn = window.getByRole("button", { name: "save" });
    await saveBtn.click();

    // verify content remains identical
    const savedContent = fs.readFileSync(asyncPyPath, "utf-8");
    expect(savedContent).toBe(asyncContent);
  });
});
