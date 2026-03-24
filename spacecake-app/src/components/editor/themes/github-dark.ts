/**
 * GitHub Dark theme for CodeMirror 6
 * Converted from the official GitHub VSCode theme
 */

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { tags } from "@lezer/highlight"

const colors = {
  background: "#0d1117",
  foreground: "#e6edf3",
  cursor: "#2f81f7",
  selection: "#3fb95040",
  lineHighlight: "#6e76811a",
  gutterBackground: "#0d1117",
  gutterForeground: "#6e7681",
  gutterActiveForeground: "#e6edf3",
  gutterBorder: "#30363d",

  // Syntax colors
  comment: "#8b949e",
  constant: "#79c0ff",
  entity: "#d2a8ff",
  keyword: "#ff7b72",
  storage: "#ff7b72",
  string: "#a5d6ff",
  support: "#79c0ff",
  variable: "#ffa657",
  variableOther: "#e6edf3",
  tag: "#7ee787",
  regexp: "#a5d6ff",
  invalid: "#ffa198",
}

const editorTheme = EditorView.theme(
  {
    "&": {
      color: colors.foreground,
      backgroundColor: colors.background,
      fontSize: "13px",
      fontFamily: "'JetBrains Mono', monospace",
    },
    ".cm-content, .cm-gutters": {
      fontFamily: "'JetBrains Mono', monospace",
    },
    ".cm-content": {
      caretColor: colors.cursor,
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: colors.cursor,
    },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: colors.selection,
      },
    ".cm-panels": {
      backgroundColor: colors.background,
      color: colors.foreground,
    },
    ".cm-panels.cm-panels-top": {
      position: "sticky",
      top: 0,
      zIndex: 10,
      height: 0,
      overflow: "visible",
      border: "none",
      background: "transparent",
      padding: 0,
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: `1px solid ${colors.gutterBorder}`,
    },
    ".cm-searchMatch": {
      backgroundColor: "#9e6a03",
      outline: "1px solid #f2cc6080",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "#f2cc6080",
    },
    // search panel
    ".cm-panel.cm-search": {
      position: "absolute",
      top: "8px",
      right: "12px",
      zIndex: 10,
      width: "auto",
      maxWidth: "calc(100% - 24px)",
      borderRadius: "8px",
      border: `1px solid ${colors.gutterBorder}`,
      padding: "6px 8px",
      paddingRight: "28px",
      gap: "6px",
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      backgroundColor: "#161b22",
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "12px",
      "& label": {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "11px",
        color: "#8b949e",
        cursor: "pointer",
        "&:hover": {
          color: "#e6edf3",
        },
      },
      "& input[type=checkbox]": {
        width: "14px",
        height: "14px",
        cursor: "pointer",
        appearance: "none" as const,
        borderRadius: "3px",
        border: "1px solid rgba(139, 149, 158, 0.6)",
        backgroundColor: "#0d1117",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        transition: "border-color 0.15s, background-color 0.15s",
        verticalAlign: "middle",
        "&:hover": {
          borderColor: "#8b949e",
        },
        "&:checked": {
          borderColor: "rgba(52, 211, 153, 0.3)",
          backgroundColor: "rgba(52, 211, 153, 0.06)",
          backgroundImage:
            "url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22%2334d399%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%200%201%200%201.414l-5%205a1%201%200%200%201-1.414%200l-2-2a1%201%200%200%201%201.414-1.414L6.5%209.086l4.293-4.293a1%201%200%200%201%201.414%200z%22%2F%3E%3C%2Fsvg%3E')",
        },
      },
      "& br": {
        display: "none",
      },
      "& [name=close]": {
        position: "absolute",
        top: "6px",
        right: "6px",
        padding: "4px",
        fontSize: "16px",
        lineHeight: "1",
        cursor: "pointer",
        opacity: "0.7",
        transition: "opacity 0.15s, background-color 0.15s",
        borderRadius: "4px",
        border: "none",
        background: "transparent",
        color: "#e6edf3",
        "&:hover": {
          opacity: "1",
          backgroundColor: "rgba(255, 255, 255, 0.1)",
        },
      },
    },
    ".cm-panel.cm-search .cm-textfield::placeholder": {
      textTransform: "lowercase",
    },
    // find input stretches to fill row; replace input stays natural width
    ".cm-panel.cm-search input[name=search].cm-textfield": {
      flex: "1 1 120px",
    },
    ".cm-panel.cm-search .cm-textfield": {
      backgroundColor: "#0d1117",
      border: "1px solid #30363d",
      borderRadius: "6px",
      color: "#e6edf3",
      padding: "4px 8px",
      fontSize: "12px",
      fontFamily: "'JetBrains Mono', monospace",
      outline: "none",
      minWidth: "120px",
      height: "26px",
      boxSizing: "border-box" as const,
      "&:focus": {
        borderColor: "#2f81f7",
        boxShadow: "0 0 0 1px #2f81f7",
      },
    },
    ".cm-panel.cm-search .cm-button": {
      backgroundColor: "#21262d",
      border: "1px solid #30363d",
      borderRadius: "6px",
      color: "#e6edf3",
      padding: "4px 8px",
      fontSize: "11px",
      fontFamily: "'JetBrains Mono', monospace",
      cursor: "pointer",
      whiteSpace: "nowrap" as const,
      height: "26px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      boxSizing: "border-box" as const,
      "&:hover": {
        backgroundColor: "#30363d",
        borderColor: "#8b949e",
      },
      "&:active": {
        backgroundColor: "#282e33",
      },
    },
    // icon-only nav buttons
    ".cm-panel.cm-search button[name=next]": {
      fontSize: 0,
      lineHeight: 0,
      width: "26px",
      padding: 0,
      "&::after": {
        content: "'↓'",
        fontSize: "12px",
        lineHeight: "1",
      },
    },
    ".cm-panel.cm-search button[name=prev]": {
      fontSize: 0,
      lineHeight: 0,
      width: "26px",
      padding: 0,
      "&::after": {
        content: "'↑'",
        fontSize: "12px",
        lineHeight: "1",
      },
    },
    ".cm-activeLine": {
      backgroundColor: colors.lineHighlight,
    },
    ".cm-selectionMatch": {
      backgroundColor: "#3fb95040",
    },
    "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
      backgroundColor: "#3fb95040",
    },
    ".cm-gutters": {
      backgroundColor: colors.gutterBackground,
      color: colors.gutterForeground,
      border: "none",
      borderRight: `1px solid ${colors.gutterBorder}`,
    },
    ".cm-activeLineGutter": {
      backgroundColor: colors.lineHighlight,
      color: colors.gutterActiveForeground,
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "transparent",
      border: "none",
      color: colors.comment,
    },
    ".cm-tooltip": {
      border: `1px solid ${colors.gutterBorder}`,
      backgroundColor: "#161b22",
      color: colors.foreground,
    },
    ".cm-tooltip .cm-tooltip-arrow:before": {
      borderTopColor: "transparent",
      borderBottomColor: "transparent",
    },
    ".cm-tooltip .cm-tooltip-arrow:after": {
      borderTopColor: "#161b22",
      borderBottomColor: "#161b22",
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li[aria-selected]": {
        backgroundColor: "#388bfd26",
        color: colors.foreground,
      },
    },
    ".cm-blame-annotation": {
      color: colors.comment,
      fontSize: "0.85em",
      marginLeft: "3em",
      whiteSpace: "nowrap",
      cursor: "text",
      display: "inline-flex",
      alignItems: "center",
      verticalAlign: "middle",
      gap: "5px",
    },
    ".cm-blame-icon": {
      display: "inline-flex",
      alignItems: "center",
      opacity: "0.7",
    },
    ".cm-blame-tooltip": {
      backgroundColor: "#161b22",
      border: `1px solid ${colors.gutterBorder}`,
      borderRadius: "8px",
      padding: "12px 14px",
      minWidth: "280px",
      maxWidth: "420px",
      fontSize: "13px",
      lineHeight: "1.5",
      color: colors.foreground,
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
    },
    ".cm-blame-tooltip-header": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginBottom: "4px",
    },
    ".cm-blame-tooltip-avatar": {
      borderRadius: "4px",
      flexShrink: "0",
    },
    ".cm-blame-tooltip-author": {
      fontWeight: "600",
      fontSize: "14px",
    },
    ".cm-blame-tooltip-email": {
      color: colors.comment,
      fontSize: "12px",
      marginBottom: "8px",
    },
    ".cm-blame-tooltip-summary": {
      marginBottom: "8px",
    },
    ".cm-blame-tooltip-footer": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderTop: `1px solid ${colors.gutterBorder}`,
      paddingTop: "8px",
    },
    ".cm-blame-tooltip-date": {
      color: colors.comment,
      fontSize: "12px",
    },
    ".cm-blame-tooltip-hash-group": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
    },
    ".cm-blame-tooltip-branch-icon": {
      display: "inline-flex",
      alignItems: "center",
      color: colors.comment,
    },
    ".cm-blame-tooltip-hash": {
      color: colors.constant,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "12px",
    },
    ".cm-blame-tooltip-copy": {
      background: "none",
      border: "none",
      color: colors.comment,
      cursor: "pointer",
      padding: "2px",
      display: "inline-flex",
      alignItems: "center",
      borderRadius: "3px",
      "&:hover": {
        color: colors.foreground,
        backgroundColor: "rgba(255, 255, 255, 0.1)",
      },
    },
  },
  { dark: true },
)

const highlightStyle = HighlightStyle.define([
  // Comments
  { tag: tags.comment, color: colors.comment },
  { tag: tags.lineComment, color: colors.comment },
  { tag: tags.blockComment, color: colors.comment },
  { tag: tags.docComment, color: colors.comment },

  // Constants
  { tag: tags.constant(tags.name), color: colors.constant },
  { tag: tags.constant(tags.variableName), color: colors.constant },
  { tag: tags.bool, color: colors.constant },
  { tag: tags.number, color: colors.constant },
  { tag: tags.integer, color: colors.constant },
  { tag: tags.float, color: colors.constant },

  // Function names (purple)
  { tag: tags.function(tags.variableName), color: colors.entity },
  { tag: tags.function(tags.propertyName), color: colors.entity },
  {
    tag: tags.definition(tags.function(tags.variableName)),
    color: colors.entity,
  },

  // Type/Class names (orange)
  { tag: tags.className, color: colors.variable },
  { tag: tags.definition(tags.className), color: colors.variable },
  { tag: tags.definition(tags.typeName), color: colors.variable },
  { tag: tags.typeName, color: colors.variable },
  { tag: tags.namespace, color: colors.variable },

  // Variables
  { tag: tags.variableName, color: colors.variableOther },
  { tag: tags.definition(tags.variableName), color: colors.variableOther },
  { tag: tags.special(tags.variableName), color: colors.variable }, // this, self
  { tag: tags.local(tags.variableName), color: colors.variableOther },

  // Property names (blue)
  { tag: tags.propertyName, color: colors.support },
  { tag: tags.definition(tags.propertyName), color: colors.support },

  // Keywords
  { tag: tags.keyword, color: colors.keyword },
  { tag: tags.modifier, color: colors.keyword },
  { tag: tags.controlKeyword, color: colors.keyword },
  { tag: tags.operatorKeyword, color: colors.keyword },
  { tag: tags.definitionKeyword, color: colors.keyword },
  { tag: tags.moduleKeyword, color: colors.keyword },

  // Storage/Types
  { tag: tags.typeOperator, color: colors.keyword },
  { tag: tags.derefOperator, color: colors.foreground },

  // Strings
  { tag: tags.string, color: colors.string },
  { tag: tags.special(tags.string), color: colors.string },
  { tag: tags.character, color: colors.string },
  { tag: tags.docString, color: colors.string },

  // Regex
  { tag: tags.regexp, color: colors.regexp },

  // Tags (HTML/JSX)
  { tag: tags.tagName, color: colors.tag },
  { tag: tags.angleBracket, color: colors.foreground },
  { tag: tags.attributeName, color: colors.entity },
  { tag: tags.attributeValue, color: colors.string },

  // Support/Built-ins
  { tag: tags.standard(tags.name), color: colors.support },
  { tag: tags.standard(tags.variableName), color: colors.support },
  {
    tag: tags.standard(tags.function(tags.variableName)),
    color: colors.support,
  },
  { tag: tags.standard(tags.typeName), color: colors.support },

  // Operators & Punctuation
  { tag: tags.operator, color: colors.keyword },
  { tag: tags.punctuation, color: colors.foreground },
  { tag: tags.paren, color: colors.foreground },
  { tag: tags.squareBracket, color: colors.foreground },
  { tag: tags.brace, color: colors.foreground },
  { tag: tags.separator, color: colors.foreground },

  // Meta
  { tag: tags.meta, color: colors.foreground },
  { tag: tags.annotation, color: colors.entity },
  { tag: tags.self, color: colors.variable },

  // Labels
  { tag: tags.labelName, color: colors.variable },

  // Invalid
  { tag: tags.invalid, color: colors.invalid, fontStyle: "italic" },

  // Markup
  { tag: tags.heading, color: colors.constant, fontWeight: "bold" },
  { tag: tags.heading1, color: colors.constant, fontWeight: "bold" },
  { tag: tags.heading2, color: colors.constant, fontWeight: "bold" },
  { tag: tags.heading3, color: colors.constant, fontWeight: "bold" },
  { tag: tags.quote, color: colors.tag },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.link, color: colors.regexp, textDecoration: "underline" },
  { tag: tags.strikethrough, textDecoration: "line-through" },

  // Inserted/Deleted
  { tag: tags.inserted, color: "#7ee787" },
  { tag: tags.deleted, color: "#ffa198" },
  { tag: tags.changed, color: "#ffa657" },
])

export const githubDark: Extension = [editorTheme, syntaxHighlighting(highlightStyle)]
