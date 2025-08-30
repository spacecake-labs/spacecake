import { DelimitedString } from "@/types/parser"
import { delimitStringWithRegex } from "@/lib/parser/delimit"
import {
  EMPTY_PATTERN,
  PYTHON_COMMENT_PREFIX_PATTERN,
} from "@/lib/parser/regex"

export function delimitPythonComment(line: string): DelimitedString {
  return delimitStringWithRegex(line, {
    prefix: PYTHON_COMMENT_PREFIX_PATTERN,
    suffix: EMPTY_PATTERN,
  })
}

/**
 * Convert a docstring block to markdown header text.
 */
export function delimitPythonDocString(text: string): DelimitedString {
  // parseDelimitedString handles all the pattern matching automatically
  return delimitStringWithRegex(text, {
    prefix: /r?"""/, // consume r""" or """ at start
    suffix: /"""/, // consume """ at end
  })
}

export function stripPythonCommentPrefixes(text: string): string {
  return text.replace(/^#\s?/gm, "")
}

export function stripPythonMdocPrefixes(text: string): string {
  return text.replace(/^#🍰\s?/gm, "")
}

export function addPythonMdocPrefixes(text: string): string {
  return `#🍰 ${text}`.replace(/\n/g, "\n#🍰 ")
}
