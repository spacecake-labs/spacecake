import fs from "fs"
import path from "path"

import { test, waitForWorkspace } from "@/../e2e/fixtures"
import { locateSidebarItem } from "@/../e2e/utils"

type PerfMetrics = {
  heapUsedMB: number
  scriptDurationMs: number
  layoutCount: number
  recalcStyleCount: number
  taskDurationMs: number
}

type FileOpenResult = {
  file: string
  language: string
  latencyMs: number
  metrics: PerfMetrics
}

test.describe("latency benchmark", () => {
  test("measure file open latency for source mode files", async ({ electronApp, tempTestDir }) => {
    test.setTimeout(120_000)

    // create source-mode test files with ~100 lines each
    const testFiles = [
      { name: "app.ts", language: "typescript", content: generateTypeScriptFile() },
      { name: "utils.ts", language: "typescript", content: generateTypeScriptFile() },
      { name: "handler.py", language: "python", content: generatePythonFile() },
      { name: "parser.py", language: "python", content: generatePythonFile() },
      { name: "config.json", language: "json", content: generateJsonFile() },
      { name: "data.json", language: "json", content: generateJsonFile() },
      { name: "styles.css", language: "css", content: generateCssFile() },
      { name: "theme.css", language: "css", content: generateCssFile() },
      { name: "index.tsx", language: "tsx", content: generateTsxFile() },
      { name: "page.tsx", language: "tsx", content: generateTsxFile() },
    ]

    for (const file of testFiles) {
      fs.writeFileSync(path.join(tempTestDir, file.name), file.content)
    }

    const page = await electronApp.firstWindow()

    // open CDP session for performance metrics
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
    await page.waitForTimeout(2000)

    const results: FileOpenResult[] = []

    for (const file of testFiles) {
      const before = await measure()

      // record wall-clock start time inside the renderer
      const t0 = await page.evaluate(() => performance.now())

      // click the file in the sidebar
      await locateSidebarItem(page, file.name).click()

      // wait for codemirror content to be visible and non-empty
      await page.waitForFunction(
        () => {
          const el = document.querySelector(".cm-content")
          return el && el.textContent && el.textContent.trim().length > 0
        },
        { timeout: 10_000 },
      )

      // record wall-clock end time
      const t1 = await page.evaluate(() => performance.now())

      const after = await measure()

      results.push({
        file: file.name,
        language: file.language,
        latencyMs: Math.round(t1 - t0),
        metrics: delta(before, after),
      })

      // small pause between files to let things settle
      await page.waitForTimeout(200)
    }

    // split into first-open per language (cold cache) and subsequent (warm cache)
    const seenLanguages = new Set<string>()
    const coldOpens: FileOpenResult[] = []
    const warmOpens: FileOpenResult[] = []

    for (const r of results) {
      if (seenLanguages.has(r.language)) {
        warmOpens.push(r)
      } else {
        coldOpens.push(r)
        seenLanguages.add(r.language)
      }
    }

    const avg = (arr: FileOpenResult[]) =>
      arr.length > 0 ? Math.round(arr.reduce((sum, r) => sum + r.latencyMs, 0) / arr.length) : 0

    const output = {
      files: results,
      summary: {
        coldAvgMs: avg(coldOpens),
        warmAvgMs: avg(warmOpens),
        overallAvgMs: avg(results),
        coldCount: coldOpens.length,
        warmCount: warmOpens.length,
      },
    }

    console.log("FILE_OPEN_LATENCY_RESULTS:" + JSON.stringify(output))

    await cdpSession.send("Performance.disable")
    await cdpSession.send("HeapProfiler.disable")
    await cdpSession.detach()
  })
})

function generateTypeScriptFile(): string {
  const lines: string[] = [
    'import { Effect } from "effect"',
    "",
    "interface Config {",
    "  host: string",
    "  port: number",
    "  debug: boolean",
    "}",
    "",
    "const DEFAULT_CONFIG: Config = {",
    '  host: "localhost",',
    "  port: 3000,",
    "  debug: false,",
    "}",
    "",
    "export class AppService {",
    "  private config: Config",
    "  private connections: Map<string, number>",
    "",
    "  constructor(config: Partial<Config> = {}) {",
    "    this.config = { ...DEFAULT_CONFIG, ...config }",
    "    this.connections = new Map()",
    "  }",
    "",
    "  async start(): Promise<void> {",
    "    console.log(`starting on ${this.config.host}:${this.config.port}`)",
    "  }",
    "",
    "  getStatus(): string {",
    '    return this.connections.size > 0 ? "active" : "idle"',
    "  }",
    "",
  ]

  // pad to ~100 lines
  for (let i = 0; i < 70; i++) {
    lines.push(`  // placeholder line ${i}`)
  }
  lines.push("}")

  return lines.join("\n")
}

function generatePythonFile(): string {
  const lines: string[] = [
    "import os",
    "import sys",
    "import json",
    "from typing import Any, Dict, List, Optional",
    "",
    "",
    "class DataProcessor:",
    '    """handles data processing operations."""',
    "",
    "    def __init__(self, name: str, capacity: int = 100) -> None:",
    "        self.name = name",
    "        self.capacity = capacity",
    "        self._items: List[Any] = []",
    "        self._cache: Dict[str, Any] = {}",
    "",
    "    def process(self, data: List[Any]) -> List[Any]:",
    '        """process a list of data items."""',
    "        results = []",
    "        for item in data:",
    "            if self._validate(item):",
    "                transformed = self._transform(item)",
    "                results.append(transformed)",
    "        return results",
    "",
    "    def _validate(self, item: Any) -> bool:",
    "        return item is not None and len(self._items) < self.capacity",
    "",
    "    def _transform(self, item: Any) -> Any:",
    "        self._items.append(item)",
    "        self._cache[str(item)] = item",
    "        return item",
    "",
    "",
  ]

  for (let i = 0; i < 67; i++) {
    lines.push(`# placeholder line ${i}`)
  }

  return lines.join("\n")
}

function generateJsonFile(): string {
  const items: string[] = []
  for (let i = 0; i < 50; i++) {
    items.push(
      `    { "id": ${i}, "name": "item-${i}", "value": ${Math.random().toFixed(4)}, "active": ${i % 2 === 0} }`,
    )
  }
  return `{\n  "version": "1.0.0",\n  "items": [\n${items.join(",\n")}\n  ]\n}`
}

function generateCssFile(): string {
  const lines: string[] = [":root {", "  --bg: #ffffff;", "  --fg: #000000;", "}", ""]

  const selectors = [
    "body",
    ".container",
    ".header",
    ".nav",
    ".sidebar",
    ".content",
    ".footer",
    ".card",
    ".button",
    ".input",
    ".modal",
    ".tooltip",
    ".dropdown",
    ".badge",
    ".alert",
    ".table",
    ".form",
    ".grid",
    ".flex",
    ".stack",
  ]

  for (const sel of selectors) {
    lines.push(`${sel} {`)
    lines.push("  display: flex;")
    lines.push("  padding: 1rem;")
    lines.push("  margin: 0;")
    lines.push("}")
    lines.push("")
  }

  return lines.join("\n")
}

function generateTsxFile(): string {
  const lines: string[] = [
    'import React from "react"',
    "",
    "interface Props {",
    "  title: string",
    "  count: number",
    "  onIncrement: () => void",
    "}",
    "",
    "export function Counter({ title, count, onIncrement }: Props) {",
    "  return (",
    '    <div className="counter">',
    '      <h2 className="title">{title}</h2>',
    '      <span className="count">{count}</span>',
    "      <button onClick={onIncrement}>increment</button>",
    "    </div>",
    "  )",
    "}",
    "",
  ]

  for (let i = 0; i < 82; i++) {
    lines.push(`// placeholder line ${i}`)
  }

  return lines.join("\n")
}
