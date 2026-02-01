import { Clipboard, layer as ClipboardLayer } from "@effect/platform-browser/Clipboard"
import { Effect, Layer } from "effect"

import { TerminalWriter, TerminalWriterLive } from "@/lib/terminal-writer"

/**
 * Check if the clipboard contains an image.
 * Returns false if clipboard read fails or no image is present.
 */
export const hasImageInClipboard = Effect.gen(function* () {
  const clipboard = yield* Clipboard
  const items = yield* clipboard.read
  return Array.from(items).some((item) => item.types.some((t) => t.startsWith("image/")))
}).pipe(Effect.catchAll(() => Effect.succeed(false)))

/**
 * Handle image paste: check clipboard for image, write Ctrl+V to terminal if found.
 * Returns true if an image was detected and the paste signal was sent.
 */
export const handleImagePaste = (terminalId: string) =>
  Effect.gen(function* () {
    const hasImage = yield* hasImageInClipboard
    if (hasImage) {
      const writer = yield* TerminalWriter
      // Send Ctrl+V (0x16) to PTY - Claude Code will read clipboard directly
      yield* writer.write(terminalId, "\x16")
    }
    return hasImage
  })

/**
 * Live layer for terminal clipboard operations.
 * Composed once at module level for use in the renderer.
 */
export const TerminalClipboardLive = Layer.mergeAll(ClipboardLayer, TerminalWriterLive)
