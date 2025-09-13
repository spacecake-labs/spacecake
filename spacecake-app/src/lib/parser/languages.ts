import path from "path"

import { Language, Parser } from "web-tree-sitter"

export type LanguageName = "python" | "javascript" | "typescript" | "json"

function languageURL(name: LanguageName): string {
  const basePath = process.cwd()
  return path.join(
    basePath,
    `node_modules/tree-sitter-${name}/tree-sitter-${name}.wasm`
  )
}

export default Parser.init().then(async () => ({
  languageURL,
  Python: await Language.load(languageURL("python")),
  //   JavaScript: await Language.load(languageURL("javascript")),
  //   TypeScript: await Language.load(languageURL("typescript")),
  //   JSON: await Language.load(languageURL("json")),
}))
