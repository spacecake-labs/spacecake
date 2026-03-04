import fs from "fs"
import path from "path"

import { expect, test, waitForWorkspace } from "@/../e2e/fixtures"
import {
  locateQuickOpenInput,
  locateQuickOpenList,
  locateSidebarItem,
  locateTabCloseButton,
} from "@/../e2e/utils"

type PerfMetrics = {
  heapUsedMB: number
  scriptDurationMs: number
  layoutCount: number
  recalcStyleCount: number
  taskDurationMs: number
}

test.describe("memory benchmark", () => {
  test("measure heap usage across file operations", async ({ electronApp, tempTestDir }) => {
    test.setTimeout(120_000)

    // create 200 synthetic markdown files
    for (let i = 0; i < 200; i++) {
      const fileName = `file-${String(i).padStart(3, "0")}.md`
      fs.writeFileSync(
        path.join(tempTestDir, fileName),
        `# file ${i}\n\nsome content for file ${i}.\n\n${"lorem ipsum dolor sit amet. ".repeat(20)}\n`,
      )
    }

    const page = await electronApp.firstWindow()

    // open CDP session for GC + performance metrics
    const cdpSession = await electronApp.context().newCDPSession(page)
    await cdpSession.send("HeapProfiler.enable")
    await cdpSession.send("Performance.enable")

    const getMetrics = async (): Promise<Record<string, number>> => {
      const { metrics } = (await cdpSession.send("Performance.getMetrics")) as {
        metrics: { name: string; value: number }[]
      }
      return Object.fromEntries(metrics.map((m) => [m.name, m.value]))
    }

    const measure = async (): Promise<PerfMetrics> => {
      await cdpSession.send("HeapProfiler.collectGarbage")
      await page.waitForTimeout(500)
      const { usedSize } = (await cdpSession.send("Runtime.getHeapUsage")) as {
        usedSize: number
      }
      const m = await getMetrics()
      return {
        heapUsedMB: Math.round((usedSize / 1024 / 1024) * 10) / 10,
        scriptDurationMs: Math.round(m.ScriptDuration * 1000),
        layoutCount: m.LayoutCount,
        recalcStyleCount: m.RecalcStyleCount,
        taskDurationMs: Math.round(m.TaskDuration * 1000),
      }
    }

    // delta between two snapshots (for cumulative counters like layoutCount)
    const delta = (before: PerfMetrics, after: PerfMetrics): PerfMetrics => ({
      heapUsedMB: after.heapUsedMB,
      scriptDurationMs: after.scriptDurationMs - before.scriptDurationMs,
      layoutCount: after.layoutCount - before.layoutCount,
      recalcStyleCount: after.recalcStyleCount - before.recalcStyleCount,
      taskDurationMs: after.taskDurationMs - before.taskDurationMs,
    })

    await waitForWorkspace(page)
    // let workspace cache settle after loading 200 files
    await page.waitForTimeout(2000)

    const baseline = await measure()

    // open 10 files via sidebar clicks
    const firstBatch = Array.from({ length: 10 }, (_, i) => `file-${String(i).padStart(3, "0")}.md`)
    for (const fileName of firstBatch) {
      await locateSidebarItem(page, fileName).click()
      await page.waitForTimeout(300)
    }
    await page.waitForTimeout(1000)

    const afterOpenFiles = await measure()

    // close all open tabs
    for (const fileName of [...firstBatch].reverse()) {
      await locateTabCloseButton(page, fileName).click()
      await page.waitForTimeout(100)
    }
    await page.waitForTimeout(1000)

    const afterCloseFiles = await measure()

    // open 10 different files (tests cleanup after close)
    const secondBatch = Array.from(
      { length: 10 },
      (_, i) => `file-${String(i + 10).padStart(3, "0")}.md`,
    )
    for (const fileName of secondBatch) {
      await locateSidebarItem(page, fileName).click()
      await page.waitForTimeout(300)
    }
    await page.waitForTimeout(1000)

    const afterReopen = await measure()

    const results = {
      baseline: { heapUsedMB: baseline.heapUsedMB },
      openFiles: delta(baseline, afterOpenFiles),
      closeFiles: delta(afterOpenFiles, afterCloseFiles),
      reopenFiles: delta(afterCloseFiles, afterReopen),
    }

    console.log("MEMORY_BENCHMARK_RESULTS:" + JSON.stringify(results))

    await cdpSession.send("Performance.disable")
    await cdpSession.send("HeapProfiler.disable")
    await cdpSession.detach()
  })

  test("measure heap usage across quick open operations", async ({ electronApp, tempTestDir }) => {
    test.setTimeout(120_000)

    // create 2000 files across nested directories to simulate a real project
    const dirs = [
      "src",
      "src/components",
      "src/hooks",
      "src/lib",
      "tests",
      "docs",
      "scripts",
      "config",
    ]
    for (const dir of dirs) {
      fs.mkdirSync(path.join(tempTestDir, dir), { recursive: true })
    }
    for (let i = 0; i < 2000; i++) {
      const dir = dirs[i % dirs.length]
      const ext = i % 3 === 0 ? "ts" : i % 3 === 1 ? "md" : "tsx"
      const fileName = `file-${String(i).padStart(4, "0")}.${ext}`
      fs.writeFileSync(
        path.join(tempTestDir, dir, fileName),
        `// file ${i}\nexport const value${i} = ${i}\n${"// filler line\n".repeat(10)}`,
      )
    }

    const page = await electronApp.firstWindow()

    const cdpSession = await electronApp.context().newCDPSession(page)
    await cdpSession.send("HeapProfiler.enable")
    await cdpSession.send("Performance.enable")

    const getMetrics = async (): Promise<Record<string, number>> => {
      const { metrics } = (await cdpSession.send("Performance.getMetrics")) as {
        metrics: { name: string; value: number }[]
      }
      return Object.fromEntries(metrics.map((m) => [m.name, m.value]))
    }

    const measure = async (): Promise<PerfMetrics> => {
      await cdpSession.send("HeapProfiler.collectGarbage")
      await page.waitForTimeout(500)
      const { usedSize } = (await cdpSession.send("Runtime.getHeapUsage")) as {
        usedSize: number
      }
      const m = await getMetrics()
      return {
        heapUsedMB: Math.round((usedSize / 1024 / 1024) * 10) / 10,
        scriptDurationMs: Math.round(m.ScriptDuration * 1000),
        layoutCount: m.LayoutCount,
        recalcStyleCount: m.RecalcStyleCount,
        taskDurationMs: Math.round(m.TaskDuration * 1000),
      }
    }

    const delta = (before: PerfMetrics, after: PerfMetrics): PerfMetrics => ({
      heapUsedMB: after.heapUsedMB,
      scriptDurationMs: after.scriptDurationMs - before.scriptDurationMs,
      layoutCount: after.layoutCount - before.layoutCount,
      recalcStyleCount: after.recalcStyleCount - before.recalcStyleCount,
      taskDurationMs: after.taskDurationMs - before.taskDurationMs,
    })

    await waitForWorkspace(page)
    // let workspace cache settle after loading 2000 files
    await page.waitForTimeout(5000)

    const baseline = await measure()

    // open quick open for the first time (triggers lazy file index load)
    await page.keyboard.press("ControlOrMeta+p")
    const input = locateQuickOpenInput(page)
    await expect(input).toBeVisible()
    // wait for indexing to complete (options should appear)
    await expect(locateQuickOpenList(page).first()).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(500)

    const afterFirstOpen = await measure()

    // type a search query that matches many files
    await input.pressSequentially("file-0", { delay: 50 })
    await page.waitForTimeout(500)

    const afterSearch = await measure()

    // close quick open
    await page.keyboard.press("Escape")
    await expect(input).not.toBeVisible()
    await page.waitForTimeout(1000)

    const afterClose = await measure()

    // reopen quick open (index should already be cached)
    await page.keyboard.press("ControlOrMeta+p")
    await expect(input).toBeVisible()
    await expect(locateQuickOpenList(page).first()).toBeVisible({ timeout: 5_000 })
    await page.waitForTimeout(500)

    const afterReopen = await measure()

    // search again and select a file
    await input.pressSequentially("file-050", { delay: 50 })
    await expect(locateQuickOpenList(page).first()).toBeVisible()
    await page.keyboard.press("Enter")
    await expect(input).not.toBeVisible()
    await page.waitForTimeout(1000)

    const afterSelect = await measure()

    const results = {
      baseline: { heapUsedMB: baseline.heapUsedMB },
      firstOpen: delta(baseline, afterFirstOpen),
      search: delta(afterFirstOpen, afterSearch),
      close: delta(afterSearch, afterClose),
      reopen: delta(afterClose, afterReopen),
      selectFile: delta(afterReopen, afterSelect),
    }

    console.log("MEMORY_BENCHMARK_RESULTS:" + JSON.stringify(results))

    await cdpSession.send("Performance.disable")
    await cdpSession.send("HeapProfiler.disable")
    await cdpSession.detach()
  })

  test("measure heap usage across python file operations", async ({ electronApp, tempTestDir }) => {
    test.setTimeout(120_000)

    // create 20 synthetic python files with varied content to exercise tree-sitter parsing
    for (let i = 0; i < 20; i++) {
      const fileName = `module_${String(i).padStart(2, "0")}.py`
      const content = generatePythonFile(i)
      fs.writeFileSync(path.join(tempTestDir, fileName), content)
    }

    const page = await electronApp.firstWindow()

    const cdpSession = await electronApp.context().newCDPSession(page)
    await cdpSession.send("HeapProfiler.enable")
    await cdpSession.send("Performance.enable")

    type PyPerfMetrics = PerfMetrics & {
      rendererMemoryMB: number
    }

    const getMetrics = async (): Promise<Record<string, number>> => {
      const { metrics } = (await cdpSession.send("Performance.getMetrics")) as {
        metrics: { name: string; value: number }[]
      }
      return Object.fromEntries(metrics.map((m) => [m.name, m.value]))
    }

    // get renderer process working set size via Electron's app.getAppMetrics().
    // this captures V8 heap, native allocations, and any WASM linear memory (e.g. pglite).
    const getRendererMemoryMB = async (): Promise<number> => {
      const memKB = await electronApp.evaluate(({ app, BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]
        if (!win) return 0
        const rendererPid = win.webContents.getOSProcessId()
        const metrics = app.getAppMetrics()
        const renderer = metrics.find((m) => m.pid === rendererPid)
        return renderer?.memory?.workingSetSize ?? 0 // KB
      })
      return Math.round((memKB / 1024) * 10) / 10
    }

    const measure = async (): Promise<PyPerfMetrics> => {
      await cdpSession.send("HeapProfiler.collectGarbage")
      await page.waitForTimeout(500)
      const { usedSize } = (await cdpSession.send("Runtime.getHeapUsage")) as {
        usedSize: number
      }
      const rendererMemoryMB = await getRendererMemoryMB()
      const m = await getMetrics()
      return {
        heapUsedMB: Math.round((usedSize / 1024 / 1024) * 10) / 10,
        rendererMemoryMB,
        scriptDurationMs: Math.round(m.ScriptDuration * 1000),
        layoutCount: m.LayoutCount,
        recalcStyleCount: m.RecalcStyleCount,
        taskDurationMs: Math.round(m.TaskDuration * 1000),
      }
    }

    const delta = (before: PyPerfMetrics, after: PyPerfMetrics): PyPerfMetrics => ({
      heapUsedMB: after.heapUsedMB,
      rendererMemoryMB: after.rendererMemoryMB,
      scriptDurationMs: after.scriptDurationMs - before.scriptDurationMs,
      layoutCount: after.layoutCount - before.layoutCount,
      recalcStyleCount: after.recalcStyleCount - before.recalcStyleCount,
      taskDurationMs: after.taskDurationMs - before.taskDurationMs,
    })

    await waitForWorkspace(page)
    await page.waitForTimeout(2000)

    const baseline = await measure()

    // open first 10 python files via sidebar clicks, wait for block rendering
    const firstBatch = Array.from(
      { length: 10 },
      (_, i) => `module_${String(i).padStart(2, "0")}.py`,
    )
    for (const fileName of firstBatch) {
      await locateSidebarItem(page, fileName).click()
      // wait for tree-sitter parsing + block rendering to complete
      await page.locator("[data-block-id]").first().waitFor({ timeout: 10_000 })
      await page.waitForTimeout(300)
    }
    await page.waitForTimeout(1000)

    const afterOpenFiles = await measure()

    // close all open tabs
    for (const fileName of [...firstBatch].reverse()) {
      await locateTabCloseButton(page, fileName).click()
      await page.waitForTimeout(100)
    }
    await page.waitForTimeout(1000)

    const afterCloseFiles = await measure()

    // open 10 different python files (tests cleanup after close)
    const secondBatch = Array.from(
      { length: 10 },
      (_, i) => `module_${String(i + 10).padStart(2, "0")}.py`,
    )
    for (const fileName of secondBatch) {
      await locateSidebarItem(page, fileName).click()
      await page.locator("[data-block-id]").first().waitFor({ timeout: 10_000 })
      await page.waitForTimeout(300)
    }
    await page.waitForTimeout(1000)

    const afterReopen = await measure()

    const results = {
      baseline: {
        heapUsedMB: baseline.heapUsedMB,
        rendererMemoryMB: baseline.rendererMemoryMB,
      },
      openFiles: delta(baseline, afterOpenFiles),
      closeFiles: delta(afterOpenFiles, afterCloseFiles),
      reopenFiles: delta(afterCloseFiles, afterReopen),
    }

    console.log("MEMORY_BENCHMARK_RESULTS:" + JSON.stringify(results))

    await cdpSession.send("Performance.disable")
    await cdpSession.send("HeapProfiler.disable")
    await cdpSession.detach()
  })
})

/** generates a synthetic python file with varied block types for tree-sitter parsing */
function generatePythonFile(index: number): string {
  const imports = [
    "import os",
    "import sys",
    "import json",
    "import math",
    "import hashlib",
    "import logging",
    "import itertools",
    "import functools",
    "import collections",
    "import dataclasses",
  ]

  const classNames = [
    "DataProcessor",
    "EventHandler",
    "ConfigManager",
    "TaskRunner",
    "CacheStore",
    "QueryBuilder",
    "NodeVisitor",
    "TokenParser",
    "StreamReader",
    "BufferPool",
    "GraphWalker",
    "SchemaValidator",
    "PipelineStage",
    "WorkerPool",
    "IndexBuilder",
    "MetricCollector",
    "RateLimiter",
    "RetryHandler",
    "BatchWriter",
    "StateManager",
  ]

  const className = classNames[index % classNames.length]
  const imp1 = imports[index % imports.length]
  const imp2 = imports[(index + 3) % imports.length]
  const imp3 = imports[(index + 7) % imports.length]

  return `"""module ${index}: ${className} implementation."""

${imp1}
${imp2}
${imp3}

from typing import Any, Dict, List, Optional


THRESHOLD = ${index * 10 + 42}
MAX_RETRIES = ${(index % 5) + 3}


class ${className}:
    """handles ${className.toLowerCase()} operations."""

    def __init__(self, name: str, capacity: int = ${index + 10}) -> None:
        self.name = name
        self.capacity = capacity
        self._items: List[Any] = []
        self._cache: Dict[str, Any] = {}

    def process(self, data: List[Any]) -> List[Any]:
        """process a list of data items."""
        results = []
        for item in data:
            if self._validate(item):
                transformed = self._transform(item)
                results.append(transformed)
        return results

    def _validate(self, item: Any) -> bool:
        return item is not None and len(self._items) < self.capacity

    def _transform(self, item: Any) -> Any:
        self._items.append(item)
        self._cache[str(item)] = item
        return item


def compute_${className.toLowerCase()}_stats(values: List[float]) -> Dict[str, float]:
    """compute summary statistics for the given values."""
    if not values:
        return {"mean": 0.0, "total": 0.0, "count": 0}
    total = sum(values)
    mean = total / len(values)
    return {"mean": mean, "total": total, "count": len(values)}


def create_${className.toLowerCase()}(name: Optional[str] = None) -> ${className}:
    return ${className}(name=name or "default", capacity=THRESHOLD)


if __name__ == "__main__":
    instance = create_${className.toLowerCase()}()
    data = list(range(${index + 5}))
    result = instance.process(data)
    print(f"processed {len(result)} items")
`
}
