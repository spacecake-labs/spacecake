import { EditorView } from "@codemirror/view"

// hide active line + gutter highlight when editor is not focused
export const focusedActiveLineTheme = EditorView.theme({
  "&:not(.cm-focused) .cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  "&:not(.cm-focused) .cm-activeLine": {
    backgroundColor: "transparent",
  },
})

export const foldPlaceholderTheme = EditorView.theme({
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--primary)",
    color: "var(--primary-foreground)",
    border: "none",
    padding: "0 1ch",
    margin: "0 1px",
    borderRadius: "4px",
  },
})
