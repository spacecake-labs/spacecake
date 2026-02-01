import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  LexicalTypeaheadMenuPlugin,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { TextNode } from "lexical"
import { useCallback, useMemo, useState } from "react"
import * as ReactDOM from "react-dom"

import { SlashCommandMenu } from "@/components/editor/slash-commands/slash-command-menu"
import {
  slashCommandOptions,
  type SlashCommandOption,
} from "@/components/editor/slash-commands/slash-command-options"
import { useRoute } from "@/hooks/use-route"
import { fileTypeToCodeMirrorLanguage } from "@/lib/language-support"

export function SlashCommandPlugin(): React.JSX.Element {
  const [editor] = useLexicalComposerContext()
  const route = useRoute()
  const language = route?.fileType ? fileTypeToCodeMirrorLanguage(route.fileType) : "plaintext"
  // const [, showModal] = useModal()
  const [queryString, setQueryString] = useState<string | null>(null)

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch("/", {
    allowWhitespace: true,
    minLength: 0,
  })

  const options = useMemo(() => {
    const baseOptions = slashCommandOptions(editor, language) // , showModal

    if (!queryString) {
      return baseOptions
    }

    const regex = new RegExp(queryString, "i")

    return baseOptions.filter(
      (option) =>
        regex.test(option.title) || option.keywords.some((keyword) => regex.test(keyword)),
    )
  }, [queryString, editor, language])

  const onSelectOption = useCallback(
    (
      selectedOption: SlashCommandOption,
      nodeToRemove: TextNode | null,
      closeMenu: () => void,
      matchingString: string,
    ) => {
      editor.update(() => {
        nodeToRemove?.remove()
        // call the command
        selectedOption.onSelect(matchingString)
        closeMenu()
      })
    },
    [editor],
  )

  return (
    <LexicalTypeaheadMenuPlugin<SlashCommandOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={options}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) =>
        anchorElementRef.current && options.length
          ? ReactDOM.createPortal(
              <SlashCommandMenu
                options={options}
                selectedIndex={selectedIndex}
                selectOptionAndCleanUp={selectOptionAndCleanUp}
                setHighlightedIndex={setHighlightedIndex}
              />,
              anchorElementRef.current,
            )
          : null
      }
    />
  )
}
