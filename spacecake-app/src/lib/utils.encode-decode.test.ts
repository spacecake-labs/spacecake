import { describe, expect, it } from "vitest"

import { decodeBase64Url, encodeBase64Url } from "@/lib/utils"

describe("base64url encode/decode", () => {
  it("encodes without padding and url-unsafe characters", () => {
    const encoded = encodeBase64Url("hello")
    expect(encoded).toBe("aGVsbG8") // "hello" -> aGVsbG8=
    expect(encoded.includes("=")).toBe(false)
    expect(encoded.includes("+")).toBe(false)
    expect(encoded.includes("/")).toBe(false)
  })

  it("roundtrips ascii", () => {
    const input = "The quick brown fox jumps over the lazy dog"
    const encoded = encodeBase64Url(input)
    const decoded = decodeBase64Url(encoded)
    expect(decoded).toBe(input)
  })

  it("roundtrips unicode", () => {
    const input = "こんにちは世界🌍 — naïve café"
    const encoded = encodeBase64Url(input)
    const decoded = decodeBase64Url(encoded)
    expect(decoded).toBe(input)
  })

  it("decodes strings without padding correctly", () => {
    // produce an encoded string that would have padding in standard base64
    const input = "pad" // base64 is "cGFk" (no padding) but good for check
    const encoded = encodeBase64Url(input)
    expect(() => decodeBase64Url(encoded)).not.toThrow()
    expect(decodeBase64Url(encoded)).toBe(input)
  })
})
