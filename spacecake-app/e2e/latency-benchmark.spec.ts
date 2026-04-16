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
    // note: python files are benchmarked separately below to isolate rich-mode latency
    const testFiles = [
      { name: "app.ts", language: "typescript", content: generateTypeScriptFile() },
      { name: "utils.ts", language: "typescript", content: generateTypeScriptFile() },
      { name: "handler.js", language: "javascript", content: generateJavaScriptFile() },
      { name: "parser.js", language: "javascript", content: generateJavaScriptFile() },
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

  test("measure file open latency for rich mode python files", async ({
    electronApp,
    tempTestDir,
  }) => {
    test.setTimeout(120_000)

    // python files open in source by default; this test toggles each to rich
    // and measures the full click → toggle → block-parse latency users see when
    // they want rich mode.
    const testFiles = [
      { name: "module_a.py", content: generateLargePythonFile(0) },
      { name: "module_b.py", content: generateLargePythonFile(1) },
      { name: "module_c.py", content: generateLargePythonFile(2) },
      { name: "module_d.py", content: generateLargePythonFile(3) },
      { name: "module_e.py", content: generateLargePythonFile(4) },
      { name: "module_f.py", content: generateLargePythonFile(5) },
    ]

    for (const file of testFiles) {
      fs.writeFileSync(path.join(tempTestDir, file.name), file.content)
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

    type RichFileResult = { file: string; latencyMs: number; metrics: PerfMetrics }
    const results: RichFileResult[] = []

    for (const file of testFiles) {
      const before = await measure()
      const t0 = await page.evaluate(() => performance.now())

      await locateSidebarItem(page, file.name).click()
      // python opens in source by default; toggle to rich to trigger block parsing
      await page.getByRole("link", { name: "switch to rich view" }).click()

      // wait for at least one block node to appear (indicates rich mode parsing completed)
      await page.waitForFunction(() => document.querySelector("[data-block-id]") !== null, {
        timeout: 15_000,
      })

      const t1 = await page.evaluate(() => performance.now())
      const after = await measure()

      results.push({
        file: file.name,
        latencyMs: Math.round(t1 - t0),
        metrics: delta(before, after),
      })

      await page.waitForTimeout(200)
    }

    const avg = (arr: RichFileResult[]) =>
      arr.length > 0 ? Math.round(arr.reduce((sum, r) => sum + r.latencyMs, 0) / arr.length) : 0

    const output = {
      files: results,
      summary: {
        firstOpenMs: results[0]?.latencyMs ?? 0,
        avgMs: avg(results),
        minMs: Math.min(...results.map((r) => r.latencyMs)),
        maxMs: Math.max(...results.map((r) => r.latencyMs)),
      },
    }

    console.log("RICH_MODE_LATENCY_RESULTS:" + JSON.stringify(output))

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

function generateJavaScriptFile(): string {
  const lines: string[] = [
    'const EventEmitter = require("events")',
    "",
    "class AppService extends EventEmitter {",
    "  constructor(config = {}) {",
    "    super()",
    "    this.host = config.host ?? 'localhost'",
    "    this.port = config.port ?? 3000",
    "    this.connections = new Map()",
    "  }",
    "",
    "  async start() {",
    "    console.log(`starting on ${this.host}:${this.port}`)",
    "    this.emit('start')",
    "  }",
    "",
    "  getStatus() {",
    "    return this.connections.size > 0 ? 'active' : 'idle'",
    "  }",
    "",
    "  stop() {",
    "    this.connections.clear()",
    "    this.emit('stop')",
    "  }",
    "}",
    "",
    "module.exports = { AppService }",
    "",
  ]

  for (let i = 0; i < 70; i++) {
    lines.push(`// placeholder line ${i}`)
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

/** generates a ~1000 line python file with realistic structure for tree-sitter parsing */
function generateLargePythonFile(seed: number): string {
  const classNames = [
    "DataProcessor",
    "EventHandler",
    "ConfigManager",
    "TaskRunner",
    "CacheStore",
    "QueryBuilder",
  ]
  const cls = (i: number) => classNames[(seed + i) % classNames.length]

  const method = (name: string, idx: number) => [
    `    def ${name}_${idx}(self, value: Any, flag: bool = False) -> Optional[Any]:`,
    `        """handle ${name} operation ${idx}."""`,
    `        if value is None:`,
    `            return None`,
    `        result = self._cache.get(str(value))`,
    `        if result is not None and not flag:`,
    `            return result`,
    `        processed = self._transform_${idx}(value)`,
    `        self._cache[str(value)] = processed`,
    `        self._items.append(processed)`,
    `        return processed`,
    ``,
    `    def _transform_${idx}(self, value: Any) -> Any:`,
    `        if isinstance(value, (int, float)):`,
    `            return value * ${idx + 1}`,
    `        if isinstance(value, str):`,
    `            return value.upper()`,
    `        return value`,
    ``,
  ]

  const makeClass = (i: number, methodCount: number) => {
    const name = cls(i)
    const lines: string[] = [
      ``,
      ``,
      `class ${name}${i}:`,
      `    """${name.toLowerCase()} implementation variant ${i}."""`,
      ``,
      `    def __init__(self, capacity: int = ${(seed + i) * 10 + 50}) -> None:`,
      `        self.capacity = capacity`,
      `        self._items: List[Any] = []`,
      `        self._cache: Dict[str, Any] = {}`,
      `        self._count: int = 0`,
      ``,
      `    def process(self, data: List[Any]) -> List[Any]:`,
      `        """process items."""`,
      `        return [self.handle_${i % 4}(x, idx % 2 == 0) for idx, x in enumerate(data) if x is not None]`,
      ``,
      `    def batch(self, items: List[Any], chunk_size: int = 10) -> List[List[Any]]:`,
      `        """split items into chunks."""`,
      `        return [items[j:j+chunk_size] for j in range(0, len(items), chunk_size)]`,
      ``,
    ]
    for (let m = 0; m < methodCount; m++) {
      lines.push(...method(`handle`, m + i * methodCount))
    }
    lines.push(`    def __repr__(self) -> str:`)
    lines.push(`        return f"${name}${i}(capacity={self.capacity}, items={len(self._items)})"`)
    lines.push(``)
    return lines
  }

  const header = [
    `"""module ${seed}: auto-generated ~1000 line python file for latency benchmarking."""`,
    ``,
    `import os`,
    `import sys`,
    `import json`,
    `import math`,
    `import hashlib`,
    `import logging`,
    `from typing import Any, Dict, List, Optional, Tuple`,
    `from dataclasses import dataclass, field`,
    ``,
    `logger = logging.getLogger(__name__)`,
    ``,
    `THRESHOLD = ${seed * 10 + 100}`,
    `MAX_RETRIES = ${(seed % 5) + 3}`,
    `DEFAULT_CAPACITY = ${seed * 5 + 50}`,
    ``,
    ``,
    `@dataclass`,
    `class Config:`,
    `    """configuration for processing."""`,
    `    capacity: int = DEFAULT_CAPACITY`,
    `    threshold: int = THRESHOLD`,
    `    retries: int = MAX_RETRIES`,
    `    debug: bool = False`,
    `    tags: List[str] = field(default_factory=list)`,
    ``,
    `    def validate(self) -> bool:`,
    `        return self.capacity > 0 and self.threshold > 0`,
    ``,
    `    def to_dict(self) -> Dict[str, Any]:`,
    `        return {"capacity": self.capacity, "threshold": self.threshold, "debug": self.debug}`,
    ``,
  ]

  const footer = [
    ``,
    ``,
    `def compute_stats(values: List[float]) -> Dict[str, float]:`,
    `    """compute summary statistics."""`,
    `    if not values:`,
    `        return {"mean": 0.0, "total": 0.0, "count": 0, "min": 0.0, "max": 0.0}`,
    `    total = sum(values)`,
    `    return {"mean": total / len(values), "total": total, "count": len(values), "min": min(values), "max": max(values)}`,
    ``,
    ``,
    `def create_processor(config: Optional[Config] = None) -> "${cls(0)}0":`,
    `    cfg = config or Config()`,
    `    return ${cls(0)}0(capacity=cfg.capacity)`,
    ``,
    ``,
    `if __name__ == "__main__":`,
    `    cfg = Config(capacity=${seed + 10}, debug=True)`,
    `    proc = create_processor(cfg)`,
    `    data: List[Any] = list(range(${seed + 20}))`,
    `    result = proc.process(data)`,
    `    stats = compute_stats([float(x) for x in result if isinstance(x, (int, float))])`,
    `    logger.info("processed %d items: %s", len(result), stats)`,
    `    print(json.dumps(stats, indent=2))`,
  ]

  const lines: string[] = [...header]

  // add classes until we're close to 1000 lines
  // header ~35 lines, footer ~20 lines, each class with 4 methods ~45 lines → need ~21 classes
  for (let i = 0; i < 21; i++) {
    lines.push(...makeClass(i, 4))
  }

  lines.push(...footer)
  return lines.join("\n")
}
