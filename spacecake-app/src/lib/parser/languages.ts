import Parser from "tree-sitter"
import Python from "tree-sitter-python"

export type { Parser }
export type SyntaxNode = Parser.SyntaxNode

export function createParser(): Parser {
  const parser = new Parser()
  parser.setLanguage(Python as unknown as Parser.Language)
  return parser
}
