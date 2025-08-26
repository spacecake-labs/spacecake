/**
 * fnv-1a 64-bit hash for strings, output as zero-padded 16-char hex.
 * fast, non-crypto; suitable for change detection and cache keys.
 *
 * note: processes the lower 8 bits of each UTF-16 code unit, matching our
 * previous implementation semantics and keeping cids stable.
 */
export function fnv1a64Hex(input: string): string {
  let hash = 0xcbf29ce484222325n // offset basis
  const prime = 0x100000001b3n // fnv prime
  const mask64 = 0xffffffffffffffffn

  for (let i = 0; i < input.length; i++) {
    // xor lower 8 bits (byte-wise)
    hash ^= BigInt(input.charCodeAt(i) & 0xff)
    hash = (hash * prime) & mask64
  }

  return hash.toString(16).padStart(16, "0")
}
