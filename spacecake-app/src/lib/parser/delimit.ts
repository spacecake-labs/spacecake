import type { DelimitedString, RegexDelimiters, StringDelimiters } from "@/types/parser"

import { SPACE_CONSUMER_PATTERN } from "@/lib/parser/regex"

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Generic function: Parse text using delimiters to extract prefix, between, and after parts.
 * Pure function: string → StringDelimiters → DelimitedString
 */
export function delimitString(text: string, delimiters: StringDelimiters): DelimitedString {
  // The 's' flag allows the '.' to match newline characters.
  const pattern = new RegExp(
    `^(${escapeRegex(delimiters.prefix)})(.*)(${escapeRegex(delimiters.suffix)})$`,
    "s",
  )
  const match = text.match(pattern)

  if (match) {
    const [, prefix, between, suffix] = match
    return {
      prefix,
      between: between,
      suffix: suffix,
    }
  }

  return {
    prefix: "",
    between: text,
    suffix: "",
  }
}

/**
 * Generic function: Parse text using regex delimiters to extract prefix, between, and after parts.
 * Pure function: string → RegexDelimiters → DelimitedString
 */
export function delimitStringWithRegex(text: string, delimiters: RegexDelimiters): DelimitedString {
  // The 's' flag allows the '.' to match newline characters.
  const pattern = new RegExp(
    `^(${delimiters.prefix.source})(.*?)(${delimiters.suffix.source})$`,
    "s",
  )

  const match = text.match(pattern)

  if (match) {
    const [, prefix, between, suffix] = match
    return {
      prefix,
      between: between,
      suffix: suffix,
    }
  }

  return {
    prefix: "",
    between: text,
    suffix: "",
  }
}

export function delimitWithSpaceConsumer(text: string): DelimitedString {
  return delimitStringWithRegex(text, {
    prefix: SPACE_CONSUMER_PATTERN, // consume any leading whitespace and newlines
    suffix: SPACE_CONSUMER_PATTERN, // consume any trailing whitespace and newlines
  })
}
