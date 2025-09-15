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

export default Parser.init().then(async () => ({
  languageURL,
  Python: await Language.load(languageURL("python")),
  //   JavaScript: await Language.load(languageURL("javascript")),
  //   TypeScript: await Language.load(languageURL("typescript")),
  //   JSON: await Language.load(languageURL("json")),
}))
