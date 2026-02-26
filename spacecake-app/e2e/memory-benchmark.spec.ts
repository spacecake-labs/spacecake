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
})
