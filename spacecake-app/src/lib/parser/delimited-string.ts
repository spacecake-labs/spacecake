import type { DelimitedString } from "@/types/parser";

export function parseDelimitedString(
  text: string,
  patterns: {
    prefixPattern: RegExp;
    suffixPattern: RegExp;
  }
): DelimitedString {
  const prefixMatch = text.match(patterns.prefixPattern);
  const suffixMatch = text.match(patterns.suffixPattern);

  if (!prefixMatch || !suffixMatch) {
    return { prefix: "", between: text, suffix: "" };
  }

  // Prefix: from start of text to end of prefix pattern
  const prefixEnd = prefixMatch.index! + prefixMatch[0].length;
  const prefix = text.slice(0, prefixEnd);

  // Suffix: from start of suffix pattern to end of text
  const suffixStart = suffixMatch.index!;
  const suffix = text.slice(suffixStart);

  // Between: everything in between
  const between = text.slice(prefixEnd, suffixStart);

  return { prefix, between, suffix };
}
