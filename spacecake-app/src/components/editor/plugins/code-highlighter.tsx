import { JSX, useEffect } from "react";
import { registerCodeHighlighting, ShikiTokenizer } from "@lexical/code-shiki";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

export function CodeHighlightPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return registerCodeHighlighting(editor, {
      ...ShikiTokenizer,
      defaultLanguage: "javascript",
      defaultTheme: "github-dark-default",
    });
  }, [editor]);

  return null;
}
