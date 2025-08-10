import { JSX, useEffect } from "react";
import { useTheme } from "@/components/theme-provider";
import { registerCodeHighlighting, ShikiTokenizer } from "@lexical/code-shiki";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

export function CodeHighlightPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const { theme } = useTheme();

  useEffect(() => {
    return registerCodeHighlighting(editor, {
      ...ShikiTokenizer,
      defaultLanguage: "javascript",
      defaultTheme:
        theme === "dark" ? "github-dark-default" : "github-light-default",
    });
  }, [editor, theme]);

  return null;
}
