import { Match, Schema } from "effect"
import { describe, expect, test } from "vitest"

import {
  WorkspaceError,
  WorkspaceErrorSchema,
  WorkspaceNotAccessible,
  WorkspaceNotFound,
} from "@/types/workspace-error"

describe("WorkspaceError tagged classes", () => {
  describe("WorkspaceNotFound", () => {
    test("creates instance with correct _tag", () => {
      const error = new WorkspaceNotFound({ path: "/test/path" })
      expect(error._tag).toBe("WorkspaceNotFound")
      expect(error.path).toBe("/test/path")
    })

    test("is matched by Match.tag", () => {
      const error: WorkspaceError = new WorkspaceNotFound({
        path: "/test/path",
      })
      const result = Match.value(error).pipe(
        Match.tag("WorkspaceNotFound", (e) => `not found: ${e.path}`),
        Match.orElse(() => "other"),
      )
      expect(result).toBe("not found: /test/path")
    })
  })

  describe("WorkspaceNotAccessible", () => {
    test("creates instance with correct _tag", () => {
      const error = new WorkspaceNotAccessible({ path: "/protected/path" })
      expect(error._tag).toBe("WorkspaceNotAccessible")
      expect(error.path).toBe("/protected/path")
    })

    test("is matched by Match.tag", () => {
      const error: WorkspaceError = new WorkspaceNotAccessible({
        path: "/protected/path",
      })
      const result = Match.value(error).pipe(
        Match.tag("WorkspaceNotAccessible", (e) => `not accessible: ${e.path}`),
        Match.orElse(() => "other"),
      )
      expect(result).toBe("not accessible: /protected/path")
    })
  })

  describe("WorkspaceErrorSchema", () => {
    test("encodes WorkspaceNotFound", () => {
      const error = new WorkspaceNotFound({ path: "/test/path" })
      const encoded = Schema.encodeSync(WorkspaceErrorSchema)(error)
      expect(encoded).toEqual({
        _tag: "WorkspaceNotFound",
        path: "/test/path",
      })
    })

    test("encodes WorkspaceNotAccessible", () => {
      const error = new WorkspaceNotAccessible({ path: "/protected/path" })
      const encoded = Schema.encodeSync(WorkspaceErrorSchema)(error)
      expect(encoded).toEqual({
        _tag: "WorkspaceNotAccessible",
        path: "/protected/path",
      })
    })

    test("decodes WorkspaceNotFound", () => {
      const decoded = Schema.decodeSync(WorkspaceErrorSchema)({
        _tag: "WorkspaceNotFound",
        path: "/test/path",
      })
      expect(decoded).toBeInstanceOf(WorkspaceNotFound)
      expect(decoded.path).toBe("/test/path")
    })

    test("decodes WorkspaceNotAccessible", () => {
      const decoded = Schema.decodeSync(WorkspaceErrorSchema)({
        _tag: "WorkspaceNotAccessible",
        path: "/protected/path",
      })
      expect(decoded).toBeInstanceOf(WorkspaceNotAccessible)
      expect(decoded.path).toBe("/protected/path")
    })

    test("fails to decode unknown tag", () => {
      const invalidInput: unknown = {
        _tag: "UnknownError",
        path: "/test/path",
      }
      expect(() => Schema.decodeUnknownSync(WorkspaceErrorSchema)(invalidInput)).toThrow()
    })

    test("fails to decode invalid structure", () => {
      const invalidInput: unknown = {
        _tag: "WorkspaceNotFound",
        // missing path
      }
      expect(() => Schema.decodeUnknownSync(WorkspaceErrorSchema)(invalidInput)).toThrow()
    })
  })

  describe("type-safe pattern matching", () => {
    test("multiple Match.tag calls work correctly", () => {
      const handleError = (error: WorkspaceError): string =>
        Match.value(error).pipe(
          Match.tag("WorkspaceNotFound", () => "not found"),
          Match.tag("WorkspaceNotAccessible", () => "not accessible"),
          Match.orElse(() => "unknown"),
        )

      expect(handleError(new WorkspaceNotFound({ path: "/a" }))).toBe("not found")
      expect(handleError(new WorkspaceNotAccessible({ path: "/b" }))).toBe("not accessible")
    })
  })
})
