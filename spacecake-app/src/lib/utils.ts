import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// safe base64url encoding/decoding for ids in routes
export function encodeBase64Url(value: string): string {
  // prefer web apis in renderer
  if (typeof btoa === "function") {
    const bytes = new TextEncoder().encode(value)
    let binary = ""
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    const base64 = btoa(binary)
    return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
  }
  // fallback to node buffer in non-browser contexts
  const base64 = Buffer.from(value, "utf-8").toString("base64")
  return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

export function decodeBase64Url(value: string): string {
  const padLength = (4 - (value.length % 4)) % 4
  const padded = value + "=".repeat(padLength)
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/")
  if (typeof atob === "function") {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  }
  return Buffer.from(base64, "base64").toString("utf-8")
}

// simple trailing debounce helper for void callbacks
export function debounce(fn: () => void, waitMs: number) {
  let timerId: ReturnType<typeof setTimeout> | null = null

  const schedule = () => {
    if (timerId !== null) {
      clearTimeout(timerId)
    }
    timerId = setTimeout(() => {
      timerId = null
      fn()
    }, waitMs)
  }

  const flush = () => {
    if (timerId !== null) {
      clearTimeout(timerId)
      timerId = null
    }
    fn()
  }

  const cancel = () => {
    if (timerId !== null) {
      clearTimeout(timerId)
      timerId = null
    }
  }

  const isScheduled = () => timerId !== null

  return { schedule, flush, cancel, isScheduled }
}
