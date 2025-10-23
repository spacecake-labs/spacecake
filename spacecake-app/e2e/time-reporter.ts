import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter"

class TimeReporter implements Reporter {
  onTestEnd(_test: TestCase, result: TestResult) {
    const duration = (result.duration / 1000).toFixed(2)
    console.log(`\t⏳ \x1b[32m${duration}s\x1b[0m`)
  }

  onEnd(result: FullResult) {
    const duration = (result.duration / 1000).toFixed(2)
    console.log(`\ttotal ⌛ \x1b[32m${duration}s\x1b[0m`)
  }
}

export default TimeReporter

export { TimeReporter }
