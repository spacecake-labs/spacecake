import { JSX, useEffect } from "react"
import { registerCodeHighlighting, ShikiTokenizer } from "@lexical/code-shiki"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"

import { useTheme } from "@/components/theme-provider"

export function CodeHighlightPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext()
  const { theme } = useTheme()

  useEffect(() => {
    return registerCodeHighlighting(editor, {
      ...ShikiTokenizer,
      defaultLanguage: "javascript",
      defaultTheme:
        theme === "dark" ? "github-dark-default" : "github-light-default",
    })
  }, [editor, theme])

  return null
}
