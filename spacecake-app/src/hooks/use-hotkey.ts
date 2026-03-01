import { useEffect, useRef } from "react"

// --- types ---

interface HotkeyOptions {
  /** use capture phase (default: false = bubble) */
  capture?: boolean
  /** conditionally enable/disable the hotkey (default: true) */
  enabled?: boolean
  /** call preventDefault on the event (default: true) */
  preventDefault?: boolean
  /** call stopPropagation on the event (default: false) */
  stopPropagation?: boolean
  /** guard function — return false to skip the callback */
  guard?: (e: KeyboardEvent) => boolean
}

interface ParsedHotkey {
  ctrl: boolean
  meta: boolean
  alt: boolean
  shift: boolean
  /** lowercase key value (e.g. "s", "tab") */
  key: string | null
  /** event.code match (e.g. "Backquote") — used instead of key when set */
  code: string | null
  /** true when the original string used "mod" (resolved at match time) */
  mod: boolean
}

interface Registration {
  id: number
  callbackRef: React.RefObject<((e: KeyboardEvent) => void) | null>
  options: Required<Omit<HotkeyOptions, "guard">> & { guard?: (e: KeyboardEvent) => boolean }
}

// --- hotkey string parser ---

const isMac = typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.userAgent)

/** map common code aliases to event.code values */
const codeAliases: Record<string, string> = {
  backquote: "Backquote",
  "`": "Backquote",
}

function parseHotkey(hotkey: string): ParsedHotkey {
  const parts = hotkey
    .toLowerCase()
    .split("+")
    .map((p) => p.trim())

  const parsed: ParsedHotkey = {
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
    key: null,
    code: null,
    mod: false,
  }

  for (const part of parts) {
    switch (part) {
      case "mod":
        parsed.mod = true
        break
      case "ctrl":
      case "control":
        parsed.ctrl = true
        break
      case "meta":
      case "cmd":
      case "command":
        parsed.meta = true
        break
      case "alt":
      case "option":
        parsed.alt = true
        break
      case "shift":
        parsed.shift = true
        break
      case "tab":
        parsed.key = "Tab"
        break
      default: {
        // check if this is a code alias (e.g. "`" → "Backquote")
        const alias = codeAliases[part]
        if (alias) {
          parsed.code = alias
        } else {
          parsed.key = part
        }
        break
      }
    }
  }

  return parsed
}

// --- singleton manager ---

class HotkeyManager {
  private nextId = 0
  private captureMap = new Map<string, Registration[]>()
  private bubbleMap = new Map<string, Registration[]>()
  private captureHandler: ((e: KeyboardEvent) => void) | null = null
  private bubbleHandler: ((e: KeyboardEvent) => void) | null = null
  private captureCount = 0
  private bubbleCount = 0

  register(
    hotkey: string,
    callbackRef: React.RefObject<((e: KeyboardEvent) => void) | null>,
    options: HotkeyOptions = {},
  ): () => void {
    const id = this.nextId++
    const parsed = parseHotkey(hotkey)
    const normalizedKey = this.normalizeKey(parsed)
    const capture = options.capture ?? false
    const reg: Registration = {
      id,
      callbackRef,
      options: {
        capture,
        enabled: options.enabled ?? true,
        preventDefault: options.preventDefault ?? true,
        stopPropagation: options.stopPropagation ?? false,
        guard: options.guard,
      },
    }

    const map = capture ? this.captureMap : this.bubbleMap
    const list = map.get(normalizedKey) ?? []
    list.push(reg)
    map.set(normalizedKey, list)

    if (capture) {
      this.captureCount++
      this.ensureCaptureListener()
    } else {
      this.bubbleCount++
      this.ensureBubbleListener()
    }

    return () => {
      const list = map.get(normalizedKey)
      if (!list) return
      const idx = list.findIndex((r) => r.id === id)
      if (idx === -1) return // already removed (e.g. StrictMode double-cleanup)
      list.splice(idx, 1)
      if (list.length === 0) map.delete(normalizedKey)

      if (capture) {
        this.captureCount--
        if (this.captureCount === 0) this.removeCaptureListener()
      } else {
        this.bubbleCount--
        if (this.bubbleCount === 0) this.removeBubbleListener()
      }
    }
  }

  private normalizeKey(parsed: ParsedHotkey): string {
    const parts: string[] = []
    if (parsed.mod) parts.push("mod")
    if (parsed.ctrl) parts.push("ctrl")
    if (parsed.meta) parts.push("meta")
    if (parsed.alt) parts.push("alt")
    if (parsed.shift) parts.push("shift")
    if (parsed.code) parts.push(`code:${parsed.code}`)
    else if (parsed.key) parts.push(parsed.key.toLowerCase())
    return parts.join("+")
  }

  /** build normalized keys from a live keyboard event for map lookup */
  private eventToKeys(e: KeyboardEvent): string[] {
    const keys: string[] = []
    const keyLower = e.key.toLowerCase()
    const codeVariant = `code:${e.code}`

    // mod variant — "mod" absorbs the platform modifier (meta on mac, ctrl elsewhere),
    // so only add modifiers that aren't already represented by "mod"
    const isModPressed = isMac ? e.metaKey : e.ctrlKey
    if (isModPressed) {
      const modParts: string[] = ["mod"]
      // on macOS mod=meta, so ctrl is an extra modifier; on other platforms mod=ctrl, so meta is extra
      if (isMac && e.ctrlKey) modParts.push("ctrl")
      if (!isMac && e.metaKey) modParts.push("meta")
      if (e.altKey) modParts.push("alt")
      if (e.shiftKey) modParts.push("shift")
      const modPrefix = modParts.join("+") + "+"
      keys.push(modPrefix + keyLower)
      keys.push(modPrefix + codeVariant)
    }

    // explicit-modifier variant (matches hotkeys registered with literal "ctrl", "meta", etc.)
    const explicitParts: string[] = []
    if (e.ctrlKey) explicitParts.push("ctrl")
    if (e.metaKey) explicitParts.push("meta")
    if (e.altKey) explicitParts.push("alt")
    if (e.shiftKey) explicitParts.push("shift")
    const explicitPrefix = explicitParts.length > 0 ? explicitParts.join("+") + "+" : ""
    keys.push(explicitPrefix + keyLower)
    keys.push(explicitPrefix + codeVariant)

    return keys
  }

  private handleEvent(map: Map<string, Registration[]>, e: KeyboardEvent) {
    const possibleKeys = this.eventToKeys(e)
    for (const key of possibleKeys) {
      const regs = map.get(key)
      if (!regs) continue
      for (const reg of regs) {
        if (!reg.options.enabled) continue
        if (reg.options.guard && !reg.options.guard(e)) continue
        if (reg.options.preventDefault) e.preventDefault()
        if (reg.options.stopPropagation) e.stopPropagation()
        reg.callbackRef.current?.(e)
      }
    }
  }

  private ensureCaptureListener() {
    if (this.captureHandler) return
    this.captureHandler = (e: KeyboardEvent) => this.handleEvent(this.captureMap, e)
    window.addEventListener("keydown", this.captureHandler, true)
  }

  private removeCaptureListener() {
    if (!this.captureHandler) return
    window.removeEventListener("keydown", this.captureHandler, true)
    this.captureHandler = null
  }

  private ensureBubbleListener() {
    if (this.bubbleHandler) return
    this.bubbleHandler = (e: KeyboardEvent) => this.handleEvent(this.bubbleMap, e)
    window.addEventListener("keydown", this.bubbleHandler)
  }

  private removeBubbleListener() {
    if (!this.bubbleHandler) return
    window.removeEventListener("keydown", this.bubbleHandler)
    this.bubbleHandler = null
  }
}

const manager = new HotkeyManager()

// --- react hook ---

export function useHotkey(
  hotkey: string,
  callback: (e: KeyboardEvent) => void,
  options: HotkeyOptions = {},
) {
  const callbackRef = useRef<((e: KeyboardEvent) => void) | null>(callback)
  callbackRef.current = callback

  // store guard in a ref so inline arrow guards don't cause re-registration
  const guardRef = useRef(options.guard)
  guardRef.current = options.guard

  const enabled = options.enabled ?? true

  useEffect(() => {
    if (!enabled) return

    // wrap the guard option with the ref so the manager always calls the latest guard
    const stableOptions: HotkeyOptions = {
      ...options,
      guard: options.guard ? (e) => guardRef.current!(e) : undefined,
    }

    return manager.register(hotkey, callbackRef, stableOptions)
    // guard is stored in a ref above — excluded from deps intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotkey, enabled, options.capture, options.preventDefault, options.stopPropagation])
}
