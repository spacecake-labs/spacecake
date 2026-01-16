import {
  Clipboard,
  ClipboardError,
  make as makeClipboard,
} from "@effect/platform-browser/Clipboard"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"

import { handleImagePaste, hasImageInClipboard } from "@/lib/clipboard"
import { TerminalWriter } from "@/lib/terminal-writer"

const makeTestClipboardLayer = (items: ClipboardItems) =>
  Layer.succeed(
    Clipboard,
    makeClipboard({
      read: Effect.succeed(items),
      readString: Effect.succeed(""),
      write: () => Effect.void,
      writeString: () => Effect.void,
    })
  )

const makeFailingClipboardLayer = () =>
  Layer.succeed(
    Clipboard,
    makeClipboard({
      read: Effect.fail(
        new ClipboardError({ message: "Permission denied", cause: null })
      ),
      readString: Effect.fail(
        new ClipboardError({ message: "Permission denied", cause: null })
      ),
      write: () => Effect.void,
      writeString: () => Effect.void,
    })
  )

const makeTestTerminalWriterLayer = (
  writes: Array<{ id: string; data: string }>
) =>
  Layer.succeed(TerminalWriter, {
    write: (id, data) =>
      Effect.sync(() => {
        writes.push({ id, data })
      }),
  })

describe("clipboard", () => {
  describe("hasImageInClipboard", () => {
    it("returns true when clipboard contains an image", async () => {
      const imageBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
        type: "image/png",
      })
      const imageItem = new ClipboardItem({ "image/png": imageBlob })
      const layer = makeTestClipboardLayer([imageItem])

      const result = await Effect.runPromise(
        hasImageInClipboard.pipe(Effect.provide(layer))
      )

      expect(result).toBe(true)
    })

    it("returns true for different image types", async () => {
      const jpegBlob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
        type: "image/jpeg",
      })
      const jpegItem = new ClipboardItem({ "image/jpeg": jpegBlob })
      const layer = makeTestClipboardLayer([jpegItem])

      const result = await Effect.runPromise(
        hasImageInClipboard.pipe(Effect.provide(layer))
      )

      expect(result).toBe(true)
    })

    it("returns false when clipboard contains only text", async () => {
      const textBlob = new Blob(["hello world"], { type: "text/plain" })
      const textItem = new ClipboardItem({ "text/plain": textBlob })
      const layer = makeTestClipboardLayer([textItem])

      const result = await Effect.runPromise(
        hasImageInClipboard.pipe(Effect.provide(layer))
      )

      expect(result).toBe(false)
    })

    it("returns false when clipboard is empty", async () => {
      const layer = makeTestClipboardLayer([])

      const result = await Effect.runPromise(
        hasImageInClipboard.pipe(Effect.provide(layer))
      )

      expect(result).toBe(false)
    })

    it("returns false when clipboard read fails", async () => {
      const layer = makeFailingClipboardLayer()

      const result = await Effect.runPromise(
        hasImageInClipboard.pipe(Effect.provide(layer))
      )

      expect(result).toBe(false)
    })

    it("returns true when clipboard contains both image and text", async () => {
      const imageBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
        type: "image/png",
      })
      const mixedItem = new ClipboardItem({
        "image/png": imageBlob,
        "text/plain": new Blob(["alt text"], { type: "text/plain" }),
      })
      const layer = makeTestClipboardLayer([mixedItem])

      const result = await Effect.runPromise(
        hasImageInClipboard.pipe(Effect.provide(layer))
      )

      expect(result).toBe(true)
    })
  })

  describe("handleImagePaste", () => {
    it("writes Ctrl+V to terminal when clipboard has image", async () => {
      const writes: Array<{ id: string; data: string }> = []
      const imageBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
        type: "image/png",
      })
      const imageItem = new ClipboardItem({ "image/png": imageBlob })
      const layer = Layer.mergeAll(
        makeTestClipboardLayer([imageItem]),
        makeTestTerminalWriterLayer(writes)
      )

      const result = await Effect.runPromise(
        handleImagePaste("terminal-1").pipe(Effect.provide(layer))
      )

      expect(result).toBe(true)
      expect(writes).toEqual([{ id: "terminal-1", data: "\x16" }])
    })

    it("does not write to terminal when clipboard has no image", async () => {
      const writes: Array<{ id: string; data: string }> = []
      const textBlob = new Blob(["hello"], { type: "text/plain" })
      const textItem = new ClipboardItem({ "text/plain": textBlob })
      const layer = Layer.mergeAll(
        makeTestClipboardLayer([textItem]),
        makeTestTerminalWriterLayer(writes)
      )

      const result = await Effect.runPromise(
        handleImagePaste("terminal-1").pipe(Effect.provide(layer))
      )

      expect(result).toBe(false)
      expect(writes).toEqual([])
    })

    it("does not write to terminal when clipboard is empty", async () => {
      const writes: Array<{ id: string; data: string }> = []
      const layer = Layer.mergeAll(
        makeTestClipboardLayer([]),
        makeTestTerminalWriterLayer(writes)
      )

      const result = await Effect.runPromise(
        handleImagePaste("terminal-1").pipe(Effect.provide(layer))
      )

      expect(result).toBe(false)
      expect(writes).toEqual([])
    })

    it("does not write to terminal when clipboard read fails", async () => {
      const writes: Array<{ id: string; data: string }> = []
      const layer = Layer.mergeAll(
        makeFailingClipboardLayer(),
        makeTestTerminalWriterLayer(writes)
      )

      const result = await Effect.runPromise(
        handleImagePaste("terminal-1").pipe(Effect.provide(layer))
      )

      expect(result).toBe(false)
      expect(writes).toEqual([])
    })

    it("writes to correct terminal id", async () => {
      const writes: Array<{ id: string; data: string }> = []
      const imageBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
        type: "image/png",
      })
      const imageItem = new ClipboardItem({ "image/png": imageBlob })
      const layer = Layer.mergeAll(
        makeTestClipboardLayer([imageItem]),
        makeTestTerminalWriterLayer(writes)
      )

      await Effect.runPromise(
        handleImagePaste("my-custom-terminal-id").pipe(Effect.provide(layer))
      )

      expect(writes).toEqual([{ id: "my-custom-terminal-id", data: "\x16" }])
    })
  })
})
