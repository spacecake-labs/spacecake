/**
 * GitHub Light theme for CodeMirror 6
 * Converted from the official GitHub VSCode theme
 */

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { tags } from "@lezer/highlight"

const colors = {
  background: "#ffffff",
  foreground: "#1f2328",
  cursor: "#0969da",
  selection: "#4ac26b40",
  lineHighlight: "#eaeef280",
  gutterBackground: "#ffffff",
  gutterForeground: "#8c959f",
  gutterActiveForeground: "#1f2328",
  gutterBorder: "#d0d7de",

  // Syntax colors
  comment: "#6e7781",
  constant: "#0550ae",
  entity: "#8250df",
  keyword: "#cf222e",
  storage: "#cf222e",
  string: "#0a3069",
  support: "#0550ae",
  variable: "#953800",
  variableOther: "#1f2328",
  tag: "#116329",
  regexp: "#0a3069",
  invalid: "#82071e",
}

const editorTheme = EditorView.theme(
  {
    "&": {
      color: colors.foreground,
      backgroundColor: colors.background,
      fontSize: "13px",
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
      borderBottom: `1px solid ${colors.gutterBorder}`,
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: `1px solid ${colors.gutterBorder}`,
    },
    ".cm-searchMatch": {
      backgroundColor: "#bf8700",
      outline: "1px solid #fae17d80",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "#fae17d80",
    },
    ".cm-activeLine": {
      backgroundColor: colors.lineHighlight,
    },
    ".cm-selectionMatch": {
      backgroundColor: "#4ac26b40",
    },
    "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
      backgroundColor: "#4ac26b40",
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
      backgroundColor: "#ffffff",
      color: colors.foreground,
    },
    ".cm-tooltip .cm-tooltip-arrow:before": {
      borderTopColor: "transparent",
      borderBottomColor: "transparent",
    },
    ".cm-tooltip .cm-tooltip-arrow:after": {
      borderTopColor: "#ffffff",
      borderBottomColor: "#ffffff",
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li[aria-selected]": {
        backgroundColor: "#ddf4ff",
        color: colors.foreground,
      },
    },
  },
  { dark: false }
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

  // Type/Class names (brown)
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
  { tag: tags.link, color: colors.string, textDecoration: "underline" },
  { tag: tags.strikethrough, textDecoration: "line-through" },

  // Inserted/Deleted
  { tag: tags.inserted, color: "#116329" },
  { tag: tags.deleted, color: "#82071e" },
  { tag: tags.changed, color: "#953800" },
])

export const githubLight: Extension = [
  editorTheme,
  syntaxHighlighting(highlightStyle),
]
