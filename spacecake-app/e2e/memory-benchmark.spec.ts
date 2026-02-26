import fs from "fs"
import path from "path"

import { test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem, locateTabCloseButton } from "@/../e2e/utils"

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
})
