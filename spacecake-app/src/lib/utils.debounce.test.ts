import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { debounce } from "@/lib/utils"

describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  it("schedules and runs once after the delay, resetting on subsequent schedules", () => {
    const fn = vi.fn()
    const d = debounce(fn, 200)

    d.schedule()
    vi.advanceTimersByTime(199)
    expect(fn).not.toHaveBeenCalled()

    // reschedule before it fires; timer resets
    d.schedule()
    vi.advanceTimersByTime(199)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("flush() runs immediately and clears any pending timer", () => {
    const fn = vi.fn()
    const d = debounce(fn, 200)

    d.schedule()
    expect(d.isScheduled()).toBe(true)

    d.flush()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(d.isScheduled()).toBe(false)

    // advancing timers should not call again
    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("cancel() prevents the scheduled run", () => {
    const fn = vi.fn()
    const d = debounce(fn, 200)

    d.schedule()
    expect(d.isScheduled()).toBe(true)
    d.cancel()
    expect(d.isScheduled()).toBe(false)

    vi.advanceTimersByTime(500)
    expect(fn).not.toHaveBeenCalled()
  })

  it("isScheduled() reflects pending state", () => {
    const fn = vi.fn()
    const d = debounce(fn, 200)

    expect(d.isScheduled()).toBe(false)
    d.schedule()
    expect(d.isScheduled()).toBe(true)
    vi.advanceTimersByTime(200)
    expect(d.isScheduled()).toBe(false)
  })
})
