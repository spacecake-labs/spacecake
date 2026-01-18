import {
  AlreadyExistsError,
  FileSystemError,
  NotFoundError,
  PermissionDeniedError,
  UnknownFSError,
} from "@/services/file-system"
import { Match } from "effect"
import { describe, expect, test } from "vitest"

describe("FileSystemError tagged classes", () => {
  describe("NotFoundError", () => {
    test("creates instance with correct _tag", () => {
      const error = new NotFoundError({
        path: "/test/path",
        description: "file not found",
      })
      expect(error._tag).toBe("NotFoundError")
      expect(error.path).toBe("/test/path")
      expect(error.description).toBe("file not found")
    })

    test("is matched by Match.tag", () => {
      const error: FileSystemError = new NotFoundError({
        path: "/test/path",
        description: "file not found",
      })
      const result = Match.value(error).pipe(
        Match.tag("NotFoundError", (e) => `not found: ${e.path}`),
        Match.orElse(() => "other")
      )
      expect(result).toBe("not found: /test/path")
    })
  })

  describe("PermissionDeniedError", () => {
    test("creates instance with correct _tag", () => {
      const error = new PermissionDeniedError({
        path: "/protected/path",
        description: "permission denied",
      })
      expect(error._tag).toBe("PermissionDeniedError")
      expect(error.path).toBe("/protected/path")
      expect(error.description).toBe("permission denied")
    })

    test("is matched by Match.tag", () => {
      const error: FileSystemError = new PermissionDeniedError({
        path: "/protected/path",
        description: "permission denied",
      })
      const result = Match.value(error).pipe(
        Match.tag(
          "PermissionDeniedError",
          (e) => `permission denied: ${e.path}`
        ),
        Match.orElse(() => "other")
      )
      expect(result).toBe("permission denied: /protected/path")
    })
  })

  describe("AlreadyExistsError", () => {
    test("creates instance with correct _tag", () => {
      const error = new AlreadyExistsError({
        path: "/existing/path",
        description: "file already exists",
      })
      expect(error._tag).toBe("AlreadyExistsError")
      expect(error.path).toBe("/existing/path")
      expect(error.description).toBe("file already exists")
    })

    test("is matched by Match.tag", () => {
      const error: FileSystemError = new AlreadyExistsError({
        path: "/existing/path",
        description: "file already exists",
      })
      const result = Match.value(error).pipe(
        Match.tag("AlreadyExistsError", (e) => `already exists: ${e.path}`),
        Match.orElse(() => "other")
      )
      expect(result).toBe("already exists: /existing/path")
    })
  })

  describe("UnknownFSError", () => {
    test("creates instance with correct _tag", () => {
      const error = new UnknownFSError({
        path: "/some/path",
        description: "unknown error occurred",
      })
      expect(error._tag).toBe("UnknownFSError")
      expect(error.path).toBe("/some/path")
      expect(error.description).toBe("unknown error occurred")
    })

    test("is matched by Match.tag", () => {
      const error: FileSystemError = new UnknownFSError({
        path: "/some/path",
        description: "unknown error occurred",
      })
      const result = Match.value(error).pipe(
        Match.tag("UnknownFSError", (e) => `unknown: ${e.path}`),
        Match.orElse(() => "other")
      )
      expect(result).toBe("unknown: /some/path")
    })

    test("allows optional path", () => {
      const error = new UnknownFSError({ description: "error without path" })
      expect(error._tag).toBe("UnknownFSError")
      expect(error.path).toBeUndefined()
      expect(error.description).toBe("error without path")
    })
  })

  describe("type-safe pattern matching", () => {
    test("Match.orElse handles remaining cases", () => {
      const handleError = (error: FileSystemError): string =>
        Match.value(error).pipe(
          Match.tag("PermissionDeniedError", () => "access denied"),
          Match.orElse(() => "other error")
        )

      expect(
        handleError(
          new PermissionDeniedError({ description: "test", path: "/a" })
        )
      ).toBe("access denied")
      expect(
        handleError(new NotFoundError({ description: "test", path: "/a" }))
      ).toBe("other error")
      expect(
        handleError(new AlreadyExistsError({ description: "test", path: "/a" }))
      ).toBe("other error")
      expect(
        handleError(new UnknownFSError({ description: "test", path: "/a" }))
      ).toBe("other error")
    })

    test("multiple Match.tag calls narrow types correctly", () => {
      const handleError = (error: FileSystemError): string =>
        Match.value(error).pipe(
          Match.tag("NotFoundError", () => "not found"),
          Match.tag("PermissionDeniedError", () => "permission denied"),
          Match.orElse(() => "other")
        )

      expect(
        handleError(new NotFoundError({ description: "test", path: "/a" }))
      ).toBe("not found")
      expect(
        handleError(
          new PermissionDeniedError({ description: "test", path: "/b" })
        )
      ).toBe("permission denied")
      expect(
        handleError(new AlreadyExistsError({ description: "test", path: "/c" }))
      ).toBe("other")
    })
  })
})
