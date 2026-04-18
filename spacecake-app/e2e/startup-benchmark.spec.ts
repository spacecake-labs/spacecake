import { test, waitForWorkspace } from "@/../e2e/fixtures"

type PerfMark = { name: string; startTime: number }
type TimelineEntry = { process: "main" | "renderer"; name: string; absoluteMs: number }

test.describe("startup benchmark", () => {
  test("measure cold startup time", async ({ electronApp }) => {
    test.setTimeout(60_000)

    const page = await electronApp.firstWindow()

    // wait for the workspace to be fully loaded (first meaningful paint)
    await waitForWorkspace(page)

    // mark the moment workspace is ready in the renderer timeline
    await page.evaluate(() => performance.mark("spacecake/workspaceReady"))

    // collect main process marks via evaluate (runs in the main process context).
    // globalThis.performance is the same singleton as perf_hooks.performance in Node 18+.
    const mainData = await electronApp.evaluate(() => ({
      marks: globalThis.performance
        .getEntriesByType("mark")
        .filter((m: PerformanceEntry) => m.name.startsWith("spacecake/"))
        .map((m: PerformanceEntry) => ({ name: m.name, startTime: Math.round(m.startTime) })),
      timeOrigin: globalThis.performance.timeOrigin,
    }))

    // collect renderer marks
    const rendererData = await page.evaluate(() => ({
      marks: performance
        .getEntriesByType("mark")
        .filter((m) => m.name.startsWith("spacecake/"))
        .map((m) => ({ name: m.name, startTime: Math.round(m.startTime) })),
      timeOrigin: performance.timeOrigin,
    }))

    // align everything to main process timeOrigin (= process start)
    const epoch = mainData.timeOrigin

    const timeline: TimelineEntry[] = [
      ...mainData.marks.map((m: PerfMark) => ({
        process: "main" as const,
        name: m.name,
        absoluteMs: Math.round(m.startTime + mainData.timeOrigin - epoch),
      })),
      ...rendererData.marks.map((m: PerfMark) => ({
        process: "renderer" as const,
        name: m.name,
        absoluteMs: Math.round(m.startTime + rendererData.timeOrigin - epoch),
      })),
    ].sort((a, b) => a.absoluteMs - b.absoluteMs)

    // compute phase durations from will/did mark pairs
    const phasePairs: [string, string, string][] = [
      ["spacecake/willFixPath", "spacecake/didFixPath", "fixPath"],
      ["spacecake/willResolveDb", "spacecake/didResolveDb", "resolveDb"],
      ["spacecake/willSetup", "spacecake/didSetup", "setup"],
      ["spacecake/willCreateWindow", "spacecake/didCreateWindow", "createWindow"],
      ["spacecake/willInitDb", "spacecake/didInitDb", "rendererInitDb"],
      ["spacecake/willRender", "spacecake/workspaceReady", "renderToWorkspaceReady"],
    ]

    const phases: Record<string, number> = {}
    for (const [startMark, endMark, label] of phasePairs) {
      const s = timeline.find((t) => t.name === startMark)
      const e = timeline.find((t) => t.name === endMark)
      if (s && e) phases[label] = e.absoluteMs - s.absoluteMs
    }

    // compute high-level summary
    const find = (name: string) => timeline.find((t) => t.name === name)?.absoluteMs ?? 0
    const totalMs = find("spacecake/workspaceReady")
    const mainProcessMs = find("spacecake/didSetup") - find("spacecake/mainModuleEval")
    const rendererMs = find("spacecake/workspaceReady") - find("spacecake/rendererStart")

    // log human-readable timeline
    const shortName = (n: string) => n.replace("spacecake/", "")
    console.log("\n=== startup performance ===\n")
    let prev = 0
    for (const entry of timeline) {
      const delta = entry.absoluteMs - prev
      const deltaStr = prev > 0 && delta > 0 ? ` (+${delta}ms)` : ""
      const proc = entry.process === "main" ? "[main]    " : "[renderer]"
      console.log(
        `  ${proc} ${shortName(entry.name).padEnd(26)} ${String(entry.absoluteMs).padStart(6)}ms${deltaStr}`,
      )
      prev = entry.absoluteMs
    }
    console.log(`\n  --- phases ---`)
    for (const [label, duration] of Object.entries(phases)) {
      console.log(`  ${label.padEnd(30)} ${String(duration).padStart(6)}ms`)
    }
    console.log(`\n  --- summary ---`)
    console.log(`  main process total          ${String(mainProcessMs).padStart(6)}ms`)
    console.log(`  renderer total              ${String(rendererMs).padStart(6)}ms`)
    console.log(`  startup total               ${String(totalMs).padStart(6)}ms\n`)

    const results = {
      totalMs,
      mainProcessMs,
      rendererMs,
      phases,
      timeline: timeline.map((t) => ({
        process: t.process,
        name: shortName(t.name),
        ms: t.absoluteMs,
      })),
    }

    console.log("STARTUP_BENCHMARK_RESULTS:" + JSON.stringify(results))
  })
})
