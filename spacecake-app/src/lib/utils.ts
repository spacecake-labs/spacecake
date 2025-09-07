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

export function parentFolderName(
  filePath: string,
  workspacePath: string,
  fileName: string
): string {
  const relativePath = filePath.replace(`${workspacePath}/`, "")
  return relativePath.replace(fileName, "").replace(/\/$/, "")
}

/**
 * Condenses a file or folder path by showing the last two levels and an ellipsis.
 * This approach is often the most useful in a UI, as it provides the most
 * relevant context (the file/folder and its immediate parent).
 *
 * It handles both forward and backward slashes.
 *
 * Examples:
 * "C:/Users/username/Documents/project/file.txt"  -> ".../project/file.txt"
 * "/home/user/my_folder/app"                      -> ".../my_folder/app"
 *
 * @param path The full path string to condense.
 * @returns The condensed path string, or the original path if it's too short.
 */
export const condensePath = (path: string): string => {
  // Split the path by either forward or backward slash.
  // Filter out any empty strings that might result from leading/trailing slashes.
  const parts = path.split(/[/\\]/).filter((part) => part.length > 0)

  // If the path has 2 or fewer parts, there's no need to condense it.
  if (parts.length <= 2) {
    return path
  }

  // Get the last two parts of the path.
  const lastTwo = parts.slice(-2)

  // Determine the original separator to maintain consistency.
  const separator = path.includes("/") ? "/" : "\\"

  // Join the last two parts with the separator and prepend the ellipsis.
  return `...${separator}${lastTwo.join(separator)}`
}

// Example usage:
const testPath1 = "C:\\Users\\username\\Documents\\project\\data\\file.txt"
const testPath2 = "/home/user/documents/my_project/app_code.js"
const testPath3 = "C:/Program Files/app.exe"
const testPath4 = "/var/log/nginx"
const testPath5 = "Users/document.txt"

console.log(`Path: "${testPath1}" -> Condensed: "${condensePath(testPath1)}"`)
console.log(`Path: "${testPath2}" -> Condensed: "${condensePath(testPath2)}"`)
console.log(`Path: "${testPath3}" -> Condensed: "${condensePath(testPath3)}"`)
console.log(`Path: "${testPath4}" -> Condensed: "${condensePath(testPath4)}"`)
console.log(`Path: "${testPath5}" -> Condensed: "${condensePath(testPath5)}"`)
