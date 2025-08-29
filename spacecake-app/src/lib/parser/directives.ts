import { Option, Schema } from "effect"

import { contextLanguageFromCode } from "@/types/language"
import { Directive, DirectiveSchema } from "@/types/parser"
import {
  DIRECTIVE_PATTERN,
  EMPTY_PATTERN,
  PYTHON_COMMENT_PREFIX_PATTERN,
} from "@/lib/parser/regex"

export function parseDirective(
  line: string,
  prefixPattern: RegExp = EMPTY_PATTERN
): Option.Option<Directive> {
  const pattern = new RegExp(
    `^(${prefixPattern.source})${DIRECTIVE_PATTERN.source}`,
    "ms"
  )

  const match = line.match(pattern)

  if (!match) return Option.none()

  const [, prefix, languageCode, kind, content] = match

  const language = contextLanguageFromCode(languageCode)

  return Option.match(language, {
    onNone: () => Option.none(),
    onSome: (language) => {
      return Schema.decodeUnknownOption(DirectiveSchema)({
        kind: `${language} ${kind === "::" ? "block" : "inline"}`,
        content: {
          prefix: prefix,
          between: content,
          suffix: "",
        },
      })
    },
  })
}

export function parsePythonDirective(
  comment: string
): Option.Option<Directive> {
  return parseDirective(comment, PYTHON_COMMENT_PREFIX_PATTERN)
}
