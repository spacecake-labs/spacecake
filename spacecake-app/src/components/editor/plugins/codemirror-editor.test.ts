import { EditorState, Extension } from "@codemirror/state"
import { describe, expect, it } from "vitest"

import { LANGUAGE_SUPPORT } from "@/types/language"
import { getLanguageSupport } from "@/components/editor/plugins/codemirror-editor"

describe("CodeMirror language support", () => {
  it("all configured languages (except plaintext) have accessible CodeMirror support", async () => {
    // Get all languages from LANGUAGE_SUPPORT
    const languages = Object.values(LANGUAGE_SUPPORT)

    // Test each language (skip plaintext as it has no syntax highlighting)
    for (const languageSpec of languages) {
      const { name, codemirrorName } = languageSpec

      // Skip plaintext - it's a fallback type with no syntax highlighting
      if (codemirrorName === "plaintext") {
        continue
      }

      // Get the language support extension
      const extension = await getLanguageSupport(codemirrorName)

      // Verify extension is available
      expect(
        extension,
        `${name} (${codemirrorName}) should have a valid CodeMirror extension`
      ).not.toBeNull()

      // Verify the extension is valid (can be used to create an EditorState)
      expect(() => {
        EditorState.create({
          doc: `// test code for ${codemirrorName}`,
          extensions: extension as Extension,
        })
      }, `${name} (${codemirrorName}) extension should be valid and work with EditorState`).not.toThrow()
    }
  })
})
