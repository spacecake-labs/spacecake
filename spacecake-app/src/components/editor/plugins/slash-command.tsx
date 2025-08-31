import { useCallback, useMemo, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { TextNode } from "lexical"
import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Minus,
  Quote,
  Type,
} from "lucide-react"
import * as ReactDOM from "react-dom"

import { SlashCommandMenu } from "@/components/slash-command-menu"

class SlashCommandOption extends MenuOption {
  title: string
  icon?: React.ReactElement
  keywords: Array<string>
  keyboardShortcut?: string
  onSelect: (queryString: string) => void

  constructor(
    title: string,
    options: {
      icon?: React.ReactElement
      keywords?: Array<string>
      keyboardShortcut?: string
      onSelect: (queryString: string) => void
    }
  ) {
    super(title)
    this.title = title
    this.keywords = options.keywords || []
    this.icon = options.icon
    this.keyboardShortcut = options.keyboardShortcut
    this.onSelect = options.onSelect.bind(this)
  }
}

function getSlashCommandOptions() {
  return [
    new SlashCommandOption("code", {
      icon: <Code className="w-4 h-4" />,
      keywords: ["code", "block", "snippet", "javascript", "python"],
      onSelect: () => {
        // placeholder for code block action
      },
    }),
    new SlashCommandOption("text", {
      icon: <Type className="w-4 h-4" />,
      keywords: ["normal", "paragraph", "p", "text"],
      onSelect: () => {
        // placeholder for paragraph action
      },
    }),
    new SlashCommandOption("heading 1", {
      icon: <Heading1 className="w-4 h-4" />,
      keywords: ["heading", "header", "h1", "title"],
      onSelect: () => {
        // placeholder for heading 1 action
      },
    }),
    new SlashCommandOption("heading 2", {
      icon: <Heading2 className="w-4 h-4" />,
      keywords: ["heading", "header", "h2", "subtitle"],
      onSelect: () => {
        // placeholder for heading 2 action
      },
    }),
    new SlashCommandOption("heading 3", {
      icon: <Heading3 className="w-4 h-4" />,
      keywords: ["heading", "header", "h3"],
      onSelect: () => {
        // placeholder for heading 3 action
      },
    }),
    new SlashCommandOption("bullet list", {
      icon: <List className="w-4 h-4" />,
      keywords: ["bullet", "list", "ul", "unordered"],
      onSelect: () => {
        // placeholder for bullet list action
      },
    }),
    new SlashCommandOption("numbered list", {
      icon: <ListOrdered className="w-4 h-4" />,
      keywords: ["numbered", "list", "ol", "ordered"],
      onSelect: () => {
        // placeholder for numbered list action
      },
    }),
    new SlashCommandOption("quote", {
      icon: <Quote className="w-4 h-4" />,
      keywords: ["quote", "blockquote", "citation"],
      onSelect: () => {
        // placeholder for quote action
      },
    }),
    new SlashCommandOption("divider", {
      icon: <Minus className="w-4 h-4" />,
      keywords: ["divider", "horizontal rule", "hr", "separator"],
      onSelect: () => {
        // placeholder for divider action
      },
    }),
  ]
}

export function SlashCommandPlugin(): React.JSX.Element {
  const [editor] = useLexicalComposerContext()
  const [queryString, setQueryString] = useState<string | null>(null)

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch("/", {
    allowWhitespace: true,
    minLength: 0,
  })

  const options = useMemo(() => {
    const baseOptions = getSlashCommandOptions()

    if (!queryString) {
      return baseOptions
    }

    const regex = new RegExp(queryString, "i")

    return baseOptions.filter(
      (option) =>
        regex.test(option.title) ||
        option.keywords.some((keyword) => regex.test(keyword))
    )
  }, [queryString])

  const onSelectOption = useCallback(
    (
      selectedOption: SlashCommandOption,
      nodeToRemove: TextNode | null,
      closeMenu: () => void,
      matchingString: string
    ) => {
      editor.update(() => {
        nodeToRemove?.remove()
        selectedOption.onSelect(matchingString)
        closeMenu()
      })
    },
    [editor]
  )

  return (
    <LexicalTypeaheadMenuPlugin<SlashCommandOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={options}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) =>
        anchorElementRef.current && options.length
          ? ReactDOM.createPortal(
              <SlashCommandMenu
                options={options}
                selectedIndex={selectedIndex}
                selectOptionAndCleanUp={selectOptionAndCleanUp}
                setHighlightedIndex={setHighlightedIndex}
              />,
              anchorElementRef.current
            )
          : null
      }
    />
  )
}
