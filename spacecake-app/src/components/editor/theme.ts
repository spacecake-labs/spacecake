import { EditorThemeClasses } from "lexical"

import "@/components/editor/theme.css"

export const editorTheme: EditorThemeClasses = {
  ltr: "text-left",
  rtl: "text-right",
  heading: {
    h1: "text-block mt-6 mb-2 font-semibold text-3xl",
    h2: "text-block mt-6 mb-2 font-semibold text-2xl",
    h3: "text-block mt-6 mb-2 font-semibold text-xl",
    h4: "text-block mt-6 mb-2 font-semibold text-lg",
    h5: "text-block mt-6 mb-2 font-semibold text-base",
    h6: "text-block mt-6 mb-2 font-semibold text-sm",
  },
  // EMPTY PARAGRAPH HANDLING - ensures consistent spacing regardless of blank lines in source.
  //
  // Goal: "paragraph → blank line → heading" should look identical to "paragraph → heading".
  // Blank lines in markdown become empty <p><br></p> nodes that would add unwanted extra space.
  //
  // The `.text-block` class marks block elements (headings, paragraphs, quotes, lists, hr).
  // Elements WITHOUT text-block: code blocks, mermaid diagrams, tables (these are "non-text-blocks").
  //
  // COLLAPSE RULES (theme.css):
  // - Never-focused paragraphs: instant collapse, no animation
  // - User-visited paragraphs: animated collapse when user leaves
  // - First hidden paragraph after content: shows fold-vertical icon in margin with poof animation
  //
  // NEGATIVE MARGIN RULE (theme.css): When an empty para follows a NON-text-block (code block,
  // table), we can't collapse it (we want empty paras between consecutive code blocks to remain
  // visible so users can click there). Instead, we use negative margin on the following text
  // element to pull it up, making the spacing match the "no blank line" case.
  //
  // See theme.css for implementations and FocusedNodePlugin for class management.
  paragraph: "text-block leading-7 mt-2 empty-para-collapsible",
  quote: "text-block mt-6 border-l-2 pl-6 italic",
  link: "text-blue-600 hover:underline hover:cursor-pointer",
  list: {
    nested: {
      listitem: "list-none before:hidden after:hidden",
    },
    ul: "text-block my-2 ml-6 list-disc [&>li]:mt-2",
    ol: "text-block my-2 ml-6 list-decimal [&>li]:mt-2",
    checklist: "relative",
    listitemChecked:
      'relative mx-2 px-6 list-none outline-none text-muted-foreground before:content-[""] before:size-4 before:shrink-0 before:rounded-[4px] before:border before:border-primary before:bg-primary before:top-0.5 before:left-0 before:cursor-pointer before:block before:absolute before:shadow-xs before:flex before:items-center before:justify-center after:content-["✓"] after:absolute after:top-0.5 after:left-0 after:w-4 after:h-4 after:text-primary-foreground after:text-xs after:font-bold after:flex after:items-center after:justify-center after:pointer-events-none',
    listitemUnchecked:
      'relative mx-2 px-6 list-none outline-none before:content-[""] before:size-4 before:shrink-0 before:rounded-[4px] before:border before:border-input before:top-0.5 before:left-0 before:cursor-pointer before:block before:absolute before:shadow-xs dark:before:bg-input/30',
  },
  // list: {
  //   checklist: "relative",
  //   listitem: "mx-8",
  // listitemChecked:
  //   'relative mx-2 px-6 list-none outline-none line-through before:content-[""] before:w-4 before:h-4 before:top-0.5 before:left-0 before:cursor-pointer before:block before:bg-cover before:absolute before:border before:border-primary before:rounded before:bg-primary before:bg-no-repeat after:content-[""] after:cursor-pointer after:border-white after:border-solid after:absolute after:block after:top-[6px] after:w-[3px] after:left-[7px] after:right-[7px] after:h-[6px] after:rotate-45 after:border-r-2 after:border-b-2 after:border-l-0 after:border-t-0',
  // listitemUnchecked:
  //   'relative mx-2 px-6 list-none outline-none before:content-[""] before:w-4 before:h-4 before:top-0.5 before:left-0 before:cursor-pointer before:block before:bg-cover before:absolute before:border before:border-primary before:rounded',
  //   nested: {
  //     listitem: "list-none before:hidden after:hidden",
  //   },
  //   ol: "my-6 ml-6 list-decimal [&>li]:mt-2",
  //   olDepth: [
  //     "list-outside !list-decimal",
  //     "list-outside !list-[upper-roman]",
  //     "list-outside !list-[lower-roman]",
  //     "list-outside !list-[upper-alpha]",
  //     "list-outside !list-[lower-alpha]",
  //   ],
  //   ul: "m-0 p-0 list-outside",
  // },
  hashtag: "text-blue-600 bg-blue-100 rounded-md px-1",
  text: {
    bold: "font-bold",
    code: "rounded bg-muted px-1.5 py-0.5 font-mono text-sm",
    italic: "italic",
    strikethrough: "line-through",
    subscript: "sub",
    superscript: "sup",
    underline: "underline",
    underlineStrikethrough: "underline line-through",
  },
  image: "relative inline-block user-select-none cursor-default editor-image",
  inlineImage:
    "relative inline-block user-select-none cursor-default inline-editor-image",
  keyword: "text-purple-900 font-bold",
  // code: "EditorTheme__code",
  // codeHighlight: {
  //   atrule: "EditorTheme__tokenAttr",
  //   attr: "EditorTheme__tokenAttr",
  //   boolean: "EditorTheme__tokenProperty",
  //   builtin: "EditorTheme__tokenSelector",
  //   cdata: "EditorTheme__tokenComment",
  //   char: "EditorTheme__tokenSelector",
  //   class: "EditorTheme__tokenFunction",
  //   "class-name": "EditorTheme__tokenFunction",
  //   comment: "EditorTheme__tokenComment",
  //   constant: "EditorTheme__tokenProperty",
  //   deleted: "EditorTheme__tokenProperty",
  //   doctype: "EditorTheme__tokenComment",
  //   entity: "EditorTheme__tokenOperator",
  //   function: "EditorTheme__tokenFunction",
  //   important: "EditorTheme__tokenVariable",
  //   inserted: "EditorTheme__tokenSelector",
  //   keyword: "EditorTheme__tokenAttr",
  //   namespace: "EditorTheme__tokenVariable",
  //   number: "EditorTheme__tokenProperty",
  //   operator: "EditorTheme__tokenOperator",
  //   prolog: "EditorTheme__tokenComment",
  //   property: "EditorTheme__tokenProperty",
  //   punctuation: "EditorTheme__tokenPunctuation",
  //   regex: "EditorTheme__tokenVariable",
  //   selector: "EditorTheme__tokenSelector",
  //   string: "EditorTheme__tokenSelector",
  //   symbol: "EditorTheme__tokenProperty",
  //   tag: "EditorTheme__tokenProperty",
  //   url: "EditorTheme__tokenOperator",
  //   variable: "EditorTheme__tokenVariable",
  // },
  characterLimit: "!bg-destructive/50",
  table:
    "w-full caption-bottom text-sm border-separate border-spacing-0 border border-border rounded-lg overflow-hidden",
  tableCell:
    "relative border-r border-b border-border p-2 text-sm align-middle text-left [&[align=center]]:text-center [&[align=right]]:text-right [&:last-child]:border-r-0",
  tableCellActionButton:
    "bg-background block border-0 rounded-2xl w-5 h-5 text-foreground cursor-pointer",
  tableCellActionButtonContainer: "block right-1 top-1.5 absolute z-10 w-5 h-5",
  tableCellEditing: "rounded-sm shadow-sm",
  tableCellHeader:
    "bg-muted/80 border-r border-b border-border p-2 h-10 text-sm text-foreground text-left align-middle font-medium [&[align=center]]:text-center [&[align=right]]:text-right [&:last-child]:border-r-0",
  tableCellPrimarySelected:
    "border border-primary border-solid block h-[calc(100%-2px)] w-[calc(100%-2px)] absolute -left-[1px] -top-[1px] z-10",
  tableCellResizer: "absolute -right-1 h-full w-2 cursor-ew-resize z-10 top-0",
  tableCellSelected: "bg-muted",
  tableCellSortedIndicator:
    "block opacity-50 absolute bottom-0 left-0 w-full h-1 bg-muted",
  tableResizeRuler: "block absolute w-[1px] h-full bg-primary top-0",
  tableRowStriping:
    "m-0 p-0 border-b border-border bg-muted/40 hover:bg-muted/50 transition-colors",
  tableSelected: "ring-2 ring-primary ring-offset-2",
  tableSelection: "bg-transparent",
  layoutItem: "border border-dashed px-4 py-2",
  layoutContainer: "grid gap-2.5 my-2.5 mx-0",
  autocomplete: "text-muted-foreground",
  blockCursor: "",
  embedBlock: {
    base: "user-select-none",
    focus: "ring-2 ring-primary ring-offset-2",
  },
  hr: 'text-block p-0.5 border-none my-1 mx-0 cursor-pointer after:content-[""] after:block after:h-0.5 after:bg-muted selected:ring-2 selected:ring-primary selected:ring-offset-2 selected:user-select-none',
  indent: "[--lexical-indent-base-value:40px]",
  mark: "",
  markOverlap: "",
}
