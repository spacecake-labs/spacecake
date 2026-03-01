import path from "path"
import { Language, Parser } from "web-tree-sitter"

export type LanguageName = "python" | "javascript" | "typescript" | "json"

function languageURL(name: LanguageName): string {
  if (typeof window !== "undefined") {
    // browser environment - load from public directory
    return `tree-sitter-${name}.wasm`
  }
  // Node.js environment (tests) - load from public directory relative to project root
  return path.join(process.cwd(), "public", `tree-sitter-${name}.wasm`)
}

let _cache: { languageURL: typeof languageURL; Python: Language } | null = null

export async function getLanguages() {
  if (_cache) return _cache
  await Parser.init()
  _cache = {
    languageURL,
    Python: await Language.load(languageURL("python")),
  }
  return _cache
}
